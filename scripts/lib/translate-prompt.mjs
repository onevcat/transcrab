function normalizeMode(mode) {
  const m = String(mode || 'auto').trim().toLowerCase();
  if (m === 'auto' || m === 'quick' || m === 'normal' || m === 'refined') return m;
  return 'auto';
}

function renderModeGuidance(mode) {
  if (mode === 'auto') {
    return [
      '- 执行策略：自动判断（auto）。',
      '- 发布流程固定按 refined 质量标准执行。',
      '- 你需要根据主题（technology/business/life）自动选择最合适的翻译风格与语气。',
    ].join('\n');
  }

  if (mode === 'quick') {
    return '- 执行策略：直接翻译（quick）。无需显式分析步骤，优先快速可读。';
  }

  if (mode === 'normal') {
    return '- 执行策略：分析后翻译（normal）。先做术语与语气分析，再给出译文。';
  }

  return [
    '- 执行策略：精修翻译（refined）。',
    '- 先做术语与语气分析，再完成译文。',
    '- 最后进行一次审校与润色，修正不自然表达与格式问题。',
  ].join('\n');
}

export function buildTranslatePrompt(markdown, lang = 'zh', profile = {}) {
  const mode = normalizeMode(profile.mode);
  const audience = String(profile.audience || 'general').trim() || 'general';
  const style = String(profile.style || 'storytelling').trim() || 'storytelling';
  const steps = Array.isArray(profile.steps) ? profile.steps.join(' -> ') : '';
  const autoResolved = profile.autoProfile?.resolved || null;
  const autoReasons = Array.isArray(profile.autoProfile?.reasons) ? profile.autoProfile.reasons : [];
  const langName = lang === 'zh' ? '简体中文' : lang;

  return [
    `你是一个翻译助手。请把下面的 Markdown 内容翻译成${langName}。`,
    '',
    '[TransCrab Translation Profile]',
    `- mode: ${mode}`,
    `- audience: ${audience}`,
    `- style: ${style}`,
    autoResolved ? `- auto-resolved-mode: ${autoResolved.mode}` : null,
    autoResolved ? `- auto-resolved-audience: ${autoResolved.audience}` : null,
    autoResolved ? `- auto-resolved-style: ${autoResolved.style}` : null,
    autoReasons.length ? `- auto-reasons: ${autoReasons.join('；')}` : null,
    steps ? `- pipeline: ${steps}` : null,
    renderModeGuidance(mode),
    '',
    '要求：',
    '- 保留 Markdown 结构（标题/列表/引用/表格/链接）。',
    '- 代码块、命令、URL、文件路径保持原样，不要翻译。',
    '- 若正文中出现形如 @@FIGURE_SVG_001@@ 的占位符，必须原样保留（不要改写、不要删除、不要移动）。',
    '- **必须同时翻译标题**：请先输出一行 Markdown 一级标题（以 "# " 开头），作为译文标题。',
    '- 然后空一行，再输出译文正文（不要再重复标题）。',
    '- 只输出翻译结果本身，不要附加解释、不要加前后缀。',
    '',
    '---',
    String(markdown || '').trim(),
  ].filter(Boolean).join('\n');
}
