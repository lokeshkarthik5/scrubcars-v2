import { expect, test } from 'bun:test';

import { oneAtATime } from './one-at-a-time';

test('a second job is refused while one runs, and taken after', () => {
  let current = null as string | null;
  const start = oneAtATime(
    () => current,
    (job: string) => {
      current = job;
    }
  );
  expect(start('first')).toBe(true);
  expect(start('second')).toBe(false);
  expect(current).toBe('first');
  current = null;
  expect(start('third')).toBe(true);
});
