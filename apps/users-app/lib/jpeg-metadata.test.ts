/// <reference types="bun" />
import { expect, test } from 'bun:test';

import { jpegHasLocation } from './jpeg-metadata';

/** A JPEG: SOI, the given segments, start of scan. */
function jpeg(...segments: number[][]) {
  return Uint8Array.from([0xff, 0xd8, ...segments.flat(), 0xff, 0xda, 0x00, 0x02, 0xff, 0xd9]);
}
function app1(payload: number[]) {
  const length = payload.length + 2;
  return [0xff, 0xe1, length >> 8, length & 255, ...payload];
}
const text = (s: string) => [...s].map((c) => c.charCodeAt(0));

/** Exif with one directory holding the given tags, in the given byte order. */
function exif(tags: number[], little: boolean) {
  const u16 = (n: number) => (little ? [n & 255, n >> 8] : [n >> 8, n & 255]);
  const u32 = (n: number) => (little ? [n, 0, 0, 0] : [0, 0, 0, n]);
  return app1([
    ...text('Exif'),
    0,
    0,
    ...(little ? [0x49, 0x49] : [0x4d, 0x4d]),
    ...u16(42),
    ...u32(8),
    ...u16(tags.length),
    ...tags.flatMap((tag) => [...u16(tag), ...u16(4), ...u32(1), ...u32(0)]),
  ]);
}

test('a GPS block in the EXIF is found, in either byte order', () => {
  expect(jpegHasLocation(jpeg(exif([0x0112, 0x8825], true)))).toBe(true);
  expect(jpegHasLocation(jpeg(exif([0x8825], false)))).toBe(true);
});

test('EXIF without a GPS block is not location', () => {
  expect(jpegHasLocation(jpeg(exif([0x0112, 0x0131], true)))).toBe(false);
});

test('GPS fields in XMP are found', () => {
  expect(jpegHasLocation(jpeg(app1(text('http://ns.adobe.com/xap/1.0/ exif:GPSLatitude="13"'))))).toBe(true);
  expect(jpegHasLocation(jpeg(app1(text('http://ns.adobe.com/xap/1.0/ nothing here'))))).toBe(false);
});

test('a plain JPEG, and anything that is not one, is clean', () => {
  expect(jpegHasLocation(jpeg([0xff, 0xe0, 0x00, 0x04, 0x4a, 0x46]))).toBe(false);
  expect(jpegHasLocation(Uint8Array.from([1, 2, 3, 4]))).toBe(false);
});
