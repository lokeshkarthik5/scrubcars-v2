/// <reference types="bun" />
import { expect, mock, test } from 'bun:test';

// The rule only: the React and native parts of this module are not under test.
mock.module('expo-constants', () => ({ default: { expoConfig: { version: '1.0.0' } } }));
mock.module('react-native', () => ({ AppState: {}, Platform: { OS: 'ios' } }));

const { mustUpdate } = await import('./app-config');

test('only a clear yes from the server stops anyone', () => {
  expect(mustUpdate({ updateRequired: true, minVersion: '1.2.0', latestVersion: '1.2.0', storeUrl: null })).toBe(true);
  for (const answer of [
    { updateRequired: false },
    {},
    null,
    undefined,
    'true',
    { updateRequired: 'true' },
    { updateRequired: 1 },
  ]) {
    expect(mustUpdate(answer)).toBe(false);
  }
});
