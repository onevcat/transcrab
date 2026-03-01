import test from 'node:test';
import assert from 'node:assert/strict';

import { extractXStatusId, fxtwitterArticleToMarkdown } from '../scripts/x-article.mjs';

test('x-article: extractXStatusId', () => {
  assert.equal(extractXStatusId('https://x.com/user/status/1234567890'), '1234567890');
  assert.equal(extractXStatusId('https://twitter.com/user/status/42?s=1'), '42');
  assert.equal(extractXStatusId('https://example.com/user/status/42'), null);
});

test('x-article: fxtwitterArticleToMarkdown basic blocks', () => {
  const json = {
    tweet: {
      article: {
        title: 'T',
        content: {
          blocks: [
            { type: 'unstyled', text: 'P1' },
            { type: 'header-one', text: 'H' },
            { type: 'ordered-list-item', text: 'A' },
            { type: 'unordered-list-item', text: 'B' },
            { type: 'blockquote', text: 'Q' },
            { type: 'atomic', text: ' ', entityRanges: [{ key: 1, offset: 0, length: 1 }] },
          ],
          entityMap: [
            { key: '1', value: { type: 'LINK', data: { url: 'https://x.com/foo' } } },
          ],
        },
      },
    },
  };

  const { title, markdown } = fxtwitterArticleToMarkdown(json);
  assert.equal(title, 'T');
  assert.match(markdown, /P1/);
  assert.match(markdown, /## H/);
  assert.match(markdown, /1\. A/);
  assert.match(markdown, /- B/);
  assert.match(markdown, /> Q/);
  assert.match(markdown, /https:\/\/x\.com\/foo/);
});
