#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import matter from 'gray-matter';
import { classifyArticleCategory } from './lib/category-classifier.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');
const CONTENT_ROOT = process.env.TRANSCRAB_CONTENT_ROOT
  ? path.resolve(process.env.TRANSCRAB_CONTENT_ROOT)
  : path.join(ROOT, 'content', 'articles');

async function main() {
  const dirs = await fs.readdir(CONTENT_ROOT, { withFileTypes: true }).catch(() => []);
  const targets = dirs.filter((d) => d.isDirectory()).map((d) => d.name);

  let updated = 0;
  let skipped = 0;

  for (const slug of targets) {
    const dir = path.join(CONTENT_ROOT, slug);
    const zhPath = path.join(dir, 'zh.md');
    const metaPath = path.join(dir, 'meta.json');

    let fm;
    try {
      fm = matter(await fs.readFile(zhPath, 'utf8'));
    } catch {
      skipped += 1;
      continue;
    }

    const existing = String(fm.data.category || '').trim();
    if (existing) {
      skipped += 1;
      continue;
    }

    const decision = await classifyArticleCategory({
      contentRoot: CONTENT_ROOT,
      title: fm.data.title || slug,
      markdown: `# ${fm.data.title || slug}\n\n${fm.content || ''}`,
      currentSlug: slug,
    });

    fm.data.category = decision.category;
    await fs.writeFile(zhPath, matter.stringify(fm.content, fm.data), 'utf8');

    let meta = {};
    try {
      meta = JSON.parse(await fs.readFile(metaPath, 'utf8'));
    } catch {
      meta = { slug };
    }
    meta.category = decision.category;
    meta.categoryClassification = decision;
    await fs.writeFile(metaPath, JSON.stringify(meta, null, 2) + '\n', 'utf8');

    updated += 1;
    console.log(`${slug}: ${decision.category} (${decision.reason}, score=${decision.score})`);
  }

  console.log(JSON.stringify({ ok: true, updated, skipped, total: targets.length }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
