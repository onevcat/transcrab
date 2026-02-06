import fs from 'node:fs/promises';
import path from 'node:path';
import matter from 'gray-matter';
import { marked } from 'marked';

const CONTENT_ROOT = path.resolve(process.cwd(), 'content', 'articles');

function ts(x) {
  if (!x) return null;
  const t = Date.parse(x);
  return Number.isFinite(t) ? t : null;
}

function pad2(n) {
  return String(n).padStart(2, '0');
}

function toYyyyMm(dateStr) {
  const t = ts(dateStr);
  if (t === null) return { yyyy: '0000', mm: '00' };
  const d = new Date(t);
  return { yyyy: String(d.getUTCFullYear()), mm: pad2(d.getUTCMonth() + 1) };
}

function dateDisplay(dateStr) {
  // Display only YYYY-MM-DD even if stored as ISO datetime.
  if (!dateStr) return '';
  const s = String(dateStr);
  return s.length >= 10 ? s.slice(0, 10) : s;
}

export async function listArticles() {
  let dirs = [];
  try {
    dirs = await fs.readdir(CONTENT_ROOT, { withFileTypes: true });
  } catch {
    return [];
  }

  const items = [];
  for (const d of dirs) {
    if (!d.isDirectory()) continue;
    const slug = d.name;

    const zhPath = path.join(CONTENT_ROOT, slug, 'zh.md');
    const metaPath = path.join(CONTENT_ROOT, slug, 'meta.json');

    try {
      const raw = await fs.readFile(zhPath, 'utf-8');
      const fm = matter(raw);

      // NOTE: We use frontmatter `date` as the single source of truth.
      // It should be an ISO datetime string (preferred) or YYYY-MM-DD.
      const date = fm.data.date ?? null;
      const { yyyy, mm } = toYyyyMm(date);

      items.push({
        slug,
        yyyy,
        mm,
        title: fm.data.title ?? slug,
        date,
        dateDisplay: dateDisplay(date),
        sourceUrl: fm.data.sourceUrl ?? null,
      });
    } catch {
      // ignore
    }
  }

  items.sort((a, b) => {
    const at = ts(a.date);
    const bt = ts(b.date);
    if (at !== null || bt !== null) return (bt ?? -1) - (at ?? -1);

    // Last resort: slug stable.
    return String(a.slug).localeCompare(String(b.slug));
  });

  return items;
}

export async function getArticle(slug) {
  const zhPath = path.join(CONTENT_ROOT, slug, 'zh.md');
  try {
    const raw = await fs.readFile(zhPath, 'utf-8');
    const fm = matter(raw);
    const html = marked.parse(fixStrongAdjacency(fm.content));
    const date = fm.data.date ?? null;
    return {
      slug,
      title: fm.data.title ?? slug,
      date,
      dateDisplay: dateDisplay(date),
      sourceUrl: fm.data.sourceUrl ?? null,
      html,
    };
  } catch {
    return null;
  }
}

// CommonMark-style emphasis rules are strict about delimiter adjacency.
// In Chinese translations we often have patterns like `**Item：**Item` without a space.
// Many parsers render this literally. We insert a space after a closing strong marker
// when it is immediately followed by a CJK/Latin/digit character.
function fixStrongAdjacency(md) {
  return md
    // **bold**Word -> **bold** Word
    .replace(/(\*\*[^\n]*?\*\*)(?=[0-9A-Za-z\u4E00-\u9FFF])/g, '$1 ')
    // __bold__Word -> __bold__ Word
    .replace(/(__[^\n]*?__)(?=[0-9A-Za-z\u4E00-\u9FFF])/g, '$1 ');
}
