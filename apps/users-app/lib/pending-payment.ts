import { getBooking } from '@repo/core/api/bookings';
import { ApiError } from '@repo/core/api/client';
import { getBookingIntentStatus } from '@repo/core/api/payments';
import { extraWorkPollResult, FALLBACK_REFUND_MESSAGE, finalBillPollResult, intentPollResult, type PollResult } from '@repo/core/payment-confirmation';

import { useSyncExternalStore } from 'react';

import { devicePrefs } from './device-prefs';

/**
 * Payments under way, one record each, written before Razorpay's window opens. If the app is
 * killed mid-payment the webhook still settles it on the server; this is how the app finds out
 * and shows the real outcome on return, and how a second tap on Pay is stopped from paying
 * twice. A bill and an extra-work charge can both be open: neither overwrites the other.
 */
const KEY = 'detlio.pendingPayments';

/** Razorpay's window can't be up longer than this; past it, a pending intent never paid. */
export const PENDING_PAYMENT_TTL_MS = 30 * 60 * 1000;

export type PendingPayment =
  | { kind: 'intent'; intentId: string; vendorName: string; startedAt: number }
  | { kind: 'charge'; what: 'final_bill' | 'extra_work'; bookingId: string; chargeId: string; vendorName: string; startedAt: number }
  | { kind: 'booking'; bookingId: string; vendorName: string; startedAt: number };

export const chargeKey = (chargeId: string) => `charge:${chargeId}`;
export const bookingKey = (bookingId: string) => `booking:${bookingId}`;

export function pendingKey(payment: PendingPayment): string {
  if (payment.kind === 'intent') return `intent:${payment.intentId}`;
  return payment.kind === 'charge' ? chargeKey(payment.chargeId) : bookingKey(payment.bookingId);
}

function readAll(): Record<string, PendingPayment> {
  try {
    const raw = devicePrefs.getItem(KEY);
    return raw ? (JSON.parse(raw) as Record<string, PendingPayment>) : {};
  } catch {
    return {};
  }
}

const listeners = new Set<() => void>();
function save(all: Record<string, PendingPayment>) {
  devicePrefs.setItem(KEY, JSON.stringify(all));
  listeners.forEach((listener) => listener());
}

export const pendingPayment = {
  list: (): PendingPayment[] => Object.values(readAll()),
  get: (key: string): PendingPayment | null => readAll()[key] ?? null,
  write: (payment: PendingPayment) => save({ ...readAll(), [pendingKey(payment)]: payment }),
  clear(key: string) {
    const { [key]: _gone, ...rest } = readAll();
    save(rest);
  },
  clearAll: () => save({}),
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
};

export const isPendingExpired = (payment: Pick<PendingPayment, 'startedAt'>, now: number) =>
  now - payment.startedAt > PENDING_PAYMENT_TTL_MS;

/** The same for a list of charges: which are being checked. */
export function usePendingKeys(): string[] {
  const joined = useSyncExternalStore(pendingPayment.subscribe, () => pendingPayment.list().map(pendingKey).join(','));
  return joined ? joined.split(',') : [];
}

/** Whether Pay should read "checking your payment" for this one. PaymentRecovery resolves it. */
export const usePendingPayment = (key: string): boolean =>
  useSyncExternalStore(pendingPayment.subscribe, () => pendingPayment.get(key) !== null);

/** The flow on screen owns the record while it's paying; the recovery check leaves it alone. */
let flowOnScreen = false;
export const setPaymentFlowOnScreen = (value: boolean) => {
  flowOnScreen = value;
};
export const paymentFlowOnScreen = () => flowOnScreen;

/** What the server says about it now. Never guesses: no answer is `pending`. */
export async function readPendingOutcome(payment: PendingPayment): Promise<PollResult> {
  if (payment.kind === 'intent') return intentPollResult(await getBookingIntentStatus(payment.intentId));
  const booking = await getBooking(payment.bookingId);
  if (!booking) return { kind: 'pending' };
  if (payment.kind === 'booking') {
    if (booking.paymentStatus !== 'paid') return { kind: 'pending' };
    return booking.status === 'cancelled'
      ? { kind: 'failed', message: booking.cancellationReason ?? FALLBACK_REFUND_MESSAGE }
      : { kind: 'booked', bookingId: payment.bookingId };
  }
  return payment.what === 'final_bill'
    ? finalBillPollResult(payment.bookingId, payment.chargeId, booking.finalBill, booking.status)
    : extraWorkPollResult(payment.bookingId, payment.chargeId, booking.extraWork, booking.status);
}

export type PendingCheck =
  | { kind: 'none' }
  /** It might still settle: no new payment over it. */
  | { kind: 'checking' }
  | { kind: 'booked'; bookingId: string }
  | { kind: 'failed'; message: string };

/**
 * One look at a record. A final answer, or a window long closed, ends the record; anything
 * else keeps it. Only a clear no from the server ever lets someone pay again.
 */
export async function checkPending(payment: PendingPayment, now = Date.now(), read = readPendingOutcome): Promise<PendingCheck> {
  const key = pendingKey(payment);
  let outcome: PollResult;
  try {
    outcome = await read(payment);
  } catch (error) {
    if (error instanceof ApiError && error.status < 500 && isPendingExpired(payment, now)) {
      pendingPayment.clear(key);
      return { kind: 'none' };
    }
    return { kind: 'checking' };
  }
  if (outcome.kind !== 'pending') {
    pendingPayment.clear(key);
    return outcome;
  }
  if (isPendingExpired(payment, now)) {
    pendingPayment.clear(key);
    return { kind: 'none' };
  }
  return { kind: 'checking' };
}
