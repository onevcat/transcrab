#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import matter from 'gray-matter';
import { lintTranslation, autoFixTranslation } from './lint-translation.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');
const CONTENT_ROOT = process.env.TRANSCRAB_CONTENT_ROOT
  ? path.resolve(process.env.TRANSCRAB_CONTENT_ROOT)
  : path.join(ROOT, 'content', 'articles');

function usage() {
  console.log(`Usage:
  node scripts/apply-translation.mjs <slug> [--lang zh] [--in <file>] [--stage draft|final]

Input format (recommended):
  - First line: a translated title as an H1 heading (starts with '# ')
  - Blank line
  - Then the translated body (do not repeat the title)

Stage behavior:
  - draft: write/refresh 03-draft.md (+ 04-critique.md for refined flow), do NOT publish zh.md
  - final: write zh.md (publish), and write 05-revision.md for refined flow if available

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
    const parts = s.split(/(`+)/);
    let out = '';
    let inInline = false;

    for (const p of parts) {
      if (/^`+$/.test(p)) {
        inInline = !inInline;
        out += p;
        continue;
      }

      if (inInline) {
        out += p;
        continue;
      }

      const edgeWs = /^[\t \u00A0\u3000]+|[\t \u00A0\u3000]+$/g;
      out += p.replace(/\*\*([\s\S]*?)\*\*/g, (_m, inner) => {
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

    if (!inFence) lines[i] = normalizeOutsideInlineCode(line);
  }

  return lines.join('\n');
}

function quickCritiqueMarkdown(md) {
  const lines = String(md || '').split(/\r?\n/);
  const codeFenceCount = lines.filter((l) => /^```/.test(l.trim())).length;
  const badEmphasis = /\*\*\s+[^*]|[^*]\s+\*\*/.test(md);
  const tableRows = lines.filter((l) => /^\|.+\|\s*$/.test(l)).length;
  const hasH1 = /^#\s+.+/m.test(md);

  const items = [
    `- has-h1: ${hasH1 ? 'PASS' : 'WARN (建议包含 H1 译文标题)'}`,
    `- code-fence-balanced: ${codeFenceCount % 2 === 0 ? 'PASS' : 'WARN (代码块围栏数量为奇数)'}`,
    `- emphasis-spacing: ${badEmphasis ? 'WARN (检测到可能的 ** 空白问题)' : 'PASS'}`,
    `- table-rows: ${tableRows > 0 ? `INFO (${tableRows})` : 'INFO (none)'}`,
  ];

  return ['# Critique Notes', '', ...items, '', '- factual accuracy: TODO', '- terminology drift: TODO', '- readability issues: TODO', ''].join('\n');
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

async function loadExecutionMode(dir) {
  const profilePath = path.join(dir, 'translation.profile.json');
  try {
    const raw = await fs.readFile(profilePath, 'utf8');
    const json = JSON.parse(raw);
    return json.executionMode || json.profile?.executionMode || 'normal';
  } catch {
    return 'normal';
  }
}

const args = process.argv.slice(2);
if (args.length === 0 || args.includes('-h') || args.includes('--help')) {
  usage();
  process.exit(args.length === 0 ? 2 : 0);
}

const slug = args[0];
const lang = argValue(args, '--lang', 'zh');
const inFile = argValue(args, '--in', null);
const stage = String(argValue(args, '--stage', 'final')).toLowerCase();
if (!['draft', 'final'].includes(stage)) {
  throw new Error(`Invalid --stage: ${stage}. Allowed: draft|final`);
}

const dir = path.join(CONTENT_ROOT, slug);
const sourcePath = path.join(dir, 'source.md');
const source = await fs.readFile(sourcePath, 'utf-8').catch(() => {
  throw new Error(`Missing source.md at: ${sourcePath}`);
});

const srcParsed = matter(source);
const fm = srcParsed.data || {};

let translated = inFile ? await fs.readFile(path.resolve(inFile), 'utf-8') : await readStdin();
translated = (translated || '').trim();
if (!translated) throw new Error('No translated markdown provided. Use --in <file> or pipe via stdin.');

translated = translated
  .replace(/^```[a-zA-Z]*\n/, '')
  .replace(/\n```\s*$/, '')
  .trim() + '\n';

translated = normalizeEmphasisSpacing(translated);

// Quality gate phase A: deterministic lint + auto-fix for common CN punctuation issues.
const lintBefore = lintTranslation(translated);
const fixed = autoFixTranslation(translated);
translated = fixed.text;
const lintAfter = lintTranslation(translated);

const normalizedWithTitle = translated;

let titleOverride = null;
{
  const lines = translated.split(/\r?\n/);
  let i = 0;
  while (i < lines.length && !lines[i].trim()) i++;
  const m = (lines[i] || '').match(/^#\s+(.+)\s*$/);
  if (m) {
    titleOverride = m[1].trim();
    i++;
    while (i < lines.length && !lines[i].trim()) i++;
    translated = lines.slice(i).join('\n').trim() + '\n';
  }
}

const executionMode = await loadExecutionMode(dir);
const isRefined = executionMode === 'refined';

const lintReportPath = path.join(dir, 'lint.report.json');
await fs.writeFile(
  lintReportPath,
  JSON.stringify(
    {
      before: lintBefore,
      after: lintAfter,
      autoFixed: fixed.changed,
    },
    null,
    2
  ) + '\n',
  'utf8'
);

if (stage === 'draft') {
  const draftPath = path.join(dir, '03-draft.md');
  await fs.writeFile(draftPath, normalizedWithTitle, 'utf8');

  let critiquePath = null;
  if (isRefined) {
    critiquePath = path.join(dir, '04-critique.md');
    await fs.writeFile(critiquePath, quickCritiqueMarkdown(normalizedWithTitle), 'utf8');
  }

  console.log(JSON.stringify({ ok: true, stage, slug, executionMode, draftPath, critiquePath, lintReportPath, lintScore: lintAfter.score, autoFixed: fixed.changed }, null, 2));
  process.exit(0);
}

if (isRefined) {
  const revisionPath = path.join(dir, '05-revision.md');
  const note = [
    '# Revision Notes',
    '',
    `- basedOnDraft: ${await fs.stat(path.join(dir, '03-draft.md')).then(() => 'yes').catch(() => 'no')}`,
    '- changes applied: TODO',
    '- unresolved issues: TODO',
    '',
  ].join('\n');
  await fs.writeFile(revisionPath, note, 'utf8');
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

console.log(JSON.stringify({ ok: true, stage, slug, lang, executionMode, outPath, lintReportPath, lintScore: lintAfter.score, autoFixed: fixed.changed }, null, 2));
