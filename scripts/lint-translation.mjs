#!/usr/bin/env node

function isCjk(ch) {
  return /[\u3400-\u9FFF]/.test(ch || '');
}

function pushIssue(issues, code, level, index, message, excerpt) {
  issues.push({ code, level, index, message, excerpt });
}

export function lintTranslation(text) {
  const src = String(text || '');
  const issues = [];

  // Specific unnatural phrase seen in smoke tests.
  for (const m of src.matchAll(/问题是[\?？]/g)) {
    pushIssue(issues, 'cn-question-colon-pattern', 'high', m.index ?? 0, '发现“问题是?”不自然写法，建议改为“问题在于：”', m[0]);
  }

  // ASCII punctuation near CJK chars: likely mixed punctuations.
  for (const m of src.matchAll(/([\u3400-\u9FFF])([\?:;,\.])|([\?:;,\.])([\u3400-\u9FFF])/g)) {
    pushIssue(issues, 'ascii-punctuation-near-cjk', 'medium', m.index ?? 0, '检测到中文邻近英文标点，建议替换为中文标点', m[0]);
  }

  // Duplicate punctuations, e.g. ？？ or ！！
  for (const m of src.matchAll(/[？！]{2,}/g)) {
    pushIssue(issues, 'duplicate-cn-punctuation', 'low', m.index ?? 0, '重复中文标点，建议保留一个', m[0]);
  }

  const score = Math.max(0, 100 - issues.reduce((s, i) => s + (i.level === 'high' ? 20 : i.level === 'medium' ? 8 : 3), 0));
  return { ok: issues.length === 0, score, issues };
}

function normalizePunctuationNearCjk(text) {
  const chars = [...String(text || '')];
  const map = { '?': '？', ':': '：', ';': '；', ',': '，', '.': '。' };

  for (let i = 0; i < chars.length; i++) {
    const c = chars[i];
    if (!(c in map)) continue;
    const prev = chars[i - 1] || '';
    const next = chars[i + 1] || '';
    if (isCjk(prev) || isCjk(next)) {
      chars[i] = map[c];
    }
  }

  return chars.join('');
}

export function autoFixTranslation(text) {
  let out = String(text || '');
  const before = out;

  out = out.replace(/问题是[\?？]/g, '问题在于：');
  out = normalizePunctuationNearCjk(out);
  out = out.replace(/([？！])\1+/g, '$1');

  return {
    text: out,
    changed: out !== before,
    before,
    after: out,
  };
}
