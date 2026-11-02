import type { MyCoupon, PublicCoupon } from '@repo/core/api/coupons';
import { istDateLabel } from '@repo/core/payouts';

/** The words of apps/users/lib/coupons.ts. */
export const couponUseByLine = (iso: string) => `Use by ${istDateLabel(iso)}`;

export function couponClosedLine(coupon: Pick<PublicCoupon, 'state' | 'validFrom' | 'validUntil'>): string | null {
  switch (coupon.state) {
    case 'added':
      return "It's in your account. Find it in Profile → Coupons.";
    case 'redeemed':
      return 'This coupon has already been used.';
    case 'used_up':
      return 'This coupon has been fully claimed.';
    case 'expired':
      return `This coupon expired on ${istDateLabel(coupon.validUntil)}.`;
    case 'not_started':
      return `This coupon can be added from ${istDateLabel(coupon.validFrom)}.`;
    case 'void':
      return 'This coupon is no longer valid.';
    default:
      return null;
  }
}

export function myCouponStateLine(coupon: Pick<MyCoupon, 'state' | 'kind' | 'expiresAt' | 'stamps'>): string {
  switch (coupon.state) {
    case 'added':
      return 'Added to your Shine Card.';
    case 'ready':
      return coupon.expiresAt ? `${couponUseByLine(coupon.expiresAt)}. It comes off at checkout.` : 'It comes off at checkout.';
    case 'used':
      return 'Used on a booking. If that booking is cancelled, it comes back.';
    case 'expired':
      return coupon.expiresAt ? `Expired on ${istDateLabel(coupon.expiresAt)}.` : 'Expired.';
    case 'cancelled':
      return 'This coupon was withdrawn by Detlio.';
  }
}

export const couponBookPath = (coupon: Pick<MyCoupon, 'vendorId' | 'code'>) =>
  coupon.vendorId && coupon.code ? `/garage/${coupon.vendorId}?code=${encodeURIComponent(coupon.code)}` : '/garages';
