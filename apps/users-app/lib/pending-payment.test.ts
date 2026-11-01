import { expect, mock, test } from 'bun:test';

mock.module('expo-secure-store', () => ({ getItem: () => null, setItem: () => undefined, deleteItemAsync: async () => undefined }));

const { intentPollResult } = await import('@repo/core/payment-confirmation');
const { isPendingExpired, PENDING_PAYMENT_TTL_MS } = await import('./pending-payment');

test('what an intent says on return is never a false success', () => {
  expect(intentPollResult({ status: 'pending', bookingId: null, message: null })).toEqual({ kind: 'pending' });
  expect(intentPollResult({ status: 'consumed', bookingId: null, message: null })).toEqual({ kind: 'pending' });
  expect(intentPollResult({ status: 'consumed', bookingId: 'b', message: null })).toEqual({ kind: 'booked', bookingId: 'b' });
  expect(intentPollResult({ status: 'failed', bookingId: null, message: 'x' })).toEqual({ kind: 'failed', message: 'x' });
});

test('forgotten only after the checkout window has long gone', () => {
  expect(isPendingExpired({ startedAt: 1000 }, 1000 + PENDING_PAYMENT_TTL_MS)).toBe(false);
  expect(isPendingExpired({ startedAt: 1000 }, 1001 + PENDING_PAYMENT_TTL_MS)).toBe(true);
});
