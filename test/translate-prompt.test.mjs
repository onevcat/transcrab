import test from 'node:test';
import assert from 'node:assert/strict';
import { buildTranslatePrompt } from '../scripts/lib/translate-prompt.mjs';

test('buildTranslatePrompt: auto mode asks model to self-select strategy', () => {
  const prompt = buildTranslatePrompt('# T', 'zh', {
    mode: 'auto',
    audience: 'general',
    style: 'storytelling',
    steps: ['auto-analyze', 'translate'],
    autoProfile: {
      resolved: { mode: 'refined', audience: 'technical', style: 'technical' },
      reasons: ['检测到代码块或表格，优先技术型表达'],
    },
  });
  assert.match(prompt, /mode: auto/);
  assert.match(prompt, /auto-resolved-mode: refined/);
  assert.match(prompt, /自动判断/);
});

test('buildTranslatePrompt: quick mode uses direct translation contract', () => {
  const prompt = buildTranslatePrompt('# T', 'zh', { mode: 'quick', audience: 'general', style: 'storytelling', steps: ['translate'] });
  assert.match(prompt, /mode: quick/);
  assert.match(prompt, /直接翻译/);
  assert.doesNotMatch(prompt, /分析后翻译/);
});

test('buildTranslatePrompt: normal mode contains analyze then translate guidance', () => {
  const prompt = buildTranslatePrompt('# T', 'zh', { mode: 'normal', audience: 'technical', style: 'formal', steps: ['analyze', 'translate'] });
  assert.match(prompt, /mode: normal/);
  assert.match(prompt, /分析后翻译/);
  assert.match(prompt, /audience: technical/);
  assert.match(prompt, /style: formal/);
});

test('buildTranslatePrompt: refined mode contains review and polish guidance', () => {
  const prompt = buildTranslatePrompt('# T', 'zh', { mode: 'refined', audience: 'general', style: 'storytelling', steps: ['analyze', 'translate', 'review', 'revise'] });
  assert.match(prompt, /mode: refined/);
  assert.match(prompt, /审校/);
  assert.match(prompt, /润色/);
});

test('buildTranslatePrompt: includes placeholder preservation contract for inline SVG tokens', () => {
  const prompt = buildTranslatePrompt('@@FIGURE_SVG_001@@\n\ntext', 'zh', { mode: 'normal' });
  assert.match(prompt, /@@FIGURE_SVG_001@@/);
  assert.match(prompt, /占位符/);
  assert.match(prompt, /原样保留/);
});
