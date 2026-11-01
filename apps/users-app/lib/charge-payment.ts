import { getBooking } from '@repo/core/api/bookings';
import { payFinalBill, verifyExtraWorkPayment, verifyFinalBillPayment } from '@repo/core/api/job-records';
import { confirmPayment, extraWorkPollResult, finalBillPollResult, type PaymentOutcome, realClock } from '@repo/core/payment-confirmation';
import type { Booking } from '@repo/core/types';

import { type CheckoutInfo, openCheckout } from './checkout';
import { pendingPayment, setPaymentFlowOnScreen } from './pending-payment';

export type ChargeResult =
  | { kind: 'cancelled' }
  | { kind: 'failed-to-pay'; message: string }
  | { kind: 'paid'; paymentId: string; outcome: PaymentOutcome };

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
}): Promise<ChargeResult> {
  const { what, booking, chargeId } = input;
  setPaymentFlowOnScreen(true);
  try {
    const order = await payFinalBill(booking.id, chargeId);
    pendingPayment.write({ kind: 'charge', what, bookingId: booking.id, chargeId, vendorName: booking.vendorName, startedAt: Date.now() });
    const result = await openCheckout(order, { description: input.description, ...input.customer });
    if (result.kind === 'cancelled') {
      pendingPayment.clear();
      return { kind: 'cancelled' };
    }
    if (result.kind === 'failed') {
      pendingPayment.clear();
      return { kind: 'failed-to-pay', message: result.message };
    }
    input.onPaid(result.paymentId);
    const payload = { razorpayOrderId: result.orderId, razorpayPaymentId: result.paymentId, razorpaySignature: result.signature };
    const outcome = await confirmPayment({
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
    if (outcome.kind !== 'unconfirmed') pendingPayment.clear();
    return { kind: 'paid', paymentId: result.paymentId, outcome };
  } finally {
    setPaymentFlowOnScreen(false);
  }
}
