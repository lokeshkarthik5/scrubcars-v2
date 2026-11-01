import { BANK_DAYS, customerRefundLine, withoutRefundPromise } from '@repo/core/refunds';
import { formatRupees } from '@repo/core/job-records';
import { notAcceptedRefundLine, notAcceptedTitle } from '@repo/core/response-deadline';
import type { Booking } from '@repo/core/types';

/** The words of apps/users/app/bookings/[id]/page.tsx that decide what's said about money. */
export function cancelRefundNote(booking: Pick<Booking, 'servicePrice' | 'creditPaid'>): string {
  if (booking.servicePrice <= 0 && (booking.creditPaid ?? 0) <= 0) {
    return 'Nothing was charged, so there is nothing to refund. Your free wash comes back while it lasts.';
  }
  const credit = Math.min(booking.creditPaid ?? 0, booking.servicePrice);
  const online = Math.round((booking.servicePrice - credit) * 100) / 100;
  if (credit <= 0) return `Our team will refund your payment to your original payment method within ${BANK_DAYS}.`;
  const creditLine = `${formatRupees(credit)} goes back to your Detlio credit.`;
  if (online <= 0) return creditLine;
  return `Our team will refund the ${formatRupees(online)} you paid online to your original payment method within ${BANK_DAYS}. ${creditLine}`;
}

export function cancelledPanel(booking: Booking): { title: string; lines: string[] } {
  if (booking.noShow === 'customer') {
    return { title: 'Marked as a no-show', lines: ["The garage held your slot, so this payment isn't refunded. If this is wrong, use Help with this booking."] };
  }
  const refund = customerRefundLine(booking.refund);
  if (booking.noShow === 'garage') {
    return {
      title: "The garage couldn't serve this booking",
      lines: [
        refund ??
          (booking.paymentStatus === 'refunded'
            ? 'Your payment has been refunded.'
            : booking.paymentStatus === 'paid'
              ? 'Our team will refund your payment.'
              : 'Nothing was charged online for it.'),
      ],
    };
  }
  if (booking.notAcceptedInTime) {
    const line = notAcceptedRefundLine(booking.refund);
    return { title: notAcceptedTitle(booking.vendorName), lines: line ? [line] : [] };
  }
  const withRefund = (lines: (string | null | undefined)[]) => [...lines, refund].filter((line): line is string => Boolean(line));
  const reason = refund ? withoutRefundPromise(booking.cancellationReason) : booking.cancellationReason;
  if (booking.cancelledBy === 'admin') {
    const onBehalf =
      booking.cancelledOnBehalfOf === 'garage' ? "Cancelled at the garage's request." : booking.cancelledOnBehalfOf === 'customer' ? 'Cancelled at your request.' : null;
    return { title: 'Cancelled by Detlio', lines: withRefund([onBehalf, reason]) };
  }
  if (booking.cancelledBy === 'vendor' && booking.timeProposal) {
    if (booking.timeProposal.status === 'declined') {
      return { title: "None of the garage's times worked", lines: withRefund(['You cancelled this booking instead of picking another time.']) };
    }
    if (booking.timeProposal.status === 'expired') {
      return { title: 'No time was picked in time', lines: withRefund([`${booking.vendorName} couldn't do your time and suggested others, so this booking was cancelled.`]) };
    }
  }
  if (booking.cancelledBy === 'vendor' && booking.garageCancelled) {
    return { title: 'Cancelled by the garage', lines: withRefund([`${booking.vendorName} accepted this booking, then had to cancel it. Sorry about that.`]) };
  }
  if (booking.cancelledBy === 'vendor') {
    return { title: 'Declined by the garage', lines: withRefund([reason ?? 'The garage could not take this booking.']) };
  }
  return { title: booking.cancelledBy === 'user' ? 'Cancelled by you' : 'Booking cancelled', lines: withRefund([reason ?? 'This booking was cancelled.']) };
}

export function paymentRowLabel(booking: Pick<Booking, 'paymentStatus' | 'paymentMethod' | 'servicePrice' | 'creditPaid'>): string {
  if (booking.paymentStatus === 'paid') {
    if (booking.servicePrice === 0 && (booking.creditPaid ?? 0) === 0) return 'Nothing to pay';
    return (booking.creditPaid ?? 0) >= booking.servicePrice ? 'Paid' : 'Paid online';
  }
  if (booking.paymentStatus === 'refunded') return 'Refunded';
  return booking.paymentMethod === 'online' ? 'To be paid online' : 'Cash';
}
