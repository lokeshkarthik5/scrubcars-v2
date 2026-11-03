import { beforeEach, describe, expect, test } from 'bun:test';

const store = (globalThis as unknown as { __secureStore: Map<string, string> }).__secureStore;

const { ApiError } = await import('@repo/core/api/client');
const { intentPollResult } = await import('@repo/core/payment-confirmation');
const { bookingKey, chargeKey, checkPending, failedTitle, giftPollResult, isPendingExpired, PENDING_PAYMENT_TTL_MS, pendingKey, pendingPayment, setPaymentFlowOnScreen } = await import('./pending-payment');
const { payCharge, startBookingPayment, startGiftPayment, paymentCalls } = await import('./charge-payment');

type Calls = typeof paymentCalls;
type Outcome = { kind: 'pending' } | { kind: 'booked'; bookingId: string } | { kind: 'failed'; message: string };

const ORDER = { orderId: 'order_1', amount: 49900, currency: 'INR', keyId: 'k', bookingId: 'b1', chargeId: 'c1' };
const booking = { id: 'b1', vendorName: 'Garage' };
const NEVER = new Promise<never>(() => undefined);

function calls(options: { outcome?: Outcome | Error; checkout?: () => Promise<unknown>; confirm?: () => Promise<unknown> } = {}) {
  const counts = { payFinalBill: 0, createPaymentOrder: 0, buyGift: 0, openCheckout: 0 };
  const made = {
    payFinalBill: async () => (counts.payFinalBill++, ORDER),
    createPaymentOrder: async () => (counts.createPaymentOrder++, ORDER),
    buyGift: async () => (counts.buyGift++, { ...ORDER, giftId: 'g1' }),
    openCheckout: (async () => (counts.openCheckout++, options.checkout ? options.checkout() : { kind: 'cancelled' })) as never,
    readOutcome: (async () => {
      if (options.outcome instanceof Error) throw options.outcome;
      return options.outcome ?? { kind: 'pending' };
    }) as never,
    confirm: (async () => (options.confirm ? options.confirm() : { kind: 'booked', bookingId: 'b1' })) as never,
  } as unknown as Calls;
  return { counts, made };
}

const charge = (chargeId = 'c1', what: 'final_bill' | 'extra_work' = 'final_bill') => ({
  what,
  booking,
  chargeId,
  description: 'Final bill',
  onPaid: () => undefined,
});
const paidWindow = async () => ({ kind: 'paid', orderId: 'order_1', paymentId: 'pay_1', signature: 's' });

beforeEach(() => {
  store.clear();
  setPaymentFlowOnScreen(false);
});

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

describe('records', () => {
  test('one payment never overwrites another, and each clears alone', () => {
    pendingPayment.write({ kind: 'charge', what: 'final_bill', bookingId: 'b1', chargeId: 'c1', vendorName: 'G', startedAt: 1 });
    pendingPayment.write({ kind: 'charge', what: 'extra_work', bookingId: 'b1', chargeId: 'c2', vendorName: 'G', startedAt: 2 });
    pendingPayment.write({ kind: 'booking', bookingId: 'b2', vendorName: 'G', startedAt: 3 });
    pendingPayment.write({ kind: 'intent', intentId: 'i1', vendorName: 'G', startedAt: 4 });
    expect(pendingPayment.list().map(pendingKey).sort()).toEqual(['booking:b2', 'charge:c1', 'charge:c2', 'intent:i1']);
    pendingPayment.clear(chargeKey('c1'));
    expect(pendingPayment.get(chargeKey('c1'))).toBeNull();
    expect(pendingPayment.get(chargeKey('c2'))).not.toBeNull();
    pendingPayment.clearAll();
    expect(pendingPayment.list()).toEqual([]);
  });

  test('watchers hear every change', () => {
    let heard = 0;
    const stop = pendingPayment.subscribe(() => heard++);
    pendingPayment.write({ kind: 'booking', bookingId: 'b1', vendorName: 'G', startedAt: 1 });
    pendingPayment.clear(bookingKey('b1'));
    stop();
    pendingPayment.clearAll();
    expect(heard).toBe(2);
  });
});

describe('one look at a record', () => {
  const record = { kind: 'booking', bookingId: 'b1', vendorName: 'G', startedAt: 1000 } as const;
  const later = 1001 + PENDING_PAYMENT_TTL_MS;

  test('a final answer ends it', async () => {
    pendingPayment.write(record);
    expect(await checkPending(record, 2000, async () => ({ kind: 'booked', bookingId: 'b1' }))).toEqual({ kind: 'booked', bookingId: 'b1' });
    expect(pendingPayment.list()).toEqual([]);
    pendingPayment.write(record);
    expect(await checkPending(record, 2000, async () => ({ kind: 'failed', message: 'x' }))).toEqual({ kind: 'failed', message: 'x' });
    expect(pendingPayment.list()).toEqual([]);
  });

  test('pending keeps it until the window has long gone', async () => {
    pendingPayment.write(record);
    expect(await checkPending(record, 2000, async () => ({ kind: 'pending' }))).toEqual({ kind: 'checking' });
    expect(pendingPayment.list().length).toBe(1);
    expect(await checkPending(record, later, async () => ({ kind: 'pending' }))).toEqual({ kind: 'none' });
    expect(pendingPayment.list()).toEqual([]);
  });

  test('no signal never lets anyone pay again, even late', async () => {
    pendingPayment.write(record);
    const offline = async () => {
      throw new TypeError('Network request failed');
    };
    expect(await checkPending(record, later, offline)).toEqual({ kind: 'checking' });
    expect(pendingPayment.list().length).toBe(1);
  });

  test('a server refusal ends it only once expired', async () => {
    pendingPayment.write(record);
    const refused = async () => {
      throw new ApiError(404, 'gone', 'NOT_FOUND');
    };
    expect(await checkPending(record, 2000, refused)).toEqual({ kind: 'checking' });
    expect(await checkPending(record, later, refused)).toEqual({ kind: 'none' });
  });
});

describe('a final bill or extra work', () => {
  test('one app kill, then a second tap: no second order', async () => {
    const first = calls({ checkout: () => NEVER });
    void payCharge(charge(), first.made);
    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(first.counts.payFinalBill).toBe(1);
    expect(pendingPayment.get(chargeKey('c1'))).not.toBeNull();

    // Killed: only the written record is left.
    setPaymentFlowOnScreen(false);
    const second = calls({ outcome: { kind: 'pending' } });
    expect(await payCharge(charge(), second.made)).toEqual({ kind: 'checking' });
    expect(second.counts).toEqual({ payFinalBill: 0, createPaymentOrder: 0, buyGift: 0, openCheckout: 0 });
    expect(pendingPayment.get(chargeKey('c1'))).not.toBeNull();
  });

  test('60 seconds unconfirmed, then a second tap: no second order', async () => {
    const first = calls({ checkout: paidWindow, confirm: async () => ({ kind: 'unconfirmed' }) });
    const result = await payCharge(charge(), first.made);
    expect(result).toMatchObject({ kind: 'paid', outcome: { kind: 'unconfirmed' } });
    expect(pendingPayment.get(chargeKey('c1'))).not.toBeNull();
    const second = calls({ outcome: { kind: 'pending' } });
    expect(await payCharge(charge(), second.made)).toEqual({ kind: 'checking' });
    expect(second.counts.payFinalBill).toBe(0);
  });

  test('re-tap after it settled paid: told so, nothing new', async () => {
    pendingPayment.write({ kind: 'charge', what: 'final_bill', bookingId: 'b1', chargeId: 'c1', vendorName: 'G', startedAt: Date.now() });
    const second = calls({ outcome: { kind: 'booked', bookingId: 'b1' } });
    expect(await payCharge(charge(), second.made)).toEqual({ kind: 'settled' });
    expect(second.counts.payFinalBill).toBe(0);
    expect(pendingPayment.list()).toEqual([]);
  });

  test('re-tap after it failed: the server\'s words, nothing new', async () => {
    pendingPayment.write({ kind: 'charge', what: 'final_bill', bookingId: 'b1', chargeId: 'c1', vendorName: 'G', startedAt: Date.now() });
    const second = calls({ outcome: { kind: 'failed', message: 'refunded' } });
    expect(await payCharge(charge(), second.made)).toEqual({ kind: 'failed-to-pay', message: 'refunded' });
    expect(second.counts.payFinalBill).toBe(0);
  });

  test('no signal on the re-tap: no second order', async () => {
    pendingPayment.write({ kind: 'charge', what: 'final_bill', bookingId: 'b1', chargeId: 'c1', vendorName: 'G', startedAt: Date.now() });
    const second = calls({ outcome: new TypeError('Network request failed') });
    expect(await payCharge(charge(), second.made)).toEqual({ kind: 'checking' });
    expect(second.counts.payFinalBill).toBe(0);
  });

  test('a window long closed with nothing paid can be paid again', async () => {
    pendingPayment.write({ kind: 'charge', what: 'final_bill', bookingId: 'b1', chargeId: 'c1', vendorName: 'G', startedAt: Date.now() - PENDING_PAYMENT_TTL_MS - 1 });
    const second = calls({ outcome: { kind: 'pending' } });
    expect(await payCharge(charge(), second.made)).toEqual({ kind: 'cancelled' });
    expect(second.counts.payFinalBill).toBe(1);
  });

  test('cancelling clears only its own record, and allows a new try', async () => {
    pendingPayment.write({ kind: 'charge', what: 'extra_work', bookingId: 'b1', chargeId: 'other', vendorName: 'G', startedAt: Date.now() });
    const first = calls();
    expect(await payCharge(charge(), first.made)).toEqual({ kind: 'cancelled' });
    expect(pendingPayment.list().map(pendingKey)).toEqual(['charge:other']);
    expect(first.counts.payFinalBill).toBe(1);
  });

  test('a pending bill does not stop another charge', async () => {
    pendingPayment.write({ kind: 'charge', what: 'final_bill', bookingId: 'b1', chargeId: 'c1', vendorName: 'G', startedAt: Date.now() });
    const other = calls();
    expect(await payCharge(charge('c2', 'extra_work'), other.made)).toEqual({ kind: 'cancelled' });
    expect(other.counts.payFinalBill).toBe(1);
    expect(pendingPayment.get(chargeKey('c1'))).not.toBeNull();
  });
});

describe('a pay-later booking', () => {
  test('makes one order and writes its record first time', async () => {
    const first = calls();
    const started = await startBookingPayment(booking, first.made);
    expect(started.kind).toBe('order');
    expect(first.counts.createPaymentOrder).toBe(1);
    expect(pendingPayment.get(bookingKey('b1'))).not.toBeNull();
  });

  test('one app kill, then a second tap: no second order', async () => {
    await startBookingPayment(booking, calls().made);
    const second = calls({ outcome: { kind: 'pending' } });
    expect(await startBookingPayment(booking, second.made)).toEqual({ kind: 'checking' });
    expect(second.counts.createPaymentOrder).toBe(0);
  });

  test('settled paid or refused on the re-tap: no second order', async () => {
    await startBookingPayment(booking, calls().made);
    const paid = calls({ outcome: { kind: 'booked', bookingId: 'b1' } });
    expect(await startBookingPayment(booking, paid.made)).toEqual({ kind: 'booked', bookingId: 'b1' });
    expect(paid.counts.createPaymentOrder).toBe(0);
    await startBookingPayment(booking, calls().made);
    const failed = calls({ outcome: { kind: 'failed', message: 'x' } });
    expect(await startBookingPayment(booking, failed.made)).toEqual({ kind: 'failed', message: 'x' });
    expect(failed.counts.createPaymentOrder).toBe(0);
  });

  test('another booking is not held up', async () => {
    await startBookingPayment(booking, calls().made);
    const other = calls({ outcome: { kind: 'pending' } });
    expect((await startBookingPayment({ id: 'b2', vendorName: 'G' }, other.made)).kind).toBe('order');
    expect(other.counts.createPaymentOrder).toBe(1);
  });
});

describe('a gift', () => {
  const payload = { amount: 1000, recipientName: 'Meena', design: 'shine' as const };

  test('one app kill, then a second tap: no second gift', async () => {
    const first = calls();
    expect((await startGiftPayment(payload, first.made)).kind).toBe('order');
    expect(first.counts.buyGift).toBe(1);
    const second = calls({ outcome: { kind: 'pending' } });
    expect(await startGiftPayment(payload, second.made)).toEqual({ kind: 'checking' });
    expect(second.counts.buyGift).toBe(0);
  });

  test('paid while away: said so, nothing new', async () => {
    await startGiftPayment(payload, calls().made);
    const second = calls({ outcome: { kind: 'booked', bookingId: '' } });
    expect((await startGiftPayment(payload, second.made)).kind).toBe('booked');
    expect(second.counts.buyGift).toBe(0);
  });

  test('what its state means', () => {
    expect(giftPollResult({ state: 'pending' })).toEqual({ kind: 'pending' });
    expect(giftPollResult({ state: 'available' }).kind).toBe('booked');
    expect(giftPollResult({ state: 'redeemed' }).kind).toBe('booked');
    expect(giftPollResult({ state: 'cancelled' }).kind).toBe('failed');
  });
});

test('a failed payment is named for what it was', () => {
  expect(failedTitle('gift')).not.toContain('booking');
  expect(failedTitle('charge')).not.toContain('booking');
  expect(failedTitle('intent')).toContain('booking');
  expect(failedTitle('booking')).toContain('booking');
});
