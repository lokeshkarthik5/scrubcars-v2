import { RECEIPT_CONVENIENCE_LABEL, receiptTripLabel } from '@repo/core/pickup-fee-customer';
import { BOOKING_TYPE_LABELS } from '@repo/core/booking-types';
import { formatReceiptAmount, RECEIPT_NOT_TAX_INVOICE, receiptItemValue } from '@repo/core/receipts';
import type { BookingReceipt } from '@repo/core/types';

/** Everything from the server goes through here: a name can hold anything. */
export function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const row = (label: string, value: string, strong = false) =>
  `<div class="row${strong ? ' strong' : ''}"><span>${escapeHtml(label)}</span><span class="num">${escapeHtml(value)}</span></div>`;
const detail = (text: string) => `<p class="detail">${escapeHtml(text)}</p>`;
const section = (title: string, body: string) => `<section><h2>${escapeHtml(title)}</h2>${body}</section>`;
const dash = '<div class="dash"></div>';

/**
 * The receipt as a page of its own, for the PDF: the web's ReceiptDocument (black on white on
 * A4, whichever theme the app is in), with the same rows in the same order.
 */
export function receiptHtml(receipt: BookingReceipt): string {
  const { issuer, booking, bookingPayment, finalBill } = receipt;
  const services = [
    ...receipt.items.map((item) => row(item.name, receiptItemValue(item))),
    // An accepted request's travel fee (0062), or the pickup fee with its road km (0079).
    receipt.travelFee ? row(receiptTripLabel(booking.bookingType, receipt.roadKm), formatReceiptAmount(receipt.travelFee)) : '',
    receipt.convenienceFee ? row(RECEIPT_CONVENIENCE_LABEL, formatReceiptAmount(receipt.convenienceFee)) : '',
    receipt.discount
      ? `${dash}${row('Subtotal', formatReceiptAmount(receipt.subtotal))}${row(
          `${receipt.discount.label ?? 'Discount'}${receipt.discount.code ? ` (${receipt.discount.code})` : ''}`,
          formatReceiptAmount(receipt.discount.amount, true)
        )}`
      : '',
    dash,
    row('Paid at booking', formatReceiptAmount(bookingPayment.amount), true),
    detail(bookingPayment.method),
    bookingPayment.credit ? detail(`Detlio credit ${formatReceiptAmount(bookingPayment.credit.amount)}`) : '',
    bookingPayment.credit && Number(bookingPayment.credit.razorpayAmount) > 0 ? detail(`Online (Razorpay) ${formatReceiptAmount(bookingPayment.credit.razorpayAmount)}`) : '',
    bookingPayment.paymentId ? detail(`Payment ID ${bookingPayment.paymentId}`) : '',
    bookingPayment.paidAtLabel ? detail(`Paid ${bookingPayment.paidAtLabel}`) : '',
  ].join('');

  const bill = finalBill
    ? section(
        'Final bill',
        [
          ...finalBill.lines.map((line) => row(line.description, formatReceiptAmount(line.amount))),
          dash,
          row('Bill total', formatReceiptAmount(finalBill.total)),
          row('Paid at booking', formatReceiptAmount(finalBill.creditedFromBooking, true)),
          finalBill.discount ? row(`Discount${finalBill.discount.code ? ` (${finalBill.discount.code})` : ''}`, formatReceiptAmount(finalBill.discount.amount, true)) : '',
          row('Balance paid', formatReceiptAmount(finalBill.balancePaid), true),
          detail('Online (Razorpay)'),
          finalBill.paymentId ? detail(`Payment ID ${finalBill.paymentId}`) : '',
          finalBill.paidAtLabel ? detail(`Paid ${finalBill.paidAtLabel}`) : '',
        ].join('')
      )
    : '';

  const extra =
    (receipt.extraWork?.length ?? 0) > 0
      ? section(
          'Extra work',
          receipt
            .extraWork!.map((work) =>
              [
                row(work.description, formatReceiptAmount(work.amount), true),
                detail('Online (Razorpay)'),
                work.paymentId ? detail(`Payment ID ${work.paymentId}`) : '',
                work.paidAtLabel ? detail(`Paid ${work.paidAtLabel}`) : '',
              ].join('')
            )
            .join('')
        )
      : '';

  const refunds =
    receipt.refunds.length > 0
      ? section(
          'Refunds',
          receipt.refunds
            .map((refund) =>
              [
                row(refund.against === 'final_bill' ? 'Refund of final bill' : refund.against === 'extra_work' ? 'Refund of extra work' : 'Refund', formatReceiptAmount(refund.amount, true)),
                detail(`${refund.method}${refund.refundedAtLabel ? ` on ${refund.refundedAtLabel}` : ''}`),
                refund.reference ? detail(`Refund ID ${refund.reference}`) : '',
              ].join('')
            )
            .join('')
        )
      : '';

  return `<!doctype html><html><head><meta charset="utf-8"><style>
@page { size: A4; margin: 14mm; }
* { box-sizing: border-box; }
body { margin: 0; font-family: -apple-system, Roboto, Helvetica, Arial, sans-serif; color: #000; background: #fff; font-size: 13px; line-height: 1.45; }
header { display: flex; justify-content: space-between; gap: 24px; }
.brand { font-size: 26px; font-weight: 700; line-height: 1; letter-spacing: -0.5px; margin: 0; }
.brand span { color: #E11D2E; }
.small { font-size: 12px; margin: 2px 0 0; color: #525252; }
.small.dark { color: #000; margin-top: 8px; }
h1 { font-size: 15px; font-weight: 600; margin: 0; text-align: right; }
.right { text-align: right; }
.grid { display: flex; gap: 24px; border-top: 1px solid #d4d4d4; margin-top: 20px; padding-top: 16px; }
.grid > div { flex: 1; }
h2 { font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.4px; color: #525252; margin: 0 0 6px; }
section { border-top: 1px solid #d4d4d4; margin-top: 20px; padding-top: 16px; break-inside: avoid; }
.row { display: flex; justify-content: space-between; gap: 16px; padding: 4px 0; }
.row.strong { font-size: 15px; font-weight: 700; }
.num { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }
.detail { font-size: 12px; color: #525252; margin: 0; }
.dash { border-top: 1px dashed #d4d4d4; margin-top: 4px; }
.strongname { font-weight: 500; margin: 0; }
p { margin: 0; }
footer { border-top: 1px solid #d4d4d4; margin-top: 20px; padding-top: 16px; font-size: 12px; color: #525252; }
footer b { color: #000; font-weight: 500; display: block; margin-bottom: 4px; }
</style></head><body>
<header><div><p class="brand">${escapeHtml(issuer.name)}<span>.</span></p>
${issuer.tradeName ? `<p class="small dark">Operated by ${escapeHtml(issuer.tradeName)}</p>` : ''}
${issuer.address ? `<p class="small">${escapeHtml(issuer.address)}</p>` : ''}
<p class="small">${escapeHtml(issuer.website)}</p></div>
<div class="right"><h1>Payment receipt</h1><p class="strongname">${escapeHtml(receipt.receiptNumber)}</p><p class="small">Issued ${escapeHtml(receipt.issuedOn)}</p></div></header>
<div class="grid"><div><h2>Customer</h2><p class="strongname">${escapeHtml(receipt.customer.name)}</p><p>${escapeHtml(receipt.customer.phone)}</p></div>
<div><h2>Garage</h2><p class="strongname">${escapeHtml(receipt.garage.name)}</p><p class="small">${escapeHtml(receipt.garage.address)}</p></div></div>
${section(
  'Booking',
  [
    row('Booking', `#${booking.reference}`),
    booking.originalReference ? row('First booked as', `#${booking.originalReference}`) : '',
    row('Service date', booking.scheduledAtLabel),
    row('Type', BOOKING_TYPE_LABELS[booking.bookingType]),
    row('Status', booking.statusLabel),
  ].join('')
)}
${section('Services', services)}
${bill}${extra}${refunds}
${section(
  'Total',
  [
    row('Total paid', formatReceiptAmount(receipt.totalPaid)),
    receipt.refunds.length > 0 ? row('Refunded', formatReceiptAmount(receipt.totalRefunded, true)) : '',
    row('Net amount paid', formatReceiptAmount(receipt.netPaid), true),
  ].join('')
)}
<footer><b>${escapeHtml(RECEIPT_NOT_TAX_INVOICE)}</b>Questions about this receipt? Call Detlio support on ${escapeHtml(issuer.supportPhone)}${issuer.supportEmail ? ` or write to ${escapeHtml(issuer.supportEmail)}` : ''}, quoting ${escapeHtml(receipt.receiptNumber)}.</footer>
</body></html>`;
}
