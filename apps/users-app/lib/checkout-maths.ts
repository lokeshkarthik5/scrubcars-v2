import type { MyCoupon } from '@repo/core/api/coupons';

/** The sums checkout shows, the web's own (apps/users/lib/gifts.ts). The server still decides what's charged. */
export const MIN_GATEWAY_PAISE = 100;

export function creditToUsePaise(chargePaise: number, balancePaise: number): number {
  if (chargePaise <= 0 || balancePaise <= 0) return 0;
  if (balancePaise >= chargePaise) return chargePaise;
  const cash = chargePaise - balancePaise;
  if (cash >= MIN_GATEWAY_PAISE) return balancePaise;
  return Math.max(0, chargePaise - MIN_GATEWAY_PAISE);
}

export function checkoutCreditSplit(total: number, balance: number): { credit: number; toPay: number } {
  const chargePaise = Math.round(total * 100);
  const creditPaise = creditToUsePaise(chargePaise, Math.round(balance * 100));
  return { credit: creditPaise / 100, toPay: (chargePaise - creditPaise) / 100 };
}

/** apps/users/lib/coupons.ts */
export function couponsForCheckout(coupons: readonly MyCoupon[] | undefined): (MyCoupon & { code: string })[] {
  return (coupons ?? []).filter((c): c is MyCoupon & { code: string } => c.kind === 'voucher' && c.state === 'ready' && !!c.code);
}

/** apps/users/lib/guarantee-cover.ts */
export interface CoverLine {
  category: string;
  pricingType: string | null;
  items?: readonly { serviceId: string }[];
}
const REDO_CATEGORIES: readonly string[] = ['car_wash', 'detailing'];
export function guaranteeCovers(lines: readonly CoverLine[], categoryOf: (serviceId: string) => string | undefined): boolean {
  if (lines.length === 0) return false;
  return lines.every((line) => {
    if (line.pricingType === 'on_inspection') return false;
    if (REDO_CATEGORIES.includes(line.category)) return true;
    if (line.category !== 'package') return false;
    const members = (line.items ?? []).map((item) => categoryOf(item.serviceId));
    return members.length > 0 && members.every((category) => category !== undefined && REDO_CATEGORIES.includes(category));
  });
}

/**
 * Before Razorpay opens: the order's figure (paise) against the one on screen (rupees). The
 * same goes straight on; different, or nothing shown, stops until the customer has seen the
 * server's total and said yes.
 */
export async function confirmOrderTotal(orderPaise: number, shownRupees: number | null, ask: (rupees: number) => Promise<boolean>): Promise<boolean> {
  if (shownRupees !== null && Math.round(shownRupees * 100) === orderPaise) return true;
  return ask(orderPaise / 100);
}
