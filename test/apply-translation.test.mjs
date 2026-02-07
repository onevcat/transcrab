import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import matter from 'gray-matter';

test('apply-translation.mjs: extracts H1 title and writes frontmatter', () => {
  const tmp = mkdtempSync(path.join(os.tmpdir(), 'transcrab-test-'));
  const contentRoot = path.join(tmp, 'content', 'articles');
  const slug = 't1';
  const dir = path.join(contentRoot, slug);
  fs.mkdirSync(dir, { recursive: true });

  const sourceMd = `---\ntitle: Source Title\ndate: 2026-02-07T00:00:00.000Z\nsourceUrl: https://example.com\nlang: source\n---\n\nBody`;
  writeFileSync(path.join(dir, 'source.md'), sourceMd, 'utf8');

  const translated = `# 译文标题\n\n这是正文第一段。\n\n- 列表项\n`;
  const inFile = path.join(tmp, 'translated.md');
  writeFileSync(inFile, translated, 'utf8');

  const script = path.resolve('scripts/apply-translation.mjs');
  const r = spawnSync(process.execPath, [script, slug, '--lang', 'zh', '--in', inFile], {
    env: { ...process.env, TRANSCRAB_CONTENT_ROOT: contentRoot },
    encoding: 'utf8',
  });
  assert.equal(r.status, 0, r.stderr || r.stdout);

  const out = JSON.parse(r.stdout.trim());
  assert.equal(out.ok, true);

  const zh = readFileSync(path.join(dir, 'zh.md'), 'utf8');
  const parsed = matter(zh);
  assert.equal(parsed.data.title, '译文标题');
  assert.equal(parsed.data.sourceUrl, 'https://example.com');
  assert.equal(parsed.data.lang, 'zh');
  // Body should not include duplicated H1
  assert.ok(!/^#\s+/m.test(parsed.content.trim()));
  assert.match(parsed.content, /这是正文第一段/);
});
