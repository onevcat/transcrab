import test from 'node:test';
import assert from 'node:assert/strict';
import { lintTranslation, autoFixTranslation } from '../scripts/lint-translation.mjs';

test('lintTranslation detects problematic Chinese punctuation patterns', () => {
  const md = '# T\n\n问题是？ 这是一段 text: with 中文?\n';
  const report = lintTranslation(md);
  assert.ok(report.issues.some((x) => x.code === 'cn-question-colon-pattern'));
  assert.ok(report.issues.some((x) => x.code === 'ascii-punctuation-near-cjk'));
});

test('autoFixTranslation normalizes common punctuation and phrase', () => {
  const md = '# T\n\n问题是？ 这是一段 text: with 中文?\n';
  const fixed = autoFixTranslation(md);
  assert.match(fixed.text, /问题在于：/);
  assert.match(fixed.text, /中文？/);
  assert.equal(fixed.changed, true);
});
