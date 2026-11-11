import type { MyCoupon, PublicCoupon } from '@repo/core/api/coupons'
import { formatGiftDate } from '@/lib/gifts'
import { t } from '@repo/core/i18n/translate'

/**
 * Whether a page's address holds a coupon code: the coupon page itself
 * (/c/<code>), or sign-in on the way back to one (`next=/c/<code>`). Third-
 * party scripts that read the address (the Meta Pixel) stay off these pages:
 * a unique code is a coupon someone can still add.
 */
export function carriesCouponCode(pathname: string | null, next: string | null): boolean {
  const isCouponPath = (path: string | null) => !!path && /^\/c\/[^/]/.test(path)
  return isCouponPath(pathname) || isCouponPath(next)
}

/** "Use by 31 Dec 2026", in Chennai. */
export function couponUseByLine(iso: string): string {
  return t('Use by {date}', { date: formatGiftDate(iso) })
}

/** What the coupon page says instead of "Add to my Detlio", or null when it can be added. */
export function couponClosedLine(coupon: Pick<PublicCoupon, 'state' | 'validFrom' | 'validUntil'>): string | null {
  switch (coupon.state) {
    case 'added':
      return t("It's in your account. Find it in Profile → Coupons.")
    case 'redeemed':
      return t('This coupon has already been used.')
    case 'used_up':
      return t('This coupon has been fully claimed.')
    case 'expired':
      return t('This coupon expired on {date}.', {
        date: formatGiftDate(coupon.validUntil),
      })
    case 'not_started':
      return t('This coupon can be added from {date}.', {
        date: formatGiftDate(coupon.validFrom),
      })
    case 'void':
      return t('This coupon is no longer valid.')
    default:
      return null
  }
}

/** A coupon in Profile: its state in words. */
export function myCouponStateLine(coupon: Pick<MyCoupon, 'state' | 'kind' | 'expiresAt' | 'stamps'>): string {
  switch (coupon.state) {
    case 'added':
      return t('Added to your Shine Card.')
    case 'ready':
      return coupon.expiresAt
        ? t('Use by {date}. It comes off at checkout.', { date: formatGiftDate(coupon.expiresAt) })
        : t('It comes off at checkout.')
    case 'used':
      return t('Used on a booking. If that booking is cancelled, it comes back.')
    case 'expired':
      return coupon.expiresAt
        ? t('Expired on {date}.', { date: formatGiftDate(coupon.expiresAt) })
        : t('Expired.')
    case 'cancelled':
      return t('This coupon was withdrawn by Detlio.')
  }
}

/** The coupons checkout offers as one tap: ready vouchers only. */
export function couponsForCheckout(coupons: readonly MyCoupon[] | undefined): Array<MyCoupon & { code: string }> {
  return (coupons ?? []).filter((c): c is MyCoupon & { code: string } => c.kind === 'voucher' && c.state === 'ready' && !!c.code)
}
