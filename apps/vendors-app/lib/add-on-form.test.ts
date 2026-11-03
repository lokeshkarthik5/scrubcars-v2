import { expect, test } from 'bun:test';
import type { AddOn } from '@repo/core/api/add-ons';

import { addOnInput, addOnReady, formFromAddOn, routesMissing } from './add-on-form';

const flat: AddOn = { id: 'a', name: 'Helmet wash', pricingType: 'flat', price: 99, priceHatchback: null, priceSedan: null, priceSuv: null, extraMins: 10, isActive: true };

test('a new form starts flat, active, with no time', () => {
  expect(formFromAddOn(null)).toMatchObject({ pricingType: 'flat', isActive: true, extraMins: '', name: '' });
});

test('editing fills the form; no extra time shows empty', () => {
  expect(formFromAddOn(flat)).toMatchObject({ name: 'Helmet wash', price: '99', extraMins: '10' });
  expect(formFromAddOn({ ...flat, extraMins: 0 }).extraMins).toBe('');
});

test('ready needs a name and the prices its type needs', () => {
  const f = formFromAddOn(null);
  expect(addOnReady(f)).toBe(false);
  expect(addOnReady({ ...f, name: 'Wash', price: '49' })).toBe(true);
  expect(addOnReady({ ...f, name: 'Wash', price: '0' })).toBe(false);
  const per = { ...f, name: 'Oil', pricingType: 'per_vehicle' as const, priceHatchback: '899', priceSedan: '999', priceSuv: '' };
  expect(addOnReady(per)).toBe(false);
  expect(addOnReady({ ...per, priceSuv: '1199' })).toBe(true);
});

test('extra minutes: whole numbers up to 480, or empty', () => {
  const f = { ...formFromAddOn(null), name: 'Wash', price: '49' };
  expect(addOnReady({ ...f, extraMins: '480' })).toBe(true);
  expect(addOnReady({ ...f, extraMins: '481' })).toBe(false);
  expect(addOnReady({ ...f, extraMins: '1.5' })).toBe(false);
  expect(addOnReady({ ...f, extraMins: '-1' })).toBe(false);
});

test('the request carries only the prices of its type, and null for no extra time', () => {
  expect(addOnInput({ ...formFromAddOn(null), name: ' Wash ', price: '49' })).toEqual({
    name: 'Wash',
    pricingType: 'flat',
    price: 49,
    extraMins: null,
    isActive: true,
  });
  const per = addOnInput({ ...formFromAddOn(null), name: 'Oil', pricingType: 'per_vehicle', price: '5', priceHatchback: '1', priceSedan: '2', priceSuv: '3', extraMins: '30' });
  expect(per).toEqual({ name: 'Oil', pricingType: 'per_vehicle', priceHatchback: 1, priceSedan: 2, priceSuv: 3, extraMins: 30, isActive: true });
});

test('a 404 means an older API: no add-ons section', () => {
  expect(routesMissing({ status: 404 })).toBe(true);
  expect(routesMissing({ status: 500 })).toBe(false);
  expect(routesMissing(new Error('x'))).toBe(false);
});
