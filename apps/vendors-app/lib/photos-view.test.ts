/// <reference types="bun" />
import { expect, test } from 'bun:test';

import { logoProblem, photoProblem, tileSize } from './photos-view';

const jpeg = { name: 'shop.jpg', mimeType: 'image/jpeg', size: 1_000_000 };

test('a logo of the right type and size can go', () => {
  expect(logoProblem(jpeg)).toBeNull();
  expect(logoProblem({ ...jpeg, mimeType: 'image/png' })).toBeNull();
  expect(logoProblem({ ...jpeg, mimeType: 'image/webp' })).toBeNull();
  expect(logoProblem({ ...jpeg, mimeType: 'image/heic' })).toBeNull();
  expect(logoProblem({ ...jpeg, size: undefined })).toBeNull();
});

test('the logo toasts are the web\'s', () => {
  expect(logoProblem({ ...jpeg, mimeType: 'image/gif' })).toBe('Unsupported type (use JPEG, PNG or WebP)');
  expect(logoProblem({ ...jpeg, mimeType: undefined })).toBe('Unsupported type (use JPEG, PNG or WebP)');
  expect(logoProblem({ ...jpeg, size: 100 * 1024 * 1024 + 1 })).toBe('Logo too large (max 5 MB)');
  // A 12 MB phone photo is shrunk by prepareForUpload; its sent size is what is held to 5 MB.
  expect(logoProblem({ ...jpeg, size: 12 * 1024 * 1024 })).toBeNull();
});

test('the photo toasts name the file', () => {
  expect(photoProblem({ ...jpeg, name: 'a.gif', mimeType: 'image/gif' })).toBe(
    'a.gif: unsupported type (use JPEG, PNG or WebP)'
  );
  expect(photoProblem({ ...jpeg, name: 'big.jpg', size: 101 * 1024 * 1024 })).toBe('big.jpg: too large (max 5 MB)');
  expect(photoProblem({ ...jpeg, name: 'camera.jpg', size: 9 * 1024 * 1024 })).toBeNull();
  expect(photoProblem(jpeg)).toBeNull();
});

test('two columns with a gap', () => {
  expect(tileSize(358)).toBe(175);
  expect(tileSize(0)).toBe(0);
});
