import { describe, expect, test } from 'bun:test';
import { bookingLinePriceText, serviceApproxNote, servicePriceText } from './price';

// The same words as apps/users/lib/price.test.ts: native matches the web.
const base = { priceHatchback: null, priceSedan: null, priceSuv: null };

describe('servicePriceText, on inspection (0073)', () => {
  test('a fee keeps its words', () => {
    expect(servicePriceText({ ...base, pricingType: 'on_inspection', price: 1299 })).toBe('₹1,299 inspection');
  });

  test('no fee is never ₹0', () => {
    expect(servicePriceText({ ...base, pricingType: 'on_inspection', price: 0 })).toBe('Price on inspection');
    expect(servicePriceText({ ...base, pricingType: 'on_inspection', price: 0, approxPrice: 1500 })).toBe(
      'Approx ₹1,500 · price after inspection'
    );
  });
});

describe('serviceApproxNote', () => {
  test('only under an inspection fee with an approx price', () => {
    expect(serviceApproxNote({ pricingType: 'on_inspection', price: 299, approxPrice: 1500 })).toBe(
      'Approx ₹1,500 · price after inspection'
    );
    expect(serviceApproxNote({ pricingType: 'on_inspection', price: 299 })).toBeNull();
    expect(serviceApproxNote({ pricingType: 'on_inspection', price: 0, approxPrice: 1500 })).toBeNull();
    expect(serviceApproxNote({ pricingType: 'flat', price: 299, approxPrice: 1500 })).toBeNull();
  });
});

test('a no-fee inspection line is never ₹0 (0073)', () => {
  expect(bookingLinePriceText({ amount: 0, pricingType: 'on_inspection' })).toBe('Price on inspection');
  expect(bookingLinePriceText({ amount: 299, pricingType: 'on_inspection' })).toBe('₹299');
  expect(bookingLinePriceText({ amount: 1499, pricingType: 'flat' })).toBe('₹1,499');
});
