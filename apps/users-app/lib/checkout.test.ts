import { describe, expect, mock, test } from 'bun:test';

(globalThis as { __DEV__?: boolean }).__DEV__ = false;
mock.module('react-native-razorpay', () => ({
  default: { open: async () => { throw { code: 2, description: 'declined' }; } },
}));

const { classifySdkError, fakeCheckoutAllowed, openCheckout } = await import('./checkout');

describe('the local fake', () => {
  test('never in a production build, whatever the order says', () => {
    expect(fakeCheckoutAllowed('order_e2e_abc', false)).toBe(false);
    expect(fakeCheckoutAllowed('order_real', false)).toBe(false);
  });
  test('in development, only for a fake-payments order', () => {
    expect(fakeCheckoutAllowed('order_e2e_abc', true)).toBe(true);
    expect(fakeCheckoutAllowed('order_real', true)).toBe(false);
    expect(fakeCheckoutAllowed('xorder_e2e_abc', true)).toBe(false);
  });
  test('with __DEV__ false, an order_e2e_ id goes to the SDK, not the fake', async () => {
    const result = await openCheckout({ orderId: 'order_e2e_x', amount: 100, currency: 'INR', keyId: 'k' }, { description: 'd' });
    expect(result).toEqual({ kind: 'failed', message: 'declined' });
  });
});

describe('what the SDK reports', () => {
  test('cancelled, Android and iOS', () => {
    expect(classifySdkError({ code: 0, description: 'x' }).kind).toBe('cancelled');
    expect(classifySdkError({ code: 2, description: JSON.stringify({ error: { reason: 'payment_cancelled' } }) }).kind).toBe('cancelled');
    expect(classifySdkError({ code: 2, description: 'Payment Cancelled' }).kind).toBe('cancelled');
  });
  test('a failure says why', () => {
    expect(classifySdkError({ code: 2, description: JSON.stringify({ error: { description: 'Bank down' } }) })).toEqual({
      kind: 'failed',
      message: 'Bank down',
    });
  });
  test('nothing at all still fails safely', () => {
    expect(classifySdkError(undefined).kind).toBe('failed');
  });
});
