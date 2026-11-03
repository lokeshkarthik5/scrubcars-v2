import { describe, expect, test } from 'bun:test';

import { checkoutCreditSplit, confirmOrderTotal, guaranteeCovers } from './checkout-maths';

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

describe('the order total before Razorpay opens', () => {
  const asks = (answer: boolean) => {
    const asked: number[] = [];
    return { asked, ask: async (rupees: number) => (asked.push(rupees), answer) };
  };

  test('the same figure goes straight on', async () => {
    const { asked, ask } = asks(false);
    expect(await confirmOrderTotal(49900, 499, ask)).toBe(true);
    expect(await confirmOrderTotal(49840, 498.4, ask)).toBe(true);
    expect(asked).toEqual([]);
  });

  test('a different figure stops until the server total is confirmed', async () => {
    const no = asks(false);
    expect(await confirmOrderTotal(59900, 499, no.ask)).toBe(false);
    expect(no.asked).toEqual([599]);
    const yes = asks(true);
    expect(await confirmOrderTotal(59900, 499, yes.ask)).toBe(true);
  });

  test('nothing on screen is never taken as agreement', async () => {
    const { asked, ask } = asks(false);
    expect(await confirmOrderTotal(49900, null, ask)).toBe(false);
    expect(asked).toEqual([499]);
  });
});
