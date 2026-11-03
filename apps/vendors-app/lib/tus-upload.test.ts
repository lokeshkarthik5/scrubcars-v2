/// <reference types="bun" />
import { expect, test } from 'bun:test';

import { isRetriable, TUS_CHUNK_BYTES, TUS_FAILED_MESSAGE, TusHttpError, type TusIO, tusUpload } from './tus-upload';

const KB = 1024;

/** A server that keeps the bytes it was sent, and a file of `size` bytes whose byte i is i % 251. */
function fake(size: number, script: { patchFails?: (call: number, offset: number) => Error | null; headFails?: number } = {}) {
  const file = Uint8Array.from({ length: size }, (_, i) => i % 251);
  const received: number[] = [];
  let patches = 0;
  let heads = 0;
  const sleeps: number[] = [];
  const io: TusIO = {
    async head() {
      heads += 1;
      if (script.headFails && heads <= script.headFails) throw new Error('offline');
      return received.length;
    },
    async read(offset, length) {
      return file.slice(offset, offset + length);
    },
    async patch(_url, offset, bytes, onSent) {
      patches += 1;
      const fail = script.patchFails?.(patches, offset);
      if (fail) throw fail;
      if (offset !== received.length) throw new TusHttpError(409);
      onSent(bytes.length);
      received.push(...bytes);
      return received.length;
    },
    async sleep(ms) {
      sleeps.push(ms);
    },
  };
  return { io, file, received, sleeps, counts: () => ({ patches, heads }) };
}

test('the file goes up in chunks, in order, and the progress ends at 1', async () => {
  const f = fake(25 * KB);
  const seen: number[] = [];
  await tusUpload({ url: 'u', size: 25 * KB, io: f.io, onProgress: (x) => seen.push(x), chunkBytes: 10 * KB });
  expect(Uint8Array.from(f.received)).toEqual(f.file);
  expect(f.counts().patches).toBe(3);
  expect(seen[0]).toBe(0);
  expect(seen.at(-1)).toBe(1);
  expect([...seen].sort((a, b) => a - b)).toEqual(seen);
});

test('a chunk that fails is tried again after the web delays, and the offset is asked for first', async () => {
  const f = fake(20 * KB, { patchFails: (call) => (call === 2 ? new Error('dropped') : null) });
  await tusUpload({ url: 'u', size: 20 * KB, io: f.io, onProgress: () => {}, chunkBytes: 10 * KB });
  expect(Uint8Array.from(f.received)).toEqual(f.file);
  expect(f.sleeps).toEqual([0]);
  expect(f.counts().heads).toBe(2);
});

test('it gives up after the last delay with the web message', async () => {
  const f = fake(10 * KB, { patchFails: () => new Error('down') });
  await expect(
    tusUpload({ url: 'u', size: 10 * KB, io: f.io, onProgress: () => {}, chunkBytes: 10 * KB })
  ).rejects.toThrow(TUS_FAILED_MESSAGE);
  expect(f.sleeps).toEqual([0, 3000, 10000, 20000]);
});

test('a refusal that will not change is not retried', async () => {
  const f = fake(10 * KB, { patchFails: () => new TusHttpError(403) });
  await expect(
    tusUpload({ url: 'u', size: 10 * KB, io: f.io, onProgress: () => {}, chunkBytes: 10 * KB })
  ).rejects.toThrow(TUS_FAILED_MESSAGE);
  expect(f.sleeps).toEqual([]);
});

test('an upload the server already holds part of carries on from its offset', async () => {
  const f = fake(30 * KB);
  f.received.push(...f.file.slice(0, 10 * KB));
  await tusUpload({ url: 'u', size: 30 * KB, io: f.io, onProgress: () => {}, chunkBytes: 10 * KB });
  expect(Uint8Array.from(f.received)).toEqual(f.file);
  expect(f.counts().patches).toBe(2);
});

test('a reply that does not move the offset forward is asked about again', async () => {
  let call = 0;
  const f = fake(10 * KB);
  const io: TusIO = {
    ...f.io,
    async patch(url, offset, bytes, onSent) {
      call += 1;
      const next = await f.io.patch(url, offset, bytes, onSent);
      return call === 1 ? offset : next;
    },
  };
  // The first answer is lost: the server has the chunk, the HEAD that follows says so.
  await tusUpload({ url: 'u', size: 10 * KB, io, onProgress: () => {}, chunkBytes: 10 * KB });
  expect(Uint8Array.from(f.received)).toEqual(f.file);
});

test('which failures are tried again', () => {
  expect(isRetriable(new Error('offline'))).toBe(true);
  expect(isRetriable(new TusHttpError(500))).toBe(true);
  expect(isRetriable(new TusHttpError(409))).toBe(true);
  expect(isRetriable(new TusHttpError(429))).toBe(true);
  expect(isRetriable(new TusHttpError(404))).toBe(false);
  expect(isRetriable(new TusHttpError(413))).toBe(false);
});

test('the chunk is a multiple of 256 KiB and at least 5 MiB, which Stream asks for', () => {
  expect(TUS_CHUNK_BYTES % (256 * KB)).toBe(0);
  expect(TUS_CHUNK_BYTES).toBeGreaterThanOrEqual(5 * 1024 * KB);
});
