import fsSync from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fetch } from 'undici';
import { htmlToMarkdown } from '../transcrab-core.mjs';

const DEFAULT_JINA_RUNNER = '/Users/onevcat/.openclaw/workspace/skills-shared/jina-cli/scripts/run-jina.sh';

export async function resolveSourceToMarkdown(url) {
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
    '(() => {',
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
  const runner = resolveJinaRunner();
  if (!runner) return null;

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

function resolveJinaRunner() {
  if (fsSync.existsSync(DEFAULT_JINA_RUNNER)) return DEFAULT_JINA_RUNNER;
  if (commandExists('jina')) return 'jina';
  return null;
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
