import { expect, test } from 'bun:test';

import { uniqueCacheName } from './cache-names';

test('every upload gets its own chunk file', () => {
  const names = new Set(Array.from({ length: 500 }, () => uniqueCacheName('service-video-chunk', 'bin')));
  expect(names.size).toBe(500);
});

test('keeps the prefix and extension', () => {
  expect(uniqueCacheName('chunk', 'bin', () => 0.5)).toMatch(/^chunk-[a-z0-9]+-[a-z0-9]+\.bin$/);
});
