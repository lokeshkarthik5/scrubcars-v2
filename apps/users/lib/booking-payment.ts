/**
 * What actually went online (or is still to go online) on a booking: its
 * total less the part Detlio credit paid (0049). `servicePrice` is the whole
 * booking, so a ₹499 booking paid with ₹100 credit took ₹399 online. Never
 * below 0, and rounded to paise so 499.1 − 100.1 cannot print as 398.99999.
 */
export function onlineAmount(
  servicePrice: number,
  creditPaid: number | undefined
): number {
  const online = Math.round((servicePrice - (creditPaid ?? 0)) * 100) / 100
  return Math.max(0, online)
}
