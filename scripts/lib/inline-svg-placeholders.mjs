export function extractInlineSvgFigurePlaceholders(markdown, options = {}) {
  const tokenPrefix = String(options.tokenPrefix || 'FIGURE_SVG').trim() || 'FIGURE_SVG';
  const source = String(markdown || '');

  const placeholders = [];
  let index = 0;

  const figureWithSvg = /<figure[\s\S]*?<svg[\s\S]*?<\/svg>[\s\S]*?<\/figure>/gi;
  const transformed = source.replace(figureWithSvg, (block) => {
    index += 1;
    const id = `@@${tokenPrefix}_${String(index).padStart(3, '0')}@@`;
    placeholders.push({ id, html: block });
    return `\n${id}\n`;
  });

  return {
    markdown: transformed,
    placeholders,
  };
}

export function restoreInlineSvgFigurePlaceholders(markdown, placeholders = []) {
  let out = String(markdown || '');
  const missing = [];

  for (const p of placeholders) {
    const id = String(p?.id || '').trim();
    const html = String(p?.html || '');
    if (!id) continue;

    if (!out.includes(id)) {
      missing.push(id);
      continue;
    }

    out = out.split(id).join(html);
  }

  return {
    markdown: out,
    missing,
  };
}
