/// <reference types="bun" />
import { expect, test } from 'bun:test';

import { errorText } from './error-text';

test("a message written for people is kept", () => {
  expect(errorText(new Error("That code doesn't match."), 'x')).toBe("That code doesn't match.");
});

test('what fetch throws, or anything else, says the fallback', () => {
  expect(errorText(new TypeError('Network request failed'), 'Upload failed')).toBe('Upload failed');
  expect(errorText(new Error('fetch failed: Could not connect to the server.'), 'Upload failed')).toBe('Upload failed');
  expect(errorText('nope', 'Upload failed')).toBe('Upload failed');
});
