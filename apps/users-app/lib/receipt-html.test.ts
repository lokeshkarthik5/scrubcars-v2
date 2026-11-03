import { expect, test } from 'bun:test';

import { escapeHtml } from './receipt-html';

test('nothing from the server can write into the page', () => {
  expect(escapeHtml('<img src=x onerror="a()">')).toBe('&lt;img src=x onerror=&quot;a()&quot;&gt;');
  expect(escapeHtml(null)).toBe('');
});
