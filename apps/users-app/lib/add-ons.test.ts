import { ApiError } from '@repo/core/api/client';
import { expect, test } from 'bun:test';

import { addOnCountLabel, addOnTimeLabel, getVendorAddOns } from './add-ons';

const row = {
  id: 'a',
  name: 'Helmet wash',
  pricingType: 'flat' as const,
  price: '99.00',
  priceHatchback: null,
  priceSedan: null,
  priceSuv: null,
  extraMins: 10,
  isActive: true,
};

test('reads the contract', async () => {
  const read = (async () => [row]) as never;
  const [addOn] = await getVendorAddOns('v1', read);
  expect(addOn.price).toBe(99);
  expect(addOn.extraMins).toBe(10);
});

test('a server without the route means no section', async () => {
  const read = (async () => {
    throw new ApiError('Not found', 404);
  }) as never;
  expect(await getVendorAddOns('v1', read)).toEqual([]);
});

test('any other failure is still a failure', async () => {
  const read = (async () => {
    throw new ApiError('Oops', 500);
  }) as never;
  await expect(getVendorAddOns('v1', read)).rejects.toThrow('Oops');
});

test('the words', () => {
  expect(addOnTimeLabel(0)).toBe('No extra time');
  expect(addOnTimeLabel(30)).toBe('+30 min');
  expect(addOnCountLabel(1)).toBe('1 add-on');
  expect(addOnCountLabel(3)).toBe('3 add-ons');
});
