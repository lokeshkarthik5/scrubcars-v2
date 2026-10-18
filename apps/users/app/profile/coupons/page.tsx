'use client'

import { useRouter } from 'next/navigation'
import { IconTicket } from '@tabler/icons-react'
import { ScButton } from '@repo/ui/sc/button'
import { EmptyState, ErrorState, SkeletonCard } from '@repo/ui/sc/empty-state'
import { TopBar } from '@repo/ui/sc/top-bar'
import type { MyCoupon } from '@repo/core/api/coupons'
import { useMyCoupons } from '@repo/core/api/hooks/use-coupons'
import { usePendingCheckoutStore } from '@repo/core/stores/pending-checkout-store'
import { useAuthStore } from '@repo/core/stores/auth-store'
import { CustomerShell } from '@/components/customer-shell'
import { CouponCodeBox } from '@/components/coupons/coupon-code-box'
import { CouponTicket } from '@/components/coupons/coupon-ticket'
import { couponBookPath } from '@/components/coupons/coupon-view'
import { isHomeHubEnabled } from '@/lib/home-hub'
import { myCouponStateLine } from '@/lib/coupons'

/**
 * Profile → Coupons (0055): "Have a coupon?" (type the code off a printed
 * coupon, or scan its QR where the browser can), then every coupon the
 * customer added: ready ones with "Use now", which takes the voucher to
 * checkout like an offer from Home; used, expired and withdrawn ones
 * stepped back. A used voucher comes back here if its booking is cancelled
 * while it is still valid.
 */
export default function CouponsPage() {
  const router = useRouter()
  const user = useAuthStore((s) => s.user)
  const ready = useAuthStore((s) => s.isSessionReady)
  const coupons = useMyCoupons(!!user)
  const rememberOffer = usePendingCheckoutStore((s) => s.rememberOffer)

  const header = <TopBar title="Coupons" showBack backHref="/profile" large={isHomeHubEnabled()} />

  if (ready && !user) {
    return (
      <CustomerShell showNav showBrand className="gap-4 py-4">
        {header}
        <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
          <p className="text-[15px] font-semibold text-text-primary">Sign in to add a coupon</p>
          <ScButton
            className="mt-2 w-auto px-8"
            onClick={() => router.push(`/login?next=${encodeURIComponent('/profile/coupons')}`)}
          >
            Sign in
          </ScButton>
        </div>
      </CustomerShell>
    )
  }

  const use = (coupon: MyCoupon) => {
    if (user && coupon.code && coupon.expiresAt) {
      rememberOffer({ userId: user.id, code: coupon.code, vendorId: coupon.vendorId, vehicleId: null, endsAt: coupon.expiresAt })
    }
    router.push(couponBookPath(coupon))
  }

  const list = coupons.data ?? []

  return (
    <CustomerShell showNav showBrand className="gap-4 py-4">
      {header}

      <CouponCodeBox />

      <section aria-labelledby="my-coupons" className="flex flex-col gap-3">
        <h2 id="my-coupons" className="text-[15px] font-semibold text-text-primary">
          Your coupons
        </h2>
        {!ready || coupons.isPending ? (
          <div className="flex flex-col gap-3" aria-busy="true">
            <SkeletonCard />
          </div>
        ) : coupons.isError ? (
          <ErrorState message="Couldn't load your coupons. Check your connection." onRetry={() => void coupons.refetch()} />
        ) : list.length === 0 ? (
          <EmptyState
            icon={<IconTicket size={32} stroke={1.5} />}
            title="No coupons yet"
            subtitle="Got a Detlio coupon on a card or a flyer? Type its code above, or scan its QR with your phone's camera."
          />
        ) : (
          <ul className="flex flex-col gap-3">
            {list.map((coupon) => (
              <li key={coupon.id}>
                <CouponTicket
                  as="h3"
                  reward={coupon.reward}
                  title={coupon.title}
                  conditions={coupon.state === 'ready' ? coupon.conditions : []}
                  amountOff={coupon.offAmount}
                  percentOff={coupon.offPercent}
                  stamps={coupon.stamps}
                  dimmed={coupon.state !== 'ready' && coupon.state !== 'added'}
                >
                  <p className="text-[12px] text-text-secondary">{myCouponStateLine(coupon)}</p>
                  {coupon.state === 'ready' && (
                    <ScButton
                      variant="secondary"
                      fullWidth={false}
                      onClick={() => use(coupon)}
                      className="mt-1 min-h-11 w-fit px-4 text-[13px]"
                    >
                      Use now
                    </ScButton>
                  )}
                </CouponTicket>
              </li>
            ))}
          </ul>
        )}
      </section>
    </CustomerShell>
  )
}
