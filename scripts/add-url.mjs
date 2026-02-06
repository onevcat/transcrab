#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Readability } from '@mozilla/readability';
import TurndownService from 'turndown';
import matter from 'gray-matter';
import slugify from 'slugify';
import { fetch } from 'undici';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');
const CONTENT_ROOT = path.join(ROOT, 'content', 'articles');

function usage() {
  console.log(`Usage:
  node scripts/add-url.mjs <url> [--lang zh]

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

await fs.mkdir(CONTENT_ROOT, { recursive: true });

const html = await fetchHtml(url);
const { title, markdown } = await htmlToMarkdown(html, url);
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

const meta = {
  slug,
  title: title || slug,
  date,
  sourceUrl: url,
  targetLang: lang,
};
await fs.writeFile(path.join(dir, 'meta.json'), JSON.stringify(meta, null, 2) + '\n', 'utf-8');

const prompt = buildTranslatePrompt(markdown, lang);
const promptPath = path.join(dir, `translate.${lang}.prompt.txt`);
await fs.writeFile(promptPath, prompt + '\n', 'utf-8');

// Print a machine-readable summary for wrappers.
console.log(JSON.stringify({ ok: true, slug, dir, lang, promptPath, date }, null, 2));

// ----------------

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

  const reader = new Readability(dom.window.document);
  const article = reader.parse();

  const title = article?.title || dom.window.document.title || '';
  const contentHtml = article?.content || dom.window.document.body?.innerHTML || '';

  // Re-attach language hints (best-effort).
  const contentDom = new JSDOM(contentHtml, { url: baseUrl });
  applyCodeLangHints(contentDom.window.document, langHints);
  const patchedHtml = contentDom.window.document.body?.innerHTML || contentHtml;

  const turndown = new TurndownService({
    headingStyle: 'atx',
    codeBlockStyle: 'fenced',
    emDelimiter: '*',
  });

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

      const lang = pickLang(classSources);
      const raw = (codeEl ? codeEl.textContent : pre.textContent) || '';
      const text = raw.replace(/\n+$/g, '');

      const fence = '```';
      const info = lang ? lang : '';
      return `\n${fence}${info}\n${text}\n${fence}\n`;
    },
  });

  // Keep links and images as-is
  const md = turndown.turndown(patchedHtml);
  return { title: title.trim(), markdown: md.trim() + '\n' };
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

function buildTranslatePrompt(md, targetLang) {
  const langName = targetLang === 'zh' ? '简体中文' : targetLang;
  return [
    `你是一个翻译助手。请把下面的 Markdown 内容翻译成${langName}。`,
    `要求：`,
    `- 保留 Markdown 结构（标题/列表/引用/表格/链接）。`,
    `- 代码块、命令、URL、文件路径保持原样，不要翻译。`,
    `- 术语以忠实原意为主，但整体表达要通顺自然（约 6/4：忠实/顺畅）。`,
    `- **必须同时翻译标题**：请先输出一行 Markdown 一级标题（以 "# " 开头），作为译文标题。`,
    `- 然后空一行，再输出译文正文（不要再重复标题）。`,
    `- 只输出翻译结果本身，不要附加解释、不要加前后缀。`,
    ``,
    `---`,
    md,
  ].join('\n');
}
