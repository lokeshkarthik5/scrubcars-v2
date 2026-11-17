import { describe, expect, test } from 'bun:test';

import { bytesToBase64 } from './base64';

describe('bytesToBase64', () => {
  test('matches Node for every padding case', () => {
    for (const length of [0, 1, 2, 3, 4, 5, 300]) {
      const bytes = Uint8Array.from({ length }, (_, i) => (i * 37 + 11) % 256);
      expect(bytesToBase64(bytes)).toBe(Buffer.from(bytes).toString('base64'));
    }
  });
});
