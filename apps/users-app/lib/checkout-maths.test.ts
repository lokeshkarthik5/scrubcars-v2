import { expect, test } from 'bun:test';

import { checkoutCreditSplit, guaranteeCovers } from './checkout-maths';

test('credit leaves the gateway its ₹1, or pays it all', () => {
  expect(checkoutCreditSplit(500, 100)).toEqual({ credit: 100, toPay: 400 });
  expect(checkoutCreditSplit(500, 500)).toEqual({ credit: 500, toPay: 0 });
  expect(checkoutCreditSplit(500, 499.5)).toEqual({ credit: 499, toPay: 1 });
});
test('the guarantee covers washes and detailing only', () => {
  expect(guaranteeCovers([{ category: 'car_wash', pricingType: 'flat' }], () => undefined)).toBe(true);
  expect(guaranteeCovers([{ category: 'car_wash', pricingType: 'on_inspection' }], () => undefined)).toBe(false);
  expect(guaranteeCovers([{ category: 'package', pricingType: 'flat', items: [{ serviceId: 'a' }] }], () => 'detailing')).toBe(true);
});
