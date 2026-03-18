#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import matter from 'gray-matter';
import { loadTranslateConfig } from './lib/translate-config.mjs';
import { getPipelineSteps, materializePipelineArtifacts, resolveExecutionMode } from './translate-orchestrator.mjs';
import { inferAutoProfile } from './lib/auto-profile.mjs';
import { makeSlug } from './transcrab-core.mjs';
import { resolveSourceToMarkdown } from './lib/source-resolver.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');
const CONTENT_ROOT = process.env.TRANSCRAB_CONTENT_ROOT
  ? path.resolve(process.env.TRANSCRAB_CONTENT_ROOT)
  : path.join(ROOT, 'content', 'articles');

function usage() {
  console.log(`Usage:
  node scripts/add-url.mjs <url> [--lang zh] [--mode auto|quick|normal|refined] [--audience <name>] [--style <name>] [--config <path>]

Notes:
  - Fetches HTML and resolves source markdown with fallback extractors
  - Writes source.md + meta.json
  - Generates a translation prompt for the running OpenClaw assistant (does NOT call OpenClaw)
`);
}

function argValue(args, key, def = null) {
  const idx = args.indexOf(key);
  if (idx >= 0 && idx + 1 < args.length) return args[idx + 1];
  return def;
}

const args = process.argv.slice(2);
if (args.length === 0 || args.includes('-h') || args.includes('--help')) {
  usage();
  process.exit(args.length === 0 ? 2 : 0);
}

const url = args[0];
const lang = argValue(args, '--lang', 'zh');
const mode = argValue(args, '--mode', null);
const audience = argValue(args, '--audience', null);
const style = argValue(args, '--style', null);
const configPath = argValue(args, '--config', null);

await fs.mkdir(CONTENT_ROOT, { recursive: true });

const { title, markdown, extraction } = await resolveSourceToMarkdown(url);
const baseSlug = makeSlug(title || url);
const { slug, dir } = await makeUniqueSlugDir(baseSlug);

const now = new Date();
const date = now.toISOString();

const sourceFrontmatter = {
  title: title || slug,
  date,
  sourceUrl: url,
  lang: 'source',
};
const sourceMd = matter.stringify(markdown, sourceFrontmatter);
await fs.writeFile(path.join(dir, 'source.md'), sourceMd, 'utf-8');

const { config: configuredProfile, loadedFromFile, configPath: resolvedConfigPath } = await loadTranslateConfig({
  cwd: ROOT,
  configPath,
  cli: {
    mode,
    audience,
    style,
  },
});

const autoProfile = configuredProfile.mode === 'auto'
  ? inferAutoProfile(markdown, configuredProfile)
  : null;

const translationProfile = autoProfile
  ? {
      ...configuredProfile,
      ...autoProfile.resolved,
      mode: 'auto',
    }
  : configuredProfile;

const steps = getPipelineSteps(configuredProfile.mode);
const executionMode = resolveExecutionMode(configuredProfile, autoProfile);

const meta = {
  slug,
  title: title || slug,
  date,
  sourceUrl: url,
  targetLang: lang,
  extraction,
  translationProfile: {
    mode: translationProfile.mode,
    audience: translationProfile.audience,
    style: translationProfile.style,
    steps,
    executionMode,
    autoProfile,
  },
};
await fs.writeFile(path.join(dir, 'meta.json'), JSON.stringify(meta, null, 2) + '\n', 'utf-8');
if (extraction) {
  await fs.writeFile(path.join(dir, 'extraction.report.json'), JSON.stringify(extraction, null, 2) + '\n', 'utf-8');
}

const promptPath = path.join(dir, 'translate.prompt.txt');
const promptCompatPath = path.join(dir, `translate.${lang}.prompt.txt`);
const materialized = await materializePipelineArtifacts({
  outputDir: dir,
  markdown,
  lang,
  profile: {
    ...translationProfile,
    steps,
  },
  autoProfile,
  sourceTitle: title || slug,
  sourceUrl: url,
});

const prompt = await fs.readFile(materialized.artifacts.assembledPrompt, 'utf8');
const normalizedPrompt = prompt.trimEnd() + '\n';
await fs.writeFile(promptPath, normalizedPrompt, 'utf-8');
await fs.writeFile(promptCompatPath, normalizedPrompt, 'utf-8');

await fs.writeFile(
  path.join(dir, 'translation.profile.json'),
  JSON.stringify(
    {
      profile: translationProfile,
      configuredProfile,
      autoProfile,
      steps,
      executionMode,
      executionSteps: materialized.executionSteps,
      artifacts: materialized.artifacts,
      promptPath,
      promptCompatPath,
      createdFiles: materialized.createdFiles,
      configPath: resolvedConfigPath,
      loadedFromFile,
    },
    null,
    2
  ) + '\n',
  'utf-8'
);

// Print a machine-readable summary for wrappers.
// NOTE: yyyy/mm are derived from `date` (UTC), and match the site's canonical route:
//   /a/<yyyy>/<mm>/<slug>/
const yyyy = String(now.getUTCFullYear());
const mm = String(now.getUTCMonth() + 1).padStart(2, '0');
const articlePath = `/a/${yyyy}/${mm}/${slug}/`;

console.log(
  JSON.stringify(
    {
      ok: true,
      slug,
      dir,
      lang,
      promptPath,
      promptCompatPath,
      date,
      yyyy,
      mm,
      articlePath,
      extraction,
      translationProfile: {
        ...translationProfile,
        steps,
        executionMode,
        executionSteps: materialized.executionSteps,
        autoProfile,
      },
      profilePath: path.join(dir, 'translation.profile.json'),
      pipelineFiles: materialized.createdFiles,
      nextSteps: [
        `Translate: read ${promptPath} and translate to ${lang} (H1 title + blank line + body)`,
        `Compat prompt (deprecated): ${promptCompatPath}`,
        `Apply: node scripts/apply-translation.mjs ${slug} --lang ${lang} --in /path/to/translated.${lang}.md`,
        'Commit: git add content/articles/<slug>/ && git commit && git push',
        'Verify: wait for deploy and ensure the final URL returns HTTP 200',
      ],
    },
    null,
    2
  )
);

// Ensure the CLI exits even if HTTP keep-alive leaves sockets open (e.g. in tests/local servers).
process.exit(0);

async function existsDir(p) {
  try {
    const st = await fs.stat(p);
    return st.isDirectory();
  } catch {
    return false;
  }
}

async function makeUniqueSlugDir(baseSlug) {
  let slug = baseSlug;
  let dir = path.join(CONTENT_ROOT, slug);

  if (!(await existsDir(dir))) {
    await fs.mkdir(dir, { recursive: true });
    return { slug, dir };
  }

  // If exists, append -2, -3... to avoid overwriting existing articles.
  for (let i = 2; i < 1000; i++) {
    slug = `${baseSlug}-${i}`;
    dir = path.join(CONTENT_ROOT, slug);
    if (!(await existsDir(dir))) {
      await fs.mkdir(dir, { recursive: true });
      return { slug, dir };
    }
  }

  // Last resort.
  slug = `${baseSlug}-${Date.now()}`;
  dir = path.join(CONTENT_ROOT, slug);
  await fs.mkdir(dir, { recursive: true });
  return { slug, dir };
}
