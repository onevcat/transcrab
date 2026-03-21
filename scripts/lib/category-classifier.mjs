import fs from 'node:fs/promises';
import path from 'node:path';
import matter from 'gray-matter';

const TOPIC_CATEGORY_MAP = {
  technology: '技术',
  business: '商业',
  life: '生活',
};

const EN_STOPWORDS = new Set([
  'the', 'and', 'for', 'with', 'that', 'this', 'from', 'are', 'was', 'were', 'you', 'your', 'but', 'not', 'have',
  'has', 'had', 'its', 'into', 'their', 'about', 'after', 'before', 'they', 'them', 'then', 'than', 'will', 'would',
  'can', 'could', 'should', 'our', 'out', 'how', 'what', 'when', 'where', 'why', 'who', 'which', 'been', 'also',
  'more', 'most', 'some', 'such', 'only', 'over', 'very', 'just', 'like', 'much', 'many', 'each', 'other', 'any',
]);

const ZH_STOPWORDS = new Set([
  '我们', '你们', '他们', '它们', '这个', '那个', '这些', '那些', '以及', '一个', '一种', '一些', '没有', '不是',
  '可以', '因为', '所以', '如果', '但是', '然后', '对于', '通过', '进行', '为了', '需要', '已经', '还是', '自己',
  '非常', '很多', '什么', '如何', '这样', '时候', '可能', '现在', '今天', '这里', '那里', '并且', '或者', '就是',
]);

function countKeywordHits(text, words) {
  const lower = String(text || '').toLowerCase();
  let hits = 0;
  for (const w of words) {
    if (lower.includes(w)) hits += 1;
  }
  return hits;
}

function inferTopicFromText(text) {
  const techHits = countKeywordHits(text, [
    'ai', 'model', 'llm', 'agent', 'gpu', 'token', 'benchmark', 'code', 'sdk', 'api',
    '算法', '模型', '推理', '代码', '编译', '系统', '芯片', '性能', '工程',
  ]);

  const businessHits = countKeywordHits(text, [
    'business', 'market', 'revenue', 'profit', 'pricing', 'growth', 'strategy',
    '商业', '市场', '营收', '利润', '增长', '战略', '公司',
  ]);

  const lifeHits = countKeywordHits(text, [
    'life', 'daily', 'family', 'story', 'feeling', 'travel',
    '生活', '日常', '家人', '故事', '感受', '旅行',
  ]);

  if (techHits >= businessHits && techHits >= lifeHits && techHits >= 2) return 'technology';
  if (businessHits >= lifeHits && businessHits >= 2) return 'business';
  if (lifeHits >= 2) return 'life';
  return 'technology';
}

export function normalizeCategoryName(input) {
  const text = String(input || '').trim();
  if (!text) return null;
  return text.replace(/\s+/g, ' ');
}

export function categoryToSlug(input) {
  const base = String(input || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return base || 'uncategorized';
}

function deriveCategoryFromMeta(meta) {
  const explicit = normalizeCategoryName(meta?.category);
  if (explicit) return explicit;

  const topic = meta?.translationProfile?.autoProfile?.topic;
  if (topic && TOPIC_CATEGORY_MAP[topic]) return TOPIC_CATEGORY_MAP[topic];

  const audience = String(meta?.translationProfile?.audience || '').toLowerCase();
  if (audience.includes('tech')) return TOPIC_CATEGORY_MAP.technology;
  if (audience.includes('business')) return TOPIC_CATEGORY_MAP.business;

  return null;
}

function extractTokenVector(text) {
  const src = String(text || '').toLowerCase();
  const tokenMap = new Map();

  const add = (token, weight = 1) => {
    const t = String(token || '').trim();
    if (!t) return;
    tokenMap.set(t, (tokenMap.get(t) || 0) + weight);
  };

  const enWords = src.match(/[a-z][a-z0-9]{2,}/g) || [];
  for (const w of enWords) {
    if (EN_STOPWORDS.has(w)) continue;
    add(w, 1);
  }

  const zhChunks = src.match(/[\u4e00-\u9fff]{2,}/g) || [];
  for (const chunk of zhChunks) {
    if (chunk.length <= 2) {
      if (!ZH_STOPWORDS.has(chunk)) add(chunk, 1.2);
      continue;
    }

    for (let i = 0; i < chunk.length - 1; i++) {
      const bi = chunk.slice(i, i + 2);
      if (ZH_STOPWORDS.has(bi)) continue;
      add(bi, 1.1);
    }
  }

  return tokenMap;
}

function cosineLikeScore(a, b) {
  if (!a.size || !b.size) return 0;

  let dot = 0;
  let normA = 0;
  let normB = 0;

  for (const v of a.values()) normA += v * v;
  for (const v of b.values()) normB += v * v;

  for (const [token, av] of a.entries()) {
    const bv = b.get(token);
    if (bv) dot += av * bv;
  }

  if (!normA || !normB) return 0;
  return dot / Math.sqrt(normA * normB);
}

function mergeVectors(dest, src) {
  for (const [token, v] of src.entries()) {
    dest.set(token, (dest.get(token) || 0) + v);
  }
}

function newCategoryFromTitle(title, text) {
  const t = String(title || '').trim();
  const zh = t.match(/[\u4e00-\u9fff]{2,}/g);
  if (zh?.length) {
    const pick = zh[0].slice(0, 8).trim();
    if (pick) return pick;
  }

  const words = (t.toLowerCase().match(/[a-z][a-z0-9]{2,}/g) || []).filter((w) => !EN_STOPWORDS.has(w));
  if (words.length >= 2) {
    return words
      .slice(0, 2)
      .map((w) => w[0].toUpperCase() + w.slice(1))
      .join(' ');
  }

  const topic = inferTopicFromText(`${title}\n${text}`);
  return TOPIC_CATEGORY_MAP[topic] || '其他';
}

async function readArticleData(contentRoot, slug) {
  const dir = path.join(contentRoot, slug);
  const zhPath = path.join(dir, 'zh.md');
  const metaPath = path.join(dir, 'meta.json');

  let fm = null;
  try {
    const raw = await fs.readFile(zhPath, 'utf8');
    fm = matter(raw);
  } catch {
    return null;
  }

  let meta = null;
  try {
    const rawMeta = await fs.readFile(metaPath, 'utf8');
    meta = JSON.parse(rawMeta);
  } catch {
    meta = null;
  }

  const explicitCategory = normalizeCategoryName(fm?.data?.category);
  const fallbackCategory = deriveCategoryFromMeta(meta);
  const category = explicitCategory || fallbackCategory || '其他';

  const title = String(fm?.data?.title || meta?.title || slug);
  const body = String(fm?.content || '');

  return { slug, category, title, body };
}

async function buildCategoryProfiles(contentRoot, currentSlug = null) {
  let dirs = [];
  try {
    dirs = await fs.readdir(contentRoot, { withFileTypes: true });
  } catch {
    return new Map();
  }

  const profiles = new Map();

  for (const d of dirs) {
    if (!d.isDirectory()) continue;
    if (currentSlug && d.name === currentSlug) continue;

    const article = await readArticleData(contentRoot, d.name);
    if (!article) continue;

    const key = article.category;
    const vector = extractTokenVector(`${article.title}\n${article.body}`);

    if (!profiles.has(key)) {
      profiles.set(key, { category: key, vector: new Map(), count: 0 });
    }

    const entry = profiles.get(key);
    mergeVectors(entry.vector, vector);
    entry.count += 1;
  }

  return profiles;
}

export async function classifyArticleCategory({
  contentRoot,
  title,
  markdown,
  currentSlug = null,
  threshold = 0.18,
}) {
  const text = `${String(title || '').trim()}\n${String(markdown || '').trim()}`;
  const vec = extractTokenVector(text);
  const profiles = await buildCategoryProfiles(contentRoot, currentSlug);

  let best = null;
  for (const profile of profiles.values()) {
    const score = cosineLikeScore(vec, profile.vector);
    if (!best || score > best.score) {
      best = { category: profile.category, score, count: profile.count };
    }
  }

  if (best && best.score >= threshold) {
    return {
      category: best.category,
      categorySlug: categoryToSlug(best.category),
      matchedExisting: true,
      score: Number(best.score.toFixed(4)),
      reason: `matched-existing(count=${best.count})`,
    };
  }

  const topic = inferTopicFromText(text);
  const topicCategory = TOPIC_CATEGORY_MAP[topic] || null;
  if (topicCategory && profiles.has(topicCategory)) {
    return {
      category: topicCategory,
      categorySlug: categoryToSlug(topicCategory),
      matchedExisting: true,
      score: best ? Number(best.score.toFixed(4)) : 0,
      reason: `fallback-topic(${topic})`,
    };
  }

  const created = newCategoryFromTitle(title, markdown);
  return {
    category: created,
    categorySlug: categoryToSlug(created),
    matchedExisting: false,
    score: best ? Number(best.score.toFixed(4)) : 0,
    reason: 'new-category',
  };
}
