/// <reference types="bun" />
import { expect, test } from 'bun:test';

import { bumpEpoch, readGuarded } from './session-epoch';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

test('a read that lands in time is kept', async () => {
  let resets = 0;
  expect(await readGuarded(async () => ['job'], () => (resets += 1))).toEqual(['job']);
  expect(resets).toBe(0);
});

test("a read from before a sign-out or a switch empties what it wrote, and answers nothing", async () => {
  let store: string[] = [];
  const read = deferred<string[]>();
  const guarded = readGuarded(
    () =>
      read.promise.then((jobs) => {
        store = jobs; // as core's store does
        return jobs;
      }),
    () => {
      store = [];
    }
  );
  bumpEpoch();
  read.resolve(["the last garage's job"]);
  expect(await guarded).toBeNull();
  expect(store).toEqual([]);
});

test('a read started after the change is not touched by the old one', async () => {
  bumpEpoch();
  expect(await readGuarded(async () => ['new'], () => undefined)).toEqual(['new']);
});

test('a failure from before the change is dropped; one now is thrown', async () => {
  const old = deferred<string[]>();
  const guarded = readGuarded(() => old.promise, () => undefined);
  bumpEpoch();
  old.reject(new Error('401'));
  expect(await guarded).toBeNull();
  await expect(readGuarded(() => Promise.reject(new Error('down')), () => undefined)).rejects.toThrow('down');
});
