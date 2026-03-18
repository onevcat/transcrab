import test from 'node:test';
import assert from 'node:assert/strict';

import { htmlToMarkdown, buildTranslatePrompt, makeSlug } from '../scripts/transcrab-core.mjs';

test('transcrab-core: makeSlug', () => {
  assert.equal(makeSlug('Hello World!'), 'hello-world');
});

test('transcrab-core: htmlToMarkdown extracts title + fenced code + guesses JSX when no tags', async () => {
  const html = `<!doctype html>
  <html><head><meta charset="utf-8" />
    <title>Test Article Title</title>
  </head>
  <body>
    <article>
      <h1>Test Article Title</h1>
      <p>Hello world.</p>
      <pre><code>function ThemeProvider({ children }) {\n  const [theme, setTheme] = useState('light')\n  return &lt;div className={theme}&gt;{children}&lt;/div&gt;\n}</code></pre>
    </article>
  </body></html>`;

  const { title, markdown } = await htmlToMarkdown(html, 'https://example.com/x');
  assert.equal(title, 'Test Article Title');
  assert.match(markdown, /Hello world\./);
  // No language tags in HTML, so we rely on heuristic.
  assert.match(markdown, /```jsx\n/);
});

test('transcrab-core: preserves headings from direct article body when available', async () => {
  const html = `<!doctype html>
  <html><head><meta charset="utf-8" />
    <title>Substack-like</title>
  </head>
  <body>
    <article>
      <div class="available-content">
        <div class="body markup">
          <p>Intro paragraph with enough content to pass threshold. Intro paragraph with enough content to pass threshold. Intro paragraph with enough content to pass threshold. Intro paragraph with enough content to pass threshold.</p>
          <h2><strong>We have to give up on reading all the code</strong></h2>
          <p>Body text after heading.</p>
          <h3><strong>Layer 1: Compare Multiple Options</strong></h3>
          <p>Another paragraph.</p>
        </div>
      </div>
    </article>
  </body></html>`;

  const { markdown } = await htmlToMarkdown(html, 'https://example.com/substack-like');
  assert.match(markdown, /^## \*\*We have to give up on reading all the code\*\*/m);
  assert.match(markdown, /^### \*\*Layer 1: Compare Multiple Options\*\*/m);
});

test('transcrab-core: normalizes multiline linked images into markdown link-image', async () => {
  const html = `<!doctype html>
  <html><head><meta charset="utf-8" /><title>Img Link</title></head>
  <body>
    <article>
      <div class="available-content">
        <div class="body markup">
          <p>Intro text Intro text Intro text Intro text Intro text Intro text Intro text Intro text Intro text Intro text Intro text Intro text Intro text Intro text Intro text.</p>
          <a href="https://example.com/full.png"><div><picture><img src="https://example.com/thumb.png" /></picture></div></a>
          <p>Tail text.</p>
        </div>
      </div>
    </article>
  </body></html>`;

  const { markdown } = await htmlToMarkdown(html, 'https://example.com/p');
  assert.match(markdown, /\[!\[]\(https:\/\/example\.com\/thumb\.png\)\]\(https:\/\/example\.com\/full\.png\)/);
  assert.doesNotMatch(markdown, /\[\s*\n\s*!\[]\(/m);
});

test('transcrab-core: absolutizes root-relative asset URLs in extracted content', async () => {
  const html = `<!doctype html>
  <html><head><meta charset="utf-8" /><title>Assets</title></head>
  <body>
    <article>
      <div class="available-content">
        <div class="body markup">
          <p>Intro Intro Intro Intro Intro Intro Intro Intro Intro Intro Intro Intro Intro Intro Intro Intro Intro Intro Intro Intro.</p>
          <figure>
            <img src="/alphazero-fig5.jpg" alt="fig" />
            <figcaption><a href="/ref/page">ref</a></figcaption>
          </figure>
        </div>
      </div>
    </article>
  </body></html>`;

  const { markdown } = await htmlToMarkdown(html, 'https://randomlabs.ai/blog/slate');
  assert.match(markdown, /https:\/\/randomlabs\.ai\/alphazero-fig5\.jpg/);
  assert.match(markdown, /https:\/\/randomlabs\.ai\/ref\/page/);
  assert.doesNotMatch(markdown, /src="\//);
});

test('transcrab-core: buildTranslatePrompt contains contract and content', () => {
  const md = '# T\n\nHello';
  const prompt = buildTranslatePrompt(md, 'zh');
  assert.match(prompt, /你是一个翻译助手/);
  assert.match(prompt, /---/);
  assert.match(prompt, /# T/);
});
