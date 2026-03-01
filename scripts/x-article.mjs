import { fetch } from 'undici';

// Detect X/Twitter status URL and extract tweet id.
// Examples:
//   https://x.com/user/status/1234567890
//   https://x.com/user/status/1234567890?s=...
//   https://twitter.com/user/status/1234567890
export function extractXStatusId(url) {
  try {
    const u = new URL(String(url || ''));
    const host = (u.hostname || '').toLowerCase();
    const isX =
      host === 'x.com' ||
      host === 'www.x.com' ||
      host === 'twitter.com' ||
      host === 'www.twitter.com';
    if (!isX) return null;

    const m = u.pathname.match(/\/status\/(\d+)/);
    if (!m) return null;
    return m[1];
  } catch {
    return null;
  }
}

function normalizeEntityMap(entityMap) {
  // fxtwitter returns entityMap as an array of {key, value}.
  const out = new Map();
  if (!entityMap) return out;
  if (Array.isArray(entityMap)) {
    for (const item of entityMap) {
      const k = item?.key;
      const v = item?.value;
      if (k == null || v == null) continue;
      out.set(String(k), v);
    }
    return out;
  }
  // Fallback: treat as object.
  for (const [k, v] of Object.entries(entityMap)) {
    out.set(String(k), v);
  }
  return out;
}

function cleanText(s) {
  return String(s || '').replace(/^\s+|\s+$/g, '');
}

export function fxtwitterArticleToMarkdown(json) {
  const article = json?.tweet?.article;
  if (!article) throw new Error('fxtwitter response missing tweet.article');

  const title = cleanText(article?.title) || 'Untitled';
  const blocks = article?.content?.blocks || [];
  const entityMap = normalizeEntityMap(article?.content?.entityMap);

  const lines = [];

  for (const b of blocks) {
    const type = b?.type;
    const text = cleanText(b?.text);

    if (type === 'header-one') {
      if (text) lines.push(`## ${text}`);
      continue;
    }
    if (type === 'header-two') {
      if (text) lines.push(`### ${text}`);
      continue;
    }
    if (type === 'unstyled') {
      if (text) lines.push(text);
      continue;
    }
    if (type === 'blockquote') {
      if (text) lines.push(`> ${text}`);
      continue;
    }
    if (type === 'ordered-list-item') {
      if (text) lines.push(`1. ${text}`);
      continue;
    }
    if (type === 'unordered-list-item') {
      if (text) lines.push(`- ${text}`);
      continue;
    }

    if (type === 'atomic') {
      const ranges = Array.isArray(b?.entityRanges) ? b.entityRanges : [];
      let emitted = false;
      for (const r of ranges) {
        const key = r?.key;
        const ent = entityMap.get(String(key));
        const entType = ent?.type;
        const data = ent?.data || {};

        if (entType === 'LINK' && data.url) {
          lines.push(String(data.url));
          emitted = true;
        } else if (entType === 'MEDIA') {
          const caption = cleanText(data.caption);
          if (caption) {
            lines.push(`*${caption}*`);
            emitted = true;
          }
        }
      }
      if (!emitted && text) lines.push(text);
      continue;
    }
  }

  const markdown = lines.filter(Boolean).join('\n\n').trim() + '\n';
  return { title, markdown };
}

export async function fetchFxtwitterStatusJson(tweetId) {
  const id = String(tweetId || '').trim();
  if (!/^\d+$/.test(id)) throw new Error(`Invalid tweet id: ${tweetId}`);

  const res = await fetch(`https://api.fxtwitter.com/status/${id}`, {
    redirect: 'follow',
    headers: {
      'user-agent': 'transcrab/1.0 (+https://github.com/onevcat/transcrab)',
      accept: 'application/json',
    },
  });
  if (!res.ok) {
    throw new Error(`fxtwitter fetch failed: ${res.status} ${res.statusText}`);
  }
  return await res.json();
}

export async function fetchXArticleMarkdownFromStatusId(tweetId) {
  const json = await fetchFxtwitterStatusJson(tweetId);
  return fxtwitterArticleToMarkdown(json);
}
