/**
 * On inspection (0073): the inspection fee is optional (empty is a free
 * inspection, which customers book with nothing to pay) and so is a rough
 * "approx price", a guide customers see that is never charged. The garage
 * app has the same rules in apps/vendors-app/lib/service-form.ts. Pure, so
 * each rule is a test.
 */

/** Whether the approx box holds something that cannot be sent: typed, but not above ₹0. */
export function approxInvalid(approx: string): boolean {
  if (approx.trim() === '') return false
  const value = Number(approx)
  return !(Number.isFinite(value) && value > 0)
}

/** Whether the fee box is fine: empty or 0 (a free inspection), or above ₹0. */
export function inspectionFeeValid(fee: string): boolean {
  if (fee.trim() === '') return true
  const value = Number(fee)
  return Number.isFinite(value) && value >= 0
}

/** An on-inspection price block that can be saved: any fee (or none), and an approx that is empty or above ₹0. */
export function inspectionPricingValid(fee: string, approx: string): boolean {
  return inspectionFeeValid(fee) && !approxInvalid(approx)
}

/** The approx price to send: a number above ₹0, or null (none, or cleared). */
export function approxToSend(approx: string): number | null {
  const value = Number(approx)
  return approx.trim() !== '' && Number.isFinite(value) && value > 0 ? value : null
}

/** The approx box when editing a service: its stored approx price, or empty. */
export function approxBoxFrom(service: { pricingType: string; approxPrice?: number | null }): string {
  return service.pricingType === 'on_inspection' && service.approxPrice != null && service.approxPrice > 0
    ? String(service.approxPrice)
    : ''
}

/** The fee box when editing: empty for a free inspection, never "0". */
export function feeBoxFrom(service: { price: number }): string {
  return service.price > 0 ? String(service.price) : ''
}
