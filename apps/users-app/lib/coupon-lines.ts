import type { MyCoupon, PublicCoupon } from '@repo/core/api/coupons';
import { t } from '@repo/core/i18n/translate';
import { istDateLabel } from '@repo/core/payouts';

/** The words of apps/users/lib/coupons.ts. */
export const couponUseByLine = (iso: string) => t('Use by {day}', { day: istDateLabel(iso) });

export function couponClosedLine(coupon: Pick<PublicCoupon, 'state' | 'validFrom' | 'validUntil'>): string | null {
  switch (coupon.state) {
    case 'added':
      return t("It's in your account. Find it in Profile → Coupons.");
    case 'redeemed':
      return t('This coupon has already been used.');
    case 'used_up':
      return t('This coupon has been fully claimed.');
    case 'expired':
      return t('This coupon expired on {day}.', { day: istDateLabel(coupon.validUntil) });
    case 'not_started':
      return t('This coupon can be added from {day}.', { day: istDateLabel(coupon.validFrom) });
    case 'void':
      return t('This coupon is no longer valid.');
    default:
      return null;
  }
}

export function myCouponStateLine(coupon: Pick<MyCoupon, 'state' | 'kind' | 'expiresAt' | 'stamps'>): string {
  switch (coupon.state) {
    case 'added':
      return t('Added to your Shine Card.');
    case 'ready':
      return coupon.expiresAt ? t('{useBy}. It comes off at checkout.', { useBy: couponUseByLine(coupon.expiresAt) }) : t('It comes off at checkout.');
    case 'used':
      return t('Used on a booking. If that booking is cancelled, it comes back.');
    case 'expired':
      return coupon.expiresAt ? t('Expired on {day}.', { day: istDateLabel(coupon.expiresAt) }) : t('Expired.');
    case 'cancelled':
      return t('This coupon was withdrawn by Detlio.');
  }
}

export const couponBookPath = (coupon: Pick<MyCoupon, 'vendorId' | 'code'>) =>
  coupon.vendorId && coupon.code ? `/garage/${coupon.vendorId}?code=${encodeURIComponent(coupon.code)}` : '/garages';
