import { expect, test } from 'bun:test';

import { extensionFor, isInside, privateFileName, SWEPT_CACHE_DIRS } from './private-files';

const CACHE = 'file:///var/mobile/Containers/Data/Application/ABC/Library/Caches/';

test('only files inside the cache are ever deleted', () => {
  expect(isInside(`${CACHE}ImagePicker/a.jpeg`, CACHE)).toBe(true);
  expect(isInside('file:///var/mobile/Media/DCIM/100APPLE/IMG_1.JPG', CACHE)).toBe(false);
  expect(isInside(`${CACHE}../Documents/a.jpg`, CACHE)).toBe(false);
  expect(isInside(CACHE, CACHE)).toBe(false);
  expect(isInside(`${CACHE}ImagePicker/a.jpeg?x=1`, CACHE.slice(0, -1))).toBe(true);
  expect(isInside('file:///var/mobile/Containers/Data/Application/ABC/Library/Caches2/a.jpg', CACHE)).toBe(false);
});

test('a private file is named without the document name, and uniquely', () => {
  const a = privateFileName('application/pdf');
  const b = privateFileName('application/pdf');
  expect(a).toMatch(/^private-[a-z0-9-]+\.pdf$/);
  expect(a).not.toBe(b);
  expect(extensionFor('IMAGE/JPEG')).toBe('jpg');
  expect(extensionFor('text/csv')).toBe('csv');
  expect(extensionFor('application/x-weird')).toBe('bin');
});

test('the sweep covers the app folder and the picker copies', () => {
  expect(SWEPT_CACHE_DIRS).toContain('ImagePicker');
  expect(SWEPT_CACHE_DIRS).toContain('DocumentPicker');
  expect(SWEPT_CACHE_DIRS).toContain('detlio-private');
});
