import { t } from '@repo/core/i18n/translate';
import { BANK_DAYS, customerRefundLine, withoutRefundPromise } from '@repo/core/refunds';
import { formatRupees } from '@repo/core/job-records';
import { notAcceptedRefundLine, notAcceptedTitle } from '@repo/core/response-deadline';
import type { Booking } from '@repo/core/types';

/** The words of apps/users/app/bookings/[id]/page.tsx that decide what's said about money. */
export function cancelRefundNote(booking: Pick<Booking, 'servicePrice' | 'creditPaid'>): string {
  if (booking.servicePrice <= 0 && (booking.creditPaid ?? 0) <= 0) {
    return t('Nothing was charged, so there is nothing to refund. Your free wash comes back while it lasts.');
  }
  const credit = Math.min(booking.creditPaid ?? 0, booking.servicePrice);
  const online = Math.round((booking.servicePrice - credit) * 100) / 100;
  if (credit <= 0) return t('Our team will refund your payment to your original payment method within {days}.', { days: t(BANK_DAYS) });
  const creditLine = t('{amount} goes back to your Detlio credit.', { amount: formatRupees(credit) });
  if (online <= 0) return creditLine;
  return `${t('Our team will refund the {amount} you paid online to your original payment method within {days}.', { amount: formatRupees(online), days: t(BANK_DAYS) })} ${creditLine}`;
}

export function cancelledPanel(booking: Booking): { title: string; lines: string[] } {
  if (booking.noShow === 'customer') {
    return { title: t('Marked as a no-show'), lines: [t("The garage held your slot, so this payment isn't refunded. If this is wrong, use Help with this booking.")] };
  }
  const refund = customerRefundLine(booking.refund);
  if (booking.noShow === 'garage') {
    return {
      title: t("The garage couldn't serve this booking"),
      lines: [
        refund ??
          (booking.paymentStatus === 'refunded'
            ? t('Your payment has been refunded.')
            : booking.paymentStatus === 'paid'
              ? t('Our team will refund your payment.')
              : t('Nothing was charged online for it.')),
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
      booking.cancelledOnBehalfOf === 'garage' ? t("Cancelled at the garage's request.") : booking.cancelledOnBehalfOf === 'customer' ? t('Cancelled at your request.') : null;
    return { title: t('Cancelled by Detlio'), lines: withRefund([onBehalf, reason]) };
  }
  if (booking.cancelledBy === 'vendor' && booking.timeProposal) {
    if (booking.timeProposal.status === 'declined') {
      return { title: t("None of the garage's times worked"), lines: withRefund([t('You cancelled this booking instead of picking another time.')]) };
    }
    if (booking.timeProposal.status === 'expired') {
      return { title: t('No time was picked in time'), lines: withRefund([t("{name} couldn't do your time and suggested others, so this booking was cancelled.", { name: booking.vendorName })]) };
    }
  }
  if (booking.cancelledBy === 'vendor' && booking.garageCancelled) {
    return { title: t('Cancelled by the garage'), lines: withRefund([t('{name} accepted this booking, then had to cancel it. Sorry about that.', { name: booking.vendorName })]) };
  }
  if (booking.cancelledBy === 'vendor') {
    return { title: t('Declined by the garage'), lines: withRefund([reason ?? t('The garage could not take this booking.')]) };
  }
  return { title: booking.cancelledBy === 'user' ? t('Cancelled by you') : t('Booking cancelled'), lines: withRefund([reason ?? t('This booking was cancelled.')]) };
}

/**
 * What the paid row shows. The web prints the whole booking there
 * (apps/users/app/bookings/[id]/page.tsx: money(booking.servicePrice) under "Paid online"),
 * though `amount` includes any credit: the server's two parts are the payment's online
 * amount and creditAmount (bookings.service.ts). Online is what went through Razorpay.
 */
export function paymentRowAmount(booking: Pick<Booking, 'paymentStatus' | 'servicePrice' | 'creditPaid'>): number {
  const credit = booking.creditPaid ?? 0;
  if (booking.paymentStatus !== 'paid' || credit <= 0 || credit >= booking.servicePrice) return booking.servicePrice;
  return Math.round((booking.servicePrice - credit) * 100) / 100;
}

export function paymentRowLabel(booking: Pick<Booking, 'paymentStatus' | 'paymentMethod' | 'servicePrice' | 'creditPaid'>): string {
  if (booking.paymentStatus === 'paid') {
    if (booking.servicePrice === 0 && (booking.creditPaid ?? 0) === 0) return t('Nothing to pay');
    return (booking.creditPaid ?? 0) >= booking.servicePrice ? t('Paid') : t('Paid online');
  }
  if (booking.paymentStatus === 'refunded') return t('Refunded');
  return booking.paymentMethod === 'online' ? t('To be paid online') : t('Cash');
}
