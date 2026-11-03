import { getBooking } from '@repo/core/api/bookings';
import { buyGift, type BuyGiftPayload } from '@repo/core/api/gifts';
import { createPaymentOrder } from '@repo/core/api/payments';
import { payFinalBill, verifyExtraWorkPayment, verifyFinalBillPayment } from '@repo/core/api/job-records';
import { confirmPayment, extraWorkPollResult, finalBillPollResult, type PaymentOutcome, realClock } from '@repo/core/payment-confirmation';
import type { Booking } from '@repo/core/types';

import { type CheckoutInfo, openCheckout } from './checkout';
import { bookingKey, chargeKey, checkPending, type PendingCheck, pendingGift, pendingPayment, readPendingOutcome, setPaymentFlowOnScreen } from './pending-payment';

export type ChargeResult =
  /** An earlier payment for this charge might still settle: nothing new was started. */
  | { kind: 'checking' }
  /** An earlier payment turned out to have gone through. */
  | { kind: 'settled' }
  | { kind: 'cancelled' }
  | { kind: 'failed-to-pay'; message: string }
  | { kind: 'paid'; paymentId: string; outcome: PaymentOutcome };

/** The calls a payment makes, passed in so tests can kill the app halfway. */
export const paymentCalls = { payFinalBill, createPaymentOrder, buyGift, openCheckout, readOutcome: readPendingOutcome, confirm: confirmPayment };
export type PaymentCalls = typeof paymentCalls;

/** Never a new order over a payment that might still settle. */
async function guard(key: string, read: PaymentCalls['readOutcome']): Promise<PendingCheck> {
  const last = pendingPayment.get(key);
  return last ? checkPending(last, Date.now(), read) : { kind: 'none' };
}

/** A pay-later booking's order, or why none should be made. Razorpay's window is the caller's. */
export async function startBookingPayment(
  booking: Pick<Booking, 'id' | 'vendorName'>,
  calls: PaymentCalls = paymentCalls
): Promise<Exclude<PendingCheck, { kind: 'none' }> | { kind: 'order'; order: Awaited<ReturnType<typeof createPaymentOrder>> }> {
  const last = await guard(bookingKey(booking.id), calls.readOutcome);
  if (last.kind !== 'none') return last;
  const order = await calls.createPaymentOrder(booking.id);
  pendingPayment.write({ kind: 'booking', bookingId: booking.id, vendorName: booking.vendorName, startedAt: Date.now() });
  return { kind: 'order', order };
}

/** A new gift's order, or why none should be made: the same guard, over any gift still being checked. */
export async function startGiftPayment(payload: BuyGiftPayload, calls: PaymentCalls = paymentCalls): Promise<Exclude<PendingCheck, { kind: 'none' }> | { kind: 'order'; order: Awaited<ReturnType<typeof buyGift>> }> {
  const last = pendingGift();
  if (last) {
    const check = await checkPending(last, Date.now(), calls.readOutcome);
    if (check.kind !== 'none') return check;
  }
  const order = await calls.buyGift(payload);
  pendingPayment.write({ kind: 'gift', giftId: order.giftId, startedAt: Date.now() });
  return { kind: 'order', order };
}

/**
 * A final bill or an extra-work charge: the order from the server, Razorpay, then confirming.
 * `onPaid` fires once money has moved, so the card can say so while it's confirmed. The
 * amount is whatever the server's order says, never anything from the phone.
 */
export async function payCharge(input: {
  what: 'final_bill' | 'extra_work';
  booking: Pick<Booking, 'id' | 'vendorName'>;
  chargeId: string;
  description: string;
  customer?: Pick<CheckoutInfo, 'name' | 'phone'>;
  onPaid: (paymentId: string) => void;
}, calls: PaymentCalls = paymentCalls): Promise<ChargeResult> {
  const { what, booking, chargeId } = input;
  const key = chargeKey(chargeId);
  setPaymentFlowOnScreen(true);
  try {
    const last = await guard(key, calls.readOutcome);
    if (last.kind === 'checking') return { kind: 'checking' };
    if (last.kind === 'booked') return { kind: 'settled' };
    if (last.kind === 'failed') return { kind: 'failed-to-pay', message: last.message };
    const order = await calls.payFinalBill(booking.id, chargeId);
    pendingPayment.write({ kind: 'charge', what, bookingId: booking.id, chargeId, vendorName: booking.vendorName, startedAt: Date.now() });
    const result = await calls.openCheckout(order, { description: input.description, ...input.customer });
    if (result.kind === 'cancelled') {
      pendingPayment.clear(key);
      return { kind: 'cancelled' };
    }
    if (result.kind === 'failed') {
      pendingPayment.clear(key);
      return { kind: 'failed-to-pay', message: result.message };
    }
    input.onPaid(result.paymentId);
    const payload = { razorpayOrderId: result.orderId, razorpayPaymentId: result.paymentId, razorpaySignature: result.signature };
    const outcome = await calls.confirm({
      verify: async () => {
        await (what === 'final_bill' ? verifyFinalBillPayment : verifyExtraWorkPayment)(booking.id, chargeId, payload);
        return { bookingId: booking.id };
      },
      poll: async () => {
        const fresh = await getBooking(booking.id);
        if (!fresh) return { kind: 'pending' };
        return what === 'final_bill'
          ? finalBillPollResult(booking.id, chargeId, fresh.finalBill, fresh.status)
          : extraWorkPollResult(booking.id, chargeId, fresh.extraWork, fresh.status);
      },
      ...realClock,
    });
    // Unconfirmed stays written: the next return to the app reads the real outcome.
    if (outcome.kind !== 'unconfirmed') pendingPayment.clear(key);
    return { kind: 'paid', paymentId: result.paymentId, outcome };
  } finally {
    setPaymentFlowOnScreen(false);
  }
}
