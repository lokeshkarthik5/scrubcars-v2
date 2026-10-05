/**
 * How the customer's payment receipt puts figures into words. What is on the
 * receipt, and every rule behind it, is the server's
 * (apps/server/src/lib/receipts.ts); this only formats what it sent.
 */

/**
 * The line at the foot of every receipt. Detlio is not issuing tax invoices
 * until the CA confirms the GST setup, and a customer filing an expense must
 * not mistake this for one.
 */
export const RECEIPT_NOT_TAX_INVOICE = 'This is a payment receipt, not a tax invoice.'

/**
 * An amount as a receipt shows it: always with paise, grouped the Indian way
 * ("₹1,23,456.00"). A refund passes `negative` and reads "−₹499.00", with a
 * real minus sign so it is not mistaken for a dash.
 */
export function formatReceiptAmount(amount: string | number, negative = false): string {
  const value = Number(amount)
  const rupees = Number.isFinite(value) ? Math.abs(value) : 0
  const text = rupees.toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
  return `${negative && rupees > 0 ? '−' : ''}₹${text}`
}

/**
 * The page title while a receipt is open, which browsers use as a saved PDF's
 * file name: "Detlio receipt DTL-26-27-000123". The receipt number's slashes
 * become hyphens here only, because a file name cannot hold a slash and
 * browsers swap it for something less readable. Everywhere the customer reads
 * the number, it is printed as issued ("DTL/26-27/000123").
 */
export function receiptFileTitle(receiptNumber: string): string {
  return `Detlio receipt ${receiptNumber.replace(/\//g, '-')}`
}
