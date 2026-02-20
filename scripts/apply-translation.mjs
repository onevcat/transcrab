#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import matter from 'gray-matter';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');
const CONTENT_ROOT = process.env.TRANSCRAB_CONTENT_ROOT
  ? path.resolve(process.env.TRANSCRAB_CONTENT_ROOT)
  : path.join(ROOT, 'content', 'articles');

function usage() {
  console.log(`Usage:
  node scripts/apply-translation.mjs <slug> [--lang zh] [--in <file>]

Input format (recommended):
  - First line: a translated title as an H1 heading (starts with '# ')
  - Blank line
  - Then the translated body (do not repeat the title)

Reads translated Markdown (from --in file or stdin) and writes:
  content/articles/<slug>/<lang>.md

Notes:
  - This script does NOT translate. Translation should be done by the running OpenClaw assistant.
`);
}

function argValue(args, key, def = null) {
  const idx = args.indexOf(key);
  if (idx >= 0 && idx + 1 < args.length) return args[idx + 1];
  return def;
}

function normalizeEmphasisSpacing(md) {
  const text = String(md || '');
  const lines = text.split(/\r?\n/);
  let inFence = false;
  let fenceToken = null;

  const normalizeOutsideInlineCode = (s) => {
    // Split by backticks; normalize only outside inline code segments.
    const parts = s.split(/(`+)/);
    let out = '';
    let inInline = false;
    let tickRun = '';

    for (const p of parts) {
      if (/^`+$/.test(p)) {
        // Toggle inline code on each backtick run.
        if (!inInline) {
          inInline = true;
          tickRun = p;
        } else {
          inInline = false;
          tickRun = '';
        }
        out += p;
        continue;
      }

      if (inInline) {
        out += p;
        continue;
      }

      // Trim whitespace just inside `**...**` spans.
      // This avoids breaking normal spaces outside emphasis, e.g. `success.** Modern`.
      const edgeWs = /^[\t \u00A0\u3000]+|[\t \u00A0\u3000]+$/g;
      out += p.replace(/\*\*([\s\S]*?)\*\*/g, (m, inner) => {
        const t = String(inner).replace(edgeWs, '');
        return `**${t}**`;
      });
    }

    return out;
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const m = line.match(/^(```+|~~~+)(.*)$/);
    if (m) {
      const token = m[1];
      if (!inFence) {
        inFence = true;
        fenceToken = token;
      } else if (token === fenceToken) {
        inFence = false;
        fenceToken = null;
      }
      continue;
    }

    if (inFence) continue;

    lines[i] = normalizeOutsideInlineCode(line);
  }

  return lines.join('\n');
}

async function readStdin() {
  return await new Promise((resolve, reject) => {
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (c) => (data += c));
    process.stdin.on('end', () => resolve(data));
    process.stdin.on('error', reject);
  });
}

const args = process.argv.slice(2);
if (args.length === 0 || args.includes('-h') || args.includes('--help')) {
  usage();
  process.exit(args.length === 0 ? 2 : 0);
}

const slug = args[0];
const lang = argValue(args, '--lang', 'zh');
const inFile = argValue(args, '--in', null);

const dir = path.join(CONTENT_ROOT, slug);
const sourcePath = path.join(dir, 'source.md');

// Load frontmatter from source.md as the base.
let source;
try {
  source = await fs.readFile(sourcePath, 'utf-8');
} catch {
  throw new Error(`Missing source.md at: ${sourcePath}`);
}

const srcParsed = matter(source);
const fm = srcParsed.data || {};

let translated;
if (inFile) {
  translated = await fs.readFile(path.resolve(inFile), 'utf-8');
} else {
  translated = await readStdin();
}

translated = (translated || '').trim();
if (!translated) {
  throw new Error('No translated markdown provided. Use --in <file> or pipe via stdin.');
}

// Best-effort: strip code fences if the model wrapped the markdown.
translated = translated
  .replace(/^```[a-zA-Z]*\n/, '')
  .replace(/\n```\s*$/, '')
  .trim() + '\n';

// Normalize emphasis markers so CommonMark can render them reliably.
// Fixes patterns like `** some words**` or `**some words **`.
translated = normalizeEmphasisSpacing(translated);

// If the first non-empty line is an H1, use it as translated title and
// remove it from the body to avoid duplicated titles on the page.
let titleOverride = null;
{
  const lines = translated.split(/\r?\n/);
  let i = 0;
  while (i < lines.length && !lines[i].trim()) i++;
  const m = (lines[i] || '').match(/^#\s+(.+)\s*$/);
  if (m) {
    titleOverride = m[1].trim();
    i++;
    // drop following blank lines
    while (i < lines.length && !lines[i].trim()) i++;
    translated = lines.slice(i).join('\n').trim() + '\n';
  }
}

const outFrontmatter = {
  title: titleOverride || fm.title || slug,
  date: fm.date,
  sourceUrl: fm.sourceUrl,
  lang,
};

const outMd = matter.stringify(translated, outFrontmatter);
const outPath = path.join(dir, `${lang}.md`);
await fs.writeFile(outPath, outMd, 'utf-8');

console.log(JSON.stringify({ ok: true, slug, lang, outPath }, null, 2));
