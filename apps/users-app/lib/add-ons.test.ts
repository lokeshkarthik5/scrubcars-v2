import { ApiError } from '@repo/core/api/client';
import { expect, test } from 'bun:test';

import { addOnCountLabel, addOnTimeLabel, getVendorAddOns } from './add-ons';

test('a server without the route means no section', async () => {
  const get = (async () => {
    throw new ApiError(404, 'Not found');
  }) as never;
  expect(await getVendorAddOns('v1', get)).toEqual([]);
});

test('any other failure is still a failure', async () => {
  const get = (async () => {
    throw new ApiError(500, 'Oops');
  }) as never;
  await expect(getVendorAddOns('v1', get)).rejects.toThrow('Oops');
});

test('the words', () => {
  expect(addOnTimeLabel(0)).toBe('No extra time');
  expect(addOnTimeLabel(30)).toBe('+30 min');
  expect(addOnCountLabel(1)).toBe('1 add-on');
  expect(addOnCountLabel(3)).toBe('3 add-ons');
});
