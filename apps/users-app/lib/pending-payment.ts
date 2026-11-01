import { getBooking } from '@repo/core/api/bookings';
import { getBookingIntentStatus } from '@repo/core/api/payments';
import { extraWorkPollResult, finalBillPollResult, intentPollResult, type PollResult } from '@repo/core/payment-confirmation';

import { devicePrefs } from './device-prefs';

/**
 * A payment under way, written down before Razorpay's window opens. If the app is killed mid-
 * payment the webhook still settles it on the server; this is how the app finds out and shows
 * the real outcome on return, and how a second tap on Pay is stopped from paying twice.
 */
const KEY = 'detlio.pendingPayment';

/** Razorpay's window can't be up longer than this; past it, a pending intent never paid. */
export const PENDING_PAYMENT_TTL_MS = 30 * 60 * 1000;

export type PendingPayment =
  | { kind: 'intent'; intentId: string; vendorName: string; startedAt: number }
  | { kind: 'charge'; what: 'final_bill' | 'extra_work'; bookingId: string; chargeId: string; vendorName: string; startedAt: number };

export const pendingPayment = {
  read(): PendingPayment | null {
    try {
      const raw = devicePrefs.getItem(KEY);
      return raw ? (JSON.parse(raw) as PendingPayment) : null;
    } catch {
      return null;
    }
  },
  write: (payment: PendingPayment) => devicePrefs.setItem(KEY, JSON.stringify(payment)),
  clear: () => devicePrefs.removeItem(KEY),
};

export const isPendingExpired = (payment: Pick<PendingPayment, 'startedAt'>, now: number) =>
  now - payment.startedAt > PENDING_PAYMENT_TTL_MS;

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
  return payment.what === 'final_bill'
    ? finalBillPollResult(payment.bookingId, payment.chargeId, booking.finalBill, booking.status)
    : extraWorkPollResult(payment.bookingId, payment.chargeId, booking.extraWork, booking.status);
}
