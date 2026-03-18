#!/usr/bin/env node

import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { Readability } from '@mozilla/readability';
import TurndownService from 'turndown';
import { gfm } from 'turndown-plugin-gfm';
import matter from 'gray-matter';
import slugify from 'slugify';
import { fetch } from 'undici';
import { loadTranslateConfig } from './lib/translate-config.mjs';
import { getPipelineSteps, materializePipelineArtifacts, resolveExecutionMode } from './translate-orchestrator.mjs';
import { inferAutoProfile } from './lib/auto-profile.mjs';

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
  - Fetches HTML, extracts main article (Readability), converts to Markdown (Turndown)
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

// ----------------

async function resolveSourceToMarkdown(url) {
  // Prefer fxtwitter for x.com/twitter status links, because direct fetch can be blocked
  // and article blocks include MEDIA entities that we can map back to inline images.
  if (isXStatusUrl(url)) {
    try {
      const x = await xStatusToMarkdown(url);
      return {
        ...x,
        extraction: {
          selected: { source: 'x-article', score: 999 },
          candidates: [{ source: 'x-article', score: 999, metrics: evaluateMarkdownQuality(x.markdown) }],
          qualityGate: defaultQualityGate(),
        },
      };
    } catch (e) {
      // Fallback to the generic HTML pipeline if API extraction fails.
      console.warn(`[x-article] fallback failed for ${url}: ${e?.message || e}`);
    }
  }

  const gate = defaultQualityGate();
  const candidates = [];

  const baseHtml = await fetchHtml(url);
  const base = await htmlToMarkdown(baseHtml, url);
  candidates.push(makeCandidate('readability', base, { url }));

  const ldjson = await ldJsonToMarkdown(baseHtml, url, base.title || '');
  if (ldjson) candidates.push(makeCandidate('ld-json', ldjson, { url }));

  const variants = buildVariantUrls(url);
  for (const v of variants) {
    try {
      const html = await fetchHtml(v);
      const r = await htmlToMarkdown(html, v);
      candidates.push(makeCandidate('variant-readability', r, { url: v }));

      const s = await ldJsonToMarkdown(html, v, r.title || '');
      if (s) candidates.push(makeCandidate('variant-ld-json', s, { url: v }));
    } catch {
      // variant fetch failures are expected; keep searching.
    }
  }

  // If still weak, try optional local/browser-based extractors.
  const bestBeforeOptional = pickBestCandidate(candidates);
  if (!bestBeforeOptional || !isQualityAcceptable(bestBeforeOptional.metrics, gate)) {
    const rendered = await extractViaAgentBrowser(url);
    if (rendered) candidates.push(makeCandidate('agent-browser', rendered, { url }));

    const jina = await extractViaJina(url);
    if (jina) candidates.push(makeCandidate('jina-read', jina, { url }));
  }

  const best = pickBestCandidate(candidates);
  const extraction = {
    selected: best ? { source: best.source, score: best.score, metrics: best.metrics, url: best.url } : null,
    qualityGate: gate,
    candidates: candidates.map((c) => ({ source: c.source, score: c.score, metrics: c.metrics, url: c.url })),
  };

  if (!best || !isQualityAcceptable(best.metrics, gate)) {
    const err = new Error('Extraction quality too low after all fallbacks');
    err.extraction = extraction;
    throw err;
  }

  return {
    title: best.title,
    markdown: best.markdown,
    extraction,
  };
}

function defaultQualityGate() {
  return {
    minChars: 400,
    minParagraphs: 3,
    minHeadings: 1,
  };
}

function evaluateMarkdownQuality(markdown) {
  const raw = String(markdown || '').trim();
  const lines = raw.split(/\r?\n/);
  const headings = lines.filter((l) => /^#{1,6}\s+/.test(l)).length;
  const codeFences = lines.filter((l) => /^```/.test(l)).length / 2;
  const images = lines.filter((l) => /!\[[^\]]*\]\([^\)]+\)/.test(l)).length;

  const paragraphs = raw
    .split(/\n\s*\n/g)
    .map((s) => s.trim())
    .filter((s) => s && !s.startsWith('#') && !s.startsWith('```') && !/^[-*]\s+/.test(s)).length;

  const chars = raw.length;

  // Weighted score; enough to rank candidates, not to validate content truth.
  const score =
    Math.min(chars, 12000) * 0.01 +
    paragraphs * 8 +
    headings * 5 +
    codeFences * 6 +
    images * 4;

  return {
    chars,
    paragraphs,
    headings,
    codeFences,
    images,
    score: Math.round(score),
  };
}

function isQualityAcceptable(metrics, gate = defaultQualityGate()) {
  if (!metrics) return false;
  return (
    metrics.chars >= gate.minChars &&
    metrics.paragraphs >= gate.minParagraphs &&
    metrics.headings >= gate.minHeadings
  );
}

function makeCandidate(source, payload, extra = {}) {
  const title = String(payload?.title || '').trim();
  const markdown = String(payload?.markdown || '').trim();
  const metrics = evaluateMarkdownQuality(markdown);

  return {
    source,
    title,
    markdown: markdown ? `${markdown}\n` : '\n',
    metrics,
    score: metrics.score,
    ...extra,
  };
}

function pickBestCandidate(candidates) {
  const valid = (candidates || []).filter((c) => c && c.markdown && c.markdown.trim());
  if (!valid.length) return null;
  return valid.sort((a, b) => b.score - a.score)[0];
}

function buildVariantUrls(rawUrl) {
  try {
    const u = new URL(rawUrl);
    const out = new Set();

    const withQuery = (key, value = null) => {
      const n = new URL(u.href);
      if (value == null) n.searchParams.set(key, '1');
      else n.searchParams.set(key, value);
      out.add(n.toString());
    };

    withQuery('output', '1');
    withQuery('amp');
    withQuery('print', '1');
    withQuery('view', 'amp');

    const ampPath = new URL(u.href);
    if (!ampPath.pathname.endsWith('/amp')) {
      ampPath.pathname = `${ampPath.pathname.replace(/\/$/, '')}/amp`;
      out.add(ampPath.toString());
    }

    out.delete(rawUrl);
    return [...out];
  } catch {
    return [];
  }
}

async function ldJsonToMarkdown(html, pageUrl, fallbackTitle = '') {
  try {
    const { JSDOM } = await import('jsdom');
    const dom = new JSDOM(html, { url: pageUrl });
    const doc = dom.window.document;

    const blocks = [];
    for (const node of doc.querySelectorAll('script[type="application/ld+json"]')) {
      const txt = (node.textContent || '').trim();
      if (!txt) continue;
      try {
        const parsed = JSON.parse(txt);
        blocks.push(...flattenLdJson(parsed));
      } catch {
        // skip invalid block
      }
    }

    const article = blocks.find((b) => /Article$/i.test(String(b['@type'] || '')) && b.articleBody) ||
      blocks.find((b) => b.articleBody);

    const title =
      String(article?.headline || article?.name || fallbackTitle || doc.title || '').trim();
    const body = String(article?.articleBody || '').trim();

    if (!body || body.length < 200) return null;

    const images = [];
    const img = article?.image;
    if (typeof img === 'string') images.push(img);
    else if (Array.isArray(img)) {
      for (const x of img) {
        if (typeof x === 'string') images.push(x);
        else if (x?.url) images.push(String(x.url));
      }
    } else if (img?.url) {
      images.push(String(img.url));
    }

    const imageMd = [...new Set(images)].map((u) => `![](${u})`).join('\n');
    const markdown = imageMd ? `${body}\n\n${imageMd}` : body;

    return { title, markdown };
  } catch {
    return null;
  }
}

function flattenLdJson(input) {
  const out = [];
  const walk = (v) => {
    if (!v) return;
    if (Array.isArray(v)) return v.forEach(walk);
    if (typeof v === 'object') {
      out.push(v);
      if (v['@graph']) walk(v['@graph']);
    }
  };
  walk(input);
  return out;
}

function commandExists(bin) {
  const paths = (process.env.PATH || '').split(path.delimiter);
  for (const p of paths) {
    if (!p) continue;
    const full = path.join(p, bin);
    if (fsSync.existsSync(full)) return true;
  }
  return false;
}

async function extractViaAgentBrowser(url) {
  if (!commandExists('agent-browser')) return null;

  const q = shellQuote(url);
  const cmd = [
    `agent-browser open ${q} >/dev/null 2>&1`,
    'agent-browser wait --load networkidle >/dev/null 2>&1',
    "agent-browser eval --stdin <<'EVAL'",
    "(() => {",
    "  const root = document.querySelector('article, main') || document.body;",
    '  return root ? root.outerHTML : document.documentElement.outerHTML;',
    '})();',
    'EVAL',
  ].join('\n');

  const run = spawnSync('zsh', ['-lc', cmd], { encoding: 'utf8', timeout: 120000 });
  if (run.status !== 0) return null;

  const rendered = String(run.stdout || '').trim();
  if (!rendered || rendered.length < 500) return null;

  // Wrap fragment as html for parser stability.
  const html = `<!doctype html><html><body>${rendered}</body></html>`;
  return await htmlToMarkdown(html, url);
}

async function extractViaJina(url) {
  const runner = '/Users/onevcat/.openclaw/workspace/skills-shared/jina-cli/scripts/run-jina.sh';
  if (!fsSync.existsSync(runner)) return null;

  const run = spawnSync(runner, ['read', url, '--links', '--images'], {
    encoding: 'utf8',
    timeout: 120000,
  });

  if (run.status !== 0) return null;
  const raw = String(run.stdout || '').trim();
  if (!raw) return null;

  const parsed = parseJinaReadOutput(raw);
  if (!parsed?.markdown || parsed.markdown.length < 200) return null;
  return parsed;
}

function parseJinaReadOutput(raw) {
  const text = String(raw || '');
  const titleMatch = text.match(/^Title:\s*(.+)$/m);
  const title = titleMatch?.[1]?.trim() || '';

  const marker = 'Markdown Content:';
  const idx = text.indexOf(marker);
  const markdown = idx >= 0 ? text.slice(idx + marker.length).trim() : text.trim();

  return {
    title,
    markdown,
  };
}

function shellQuote(s) {
  return `'${String(s).replace(/'/g, `'"'"'`)}'`;
}

function isXStatusUrl(rawUrl) {
  try {
    const u = new URL(rawUrl);
    const host = u.hostname.toLowerCase();
    if (!(host === 'x.com' || host === 'www.x.com' || host === 'twitter.com' || host === 'www.twitter.com')) {
      return false;
    }
    return /\/status\/\d+/.test(u.pathname);
  } catch {
    return false;
  }
}

function extractTweetId(rawUrl) {
  const m = String(rawUrl || '').match(/\/status\/(\d+)/);
  return m?.[1] || null;
}

async function xStatusToMarkdown(rawUrl) {
  const tweetId = extractTweetId(rawUrl);
  if (!tweetId) throw new Error('Cannot extract tweet id from URL');

  const api = `https://api.fxtwitter.com/status/${tweetId}`;
  const res = await fetch(api, {
    headers: {
      'user-agent':
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36',
      accept: 'application/json',
    },
  });

  if (!res.ok) throw new Error(`fxtwitter fetch failed: ${res.status} ${res.statusText}`);

  const data = await res.json();
  const article = data?.tweet?.article;
  const title = article?.title || data?.tweet?.author?.name || rawUrl;
  const blocks = Array.isArray(article?.content?.blocks) ? article.content.blocks : [];

  if (!blocks.length) {
    throw new Error('fxtwitter payload has no article content blocks');
  }

  const entityMapEntries = Array.isArray(article?.content?.entityMap)
    ? article.content.entityMap
    : Object.entries(article?.content?.entityMap || {}).map(([key, value]) => ({ key, value }));

  const entityMap = new Map(entityMapEntries.map((e) => [String(e.key), e.value]));
  const mediaById = new Map(
    (article?.media_entities || []).map((m) => [String(m.media_id), m])
  );

  const lines = [];
  let olIndex = 1;

  for (const block of blocks) {
    const type = block?.type || 'unstyled';

    if (type === 'atomic') {
      const mediaUrl = pickAtomicMediaUrl(block, entityMap, mediaById);
      if (mediaUrl) {
        lines.push(`![](${mediaUrl})`);
        lines.push('');
      }
      continue;
    }

    const text = withEntityLinks(block?.text || '', block?.entityRanges || [], entityMap).trim();
    if (!text) {
      if (type !== 'unordered-list-item' && type !== 'ordered-list-item') {
        lines.push('');
      }
      continue;
    }

    if (type === 'header-two') {
      lines.push(`## ${text}`);
      lines.push('');
      olIndex = 1;
      continue;
    }

    if (type === 'unordered-list-item') {
      lines.push(`- ${text}`);
      continue;
    }

    if (type === 'ordered-list-item') {
      lines.push(`${olIndex}. ${text}`);
      olIndex += 1;
      continue;
    }

    // unstyled / blockquote / fallback
    lines.push(text);
    lines.push('');
    olIndex = 1;
  }

  const markdown = lines.join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n';
  return { title: String(title).trim(), markdown };
}

function withEntityLinks(text, entityRanges, entityMap) {
  if (!text || !Array.isArray(entityRanges) || entityRanges.length === 0) return text;

  const ranges = [...entityRanges]
    .filter((r) => Number.isInteger(r?.offset) && Number.isInteger(r?.length) && r.length > 0)
    .sort((a, b) => b.offset - a.offset);

  let out = text;
  for (const r of ranges) {
    const entity = entityMap.get(String(r.key));
    if (!entity || entity.type !== 'LINK') continue;
    const url = entity?.data?.url;
    if (!url) continue;

    const seg = out.slice(r.offset, r.offset + r.length);
    if (!seg) continue;
    out = `${out.slice(0, r.offset)}[${seg}](${url})${out.slice(r.offset + r.length)}`;
  }
  return out;
}

function pickAtomicMediaUrl(block, entityMap, mediaById) {
  const ranges = Array.isArray(block?.entityRanges) ? block.entityRanges : [];
  for (const r of ranges) {
    const entity = entityMap.get(String(r.key));
    if (!entity || entity.type !== 'MEDIA') continue;
    const mediaId = String(entity?.data?.mediaItems?.[0]?.mediaId || '');
    if (!mediaId) continue;
    const m = mediaById.get(mediaId);
    const u = m?.media_info?.original_img_url;
    if (u) return u;
  }
  return null;
}

async function fetchHtml(url) {
  const res = await fetch(url, {
    redirect: 'follow',
    headers: {
      'user-agent':
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36',
      accept: 'text/html,application/xhtml+xml',
    },
  });
  if (!res.ok) {
    throw new Error(`Fetch failed: ${res.status} ${res.statusText}`);
  }
  return await res.text();
}

async function htmlToMarkdown(html, baseUrl) {
  // Lazy-load JSDOM (heavy)
  const { JSDOM } = await import('jsdom');
  const dom = new JSDOM(html, { url: baseUrl });

  // --- Preserve code block language before Readability ---
  // Many docs sites keep language info in wrapper classes:
  //   <div class="language-csharp ext-cs ..."><pre class="language-csharp"><code>...</code></pre>...
  // Readability may strip those classes. We'll capture language hints first and
  // re-attach them after extraction by matching code text prefixes.
  const langHints = collectCodeLangHints(dom.window.document);

  const directContentHtml = pickDirectContentHtml(dom.window.document);
  const reader = new Readability(dom.window.document);
  const article = reader.parse();

  const title = article?.title || dom.window.document.title || '';
  const contentHtml =
    directContentHtml ||
    article?.content ||
    dom.window.document.body?.innerHTML ||
    '';

  // Re-attach language hints (best-effort).
  const contentDom = new JSDOM(contentHtml, { url: baseUrl });
  applyCodeLangHints(contentDom.window.document, langHints);
  const patchedHtml = contentDom.window.document.body?.innerHTML || contentHtml;

  const turndown = new TurndownService({
    headingStyle: 'atx',
    codeBlockStyle: 'fenced',
    emDelimiter: '*',
  });

  // Enable GitHub-Flavored Markdown conversions (notably: tables).
  // Without this, <table> elements get flattened into loose text lines.
  turndown.use(gfm);

  // Trim whitespace inside emphasis tags.
  // Some sites emit <strong> some words</strong>, which would become `** some words**`
  // and fails to render as bold in CommonMark.
  turndown.addRule('strongTrim', {
    filter(node) {
      return node.nodeName === 'STRONG' || node.nodeName === 'B';
    },
    replacement(content) {
      const t = String(content || '').replace(/^\s+|\s+$/g, '');
      return t ? `**${t}**` : '';
    },
  });
  turndown.addRule('emTrim', {
    filter(node) {
      return node.nodeName === 'EM' || node.nodeName === 'I';
    },
    replacement(content) {
      const t = String(content || '').replace(/^\s+|\s+$/g, '');
      return t ? `*${t}*` : '';
    },
  });

  // Track guessed/explicit languages while converting.
  // We'll use it to set a page-level default language for code fences that have no info string.
  const fenceLangCounts = new Map();
  const bump = (lang) => {
    if (!lang) return;
    fenceLangCounts.set(lang, (fenceLangCounts.get(lang) || 0) + 1);
  };

  // Preserve language info for fenced code blocks when possible.
  // Many docs sites render code blocks like:
  //   <pre class="language-csharp"><code>...</code></pre>
  // or wrap them with a div like:
  //   <div class="language-csharp ext-cs"><pre>...</pre></div>
  // Readability may rewrite some wrappers, so we check multiple places.
  turndown.addRule('fencedCodeBlockWithLanguage', {
    filter(node) {
      return (
        node.nodeName === 'PRE' &&
        node.textContent &&
        node.textContent.trim().length > 0
      );
    },
    replacement(_content, node) {
      const pre = node;
      const codeEl = pre.querySelector?.('code') || null;

      const classSources = [
        pre.getAttribute?.('class') || '',
        codeEl?.getAttribute?.('class') || '',
        pre.parentElement?.getAttribute?.('class') || '',
      ].filter(Boolean);

      function pickLang(classes) {
        const joined = classes.join(' ');
        // Common: language-xxx / lang-xxx
        let m = joined.match(/\b(?:language|lang)-([a-z0-9_+-]+)\b/i);
        if (m) return normalizeLang(m[1]);
        // Some sites: ext-cs, ext-js, etc.
        m = joined.match(/\bext-([a-z0-9_+-]+)\b/i);
        if (m) return normalizeLang(m[1]);
        return null;
      }

      function normalizeLang(lang) {
        const l = String(lang).toLowerCase();
        // A few pragmatic aliases seen on docs sites.
        if (l === 'cs') return 'csharp';
        if (l === 'c#') return 'csharp';
        if (l === 'js') return 'javascript';
        if (l === 'ts') return 'typescript';
        if (l === 'sh') return 'bash';
        if (l === 'shell') return 'bash';
        if (l === 'py') return 'python';
        if (l === 'kt') return 'kotlin';
        return l;
      }

      let lang = pickLang(classSources);
      const raw = (codeEl ? codeEl.textContent : pre.textContent) || '';
      const text = raw.replace(/\n+$/g, '');

      // If we cannot extract any explicit language info, try a conservative heuristic.
      // This is ONLY a fallback when there are no language tags.
      if (!lang) lang = guessLangFromCode(text);

      bump(lang);

      const fence = '```';
      const info = lang ? lang : '';
      return `\n${fence}${info}\n${text}\n${fence}\n`;
    },
  });

  // Keep links and images as-is
  let md = turndown.turndown(patchedHtml);

  // If most code blocks are the same language and some fences are missing info strings,
  // apply a page-level default language to those empty fences.
  const defaultFenceLang = pickDefaultFenceLang(fenceLangCounts);
  if (defaultFenceLang) {
    md = applyDefaultLangToFences(md, defaultFenceLang);
  }

  md = normalizeLinkedImageBlocks(md);

  return { title: title.trim(), markdown: md.trim() + '\n' };
}

function pickDefaultFenceLang(counts) {
  const entries = [...(counts || new Map()).entries()].sort((a, b) => b[1] - a[1]);
  if (entries.length === 0) return null;
  const total = entries.reduce((s, [, n]) => s + n, 0);
  const [bestLang, bestCount] = entries[0];
  const secondCount = entries[1]?.[1] ?? 0;

  // Be conservative: only set a default when one language clearly dominates.
  // This matches the user's expectation that a post is usually written in one language.
  if (bestCount < 2) return null;
  if (bestCount / Math.max(1, total) < 0.6) return null;
  if (bestCount - secondCount < 2 && bestCount < 6) return null;

  return bestLang;
}

function applyDefaultLangToFences(md, lang) {
  const lines = String(md || '').split(/\r?\n/);
  let inFence = false;
  let fenceToken = '```';

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const m = line.match(/^(```+)(.*)$/);
    if (!m) continue;

    const token = m[1];
    const info = (m[2] || '').trim();

    if (!inFence) {
      // opening fence
      inFence = true;
      fenceToken = token;
      if (!info) lines[i] = `${token}${lang}`;
    } else {
      // closing fence (match same token length)
      if (token === fenceToken) {
        inFence = false;
        fenceToken = '```';
      }
    }
  }

  return lines.join('\n');
}

function normalizeLinkedImageBlocks(md) {
  let out = String(md || '');

  // Some sites (notably Substack) wrap clickable images in block elements inside <a>.
  // Turndown can emit a multiline form that renders as stray '[' and URL text:
  // [\n\n![](img)\n\n](link)
  // Normalize to a single-line markdown link-image.
  out = out.replace(
    /\[\s*\n+\s*(!\[[^\]]*\]\([^\n)]+\))\s*\n+\s*\]\(([^\n)]+)\)/g,
    '[$1]($2)'
  );

  return out;
}

function pickDirectContentHtml(doc) {
  const selectors = [
    'article .available-content .body.markup', // Substack article body
    'article .available-content .body',
    'article .body.markup',
  ];

  for (const sel of selectors) {
    const node = doc.querySelector(sel);
    if (!node) continue;

    const text = (node.textContent || '').replace(/\s+/g, ' ').trim();
    // Avoid grabbing tiny fragments (e.g. bylines or promo blocks).
    if (text.length < 300) continue;

    return node.innerHTML || '';
  }

  return null;
}

function normalizeLangHint(lang) {
  const l = String(lang || '').toLowerCase();
  if (!l) return null;
  if (l === 'cs' || l === 'c#') return 'csharp';
  if (l === 'js') return 'javascript';
  if (l === 'ts') return 'typescript';
  if (l === 'sh' || l === 'shell') return 'bash';
  if (l === 'py') return 'python';
  if (l === 'kt') return 'kotlin';
  return l;
}

// Conservative language guessing for code blocks when the source HTML provides no language tags.
// Returns a highlight.js-compatible language id (e.g. "javascript", "tsx"), or null.
function guessLangFromCode(code) {
  const s = String(code || '');
  const t = s.trim();
  if (!t) return null;

  // Early: shebangs
  if (/^#!\/(usr\/bin\/env\s+)?(bash|sh)\b/m.test(t)) return 'bash';
  if (/^#!\/(usr\/bin\/env\s+)?python\b/m.test(t)) return 'python';
  if (/^#!\/(usr\/bin\/env\s+)?node\b/m.test(t)) return 'javascript';

  // Helper: score by strong signals. Keep this conservative to avoid random guesses.
  const scores = new Map();
  const add = (lang, n) => scores.set(lang, (scores.get(lang) || 0) + n);

  // JS / TS / JSX / TSX
  if (/\b(useState|useEffect|useMemo|useCallback|useRef|createContext)\s*\(/.test(t)) add('javascript', 3);
  if (/\b(import|export)\b/.test(t) && /\bfrom\b/.test(t)) add('javascript', 2);
  if (/\bmodule\.exports\b|\brequire\s*\(/.test(t)) add('javascript', 2);
  if (/\bfunction\b\s+[A-Za-z0-9_]+\s*\(/.test(t) && /\bconst\b|\blet\b/.test(t)) add('javascript', 1);
  // JSX-ish
  if (/\breturn\s*\(<[A-Za-z]/.test(t) || /<[A-Za-z][^>]*>/.test(t)) add('jsx', 4);
  // TS-ish
  if (/\b(interface|type)\s+[A-Za-z0-9_]+\s*=/.test(t)) add('typescript', 4);
  if (/\binterface\s+[A-Za-z0-9_]+\b/.test(t)) add('typescript', 4);
  if (/\b(as\s+const|satisfies)\b/.test(t)) add('typescript', 3);
  if (/\b(enum)\s+[A-Za-z0-9_]+\b/.test(t)) add('typescript', 2);
  // Type annotations like: foo: string, (x: Foo) =>
  if (/(^|[\(,])\s*[A-Za-z_][A-Za-z0-9_]*\s*:\s*[A-Za-z_][A-Za-z0-9_<>\[\]\|& ]{0,60}/.test(t)) add('typescript', 2);

  // If JSX and TS both present, assume TSX.
  if ((scores.get('jsx') || 0) >= 4 && (scores.get('typescript') || 0) >= 3) {
    add('tsx', 6);
  }

  // Python
  if (/^\s*def\s+[A-Za-z_][A-Za-z0-9_]*\s*\(/m.test(t)) add('python', 4);
  if (/^\s*class\s+[A-Za-z_][A-Za-z0-9_]*\s*\(?/m.test(t) && /:\s*$/m.test(t)) add('python', 2);
  if (/\b(self|None|elif|yield)\b/.test(t)) add('python', 2);

  // Bash / shell
  if (/^\s*(set -e|set -euxo pipefail)\b/m.test(t)) add('bash', 3);
  if (/\b(echo|grep|sed|awk|curl|chmod|chown)\b/.test(t) && /\n/.test(t)) add('bash', 2);
  if (/\b(fi|then|elif)\b/.test(t) && /\bif\b/.test(t)) add('bash', 1);

  // Go
  if (/^\s*package\s+\w+/m.test(t) && /^\s*func\s+\w+\s*\(/m.test(t)) add('go', 5);
  if (/\b:=\b/.test(t) && /\bfmt\./.test(t)) add('go', 2);

  // Rust
  if (/^\s*fn\s+main\s*\(\)\s*\{/m.test(t) || /\bprintln!\s*!\(/.test(t)) add('rust', 5);
  if (/\buse\s+[a-zA-Z0-9_:]+;/.test(t) && /\blet\s+mut\b/.test(t)) add('rust', 2);

  // Swift
  if (/^\s*import\s+(Foundation|SwiftUI|Combine)\b/m.test(t)) add('swift', 4);
  if (/\b(let|var)\b\s+[A-Za-z_][A-Za-z0-9_]*\s*:\s*[A-Za-z_][A-Za-z0-9_<>\[\]\? ]+/.test(t)) add('swift', 2);
  if (/\bfunc\s+[A-Za-z_][A-Za-z0-9_]*\s*\(/.test(t) && /\bguard\b/.test(t)) add('swift', 2);

  // C#
  if (/^\s*using\s+System\b/m.test(t) || /\bnamespace\s+\w+/.test(t)) add('csharp', 4);
  if (/\bpublic\s+(class|struct|interface)\b/.test(t) && /\bget;\s*set;\b/.test(t)) add('csharp', 2);

  // Kotlin
  if (/^\s*(fun|class)\s+\w+/m.test(t) && /\bval\b|\bvar\b/.test(t) && /\bwhen\b/.test(t)) add('kotlin', 4);

  // Choose best only if confidence is high enough.
  const entries = [...scores.entries()].sort((a, b) => b[1] - a[1]);
  if (entries.length === 0) return null;
  const [bestLang, bestScore] = entries[0];
  const secondScore = entries[1]?.[1] ?? 0;

  // Thresholds: conservative, but allow very strong single-signal languages.
  // - JSX detection is fairly distinctive (angle-bracket tags / return <...)
  // - Python "def" is also distinctive
  const minScoreByLang = {
    jsx: 4,
    tsx: 6,
    javascript: 4,
    typescript: 4,
    python: 4,
    bash: 4,
    go: 5,
    rust: 5,
    swift: 5,
    csharp: 5,
    kotlin: 5,
  };
  const minScore = minScoreByLang[bestLang] ?? 5;

  if (bestScore < minScore) return null;
  // If the winner is only barely ahead, require higher confidence.
  if (bestScore - secondScore < 2 && bestScore < (minScore + 2)) return null;

  // Collapse jsx/tsx into highlight.js names
  if (bestLang === 'jsx') return 'jsx';
  if (bestLang === 'tsx') return 'tsx';
  if (bestLang === 'typescript') return 'typescript';
  if (bestLang === 'javascript') return 'javascript';
  return bestLang;
}

function detectLangFromClass(className) {
  const c = String(className || '');
  let m = c.match(/\b(?:language|lang)-([a-z0-9_+-]+)\b/i);
  if (m) return normalizeLangHint(m[1]);
  m = c.match(/\bext-([a-z0-9_+-]+)\b/i);
  if (m) return normalizeLangHint(m[1]);
  return null;
}

function codePrefix(text) {
  const t = String(text || '').replace(/\r/g, '').trim();
  // Greedy/simple: first 120 chars is enough for matching.
  return t.slice(0, 120);
}

function collectCodeLangHints(doc) {
  const hints = [];
  for (const pre of doc.querySelectorAll('pre')) {
    const codeEl = pre.querySelector('code') || pre;
    const raw = codeEl.textContent || '';
    const prefix = codePrefix(raw);
    if (!prefix) continue;

    const lang =
      detectLangFromClass(pre.getAttribute('class')) ||
      detectLangFromClass(codeEl.getAttribute('class')) ||
      detectLangFromClass(pre.parentElement?.getAttribute('class'));

    if (!lang) continue;

    hints.push({ prefix, lang });
  }

  // If page seems to use a single language overwhelmingly, keep it as default.
  const counts = new Map();
  for (const h of hints) counts.set(h.lang, (counts.get(h.lang) || 0) + 1);
  let defaultLang = null;
  if (counts.size === 1) defaultLang = [...counts.keys()][0];

  return { hints, defaultLang };
}

function applyCodeLangHints(doc, pack) {
  const { hints = [], defaultLang = null } = pack || {};

  // For each <pre>, try to match by prefix; if cannot, fall back to defaultLang.
  for (const pre of doc.querySelectorAll('pre')) {
    const codeEl = pre.querySelector('code') || pre;
    const raw = codeEl.textContent || '';
    const prefix = codePrefix(raw);

    let lang = null;
    if (prefix) {
      // Simple greedy match: first hint whose prefix is contained.
      for (const h of hints) {
        if (prefix === h.prefix || prefix.startsWith(h.prefix) || h.prefix.startsWith(prefix)) {
          lang = h.lang;
          break;
        }
      }
    }

    if (!lang) lang = defaultLang;
    if (!lang) continue;

    // Attach to <pre> so Turndown rules can pick it up.
    const cur = pre.getAttribute('class') || '';
    if (!/\blanguage-/.test(cur)) {
      pre.setAttribute('class', `${cur} language-${lang}`.trim());
    }
  }
}

function makeSlug(title) {
  const s = slugify(title, { lower: true, strict: true, trim: true });
  return s || `article-${Date.now()}`;
}

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

