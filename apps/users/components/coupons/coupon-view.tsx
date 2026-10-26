'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { IconTicket } from '@tabler/icons-react'
import { ScButton } from '@repo/ui/sc/button'
import { ScCard } from '@/components/ui/card'
import { EmptyState, ErrorState, SkeletonCard } from '@repo/ui/sc/empty-state'
import { ApiError } from '@repo/core/api/client'
import {
  lookupCoupon,
  redeemCoupon,
  type MyCoupon,
} from '@repo/core/api/coupons'
import { couponKeys, invalidateCoupons } from '@repo/core/api/hooks/use-coupons'
import { track } from '@repo/core/analytics'
import { usePendingCheckoutStore } from '@repo/core/stores/pending-checkout-store'
import { useAuthStore } from '@repo/core/stores/auth-store'
import { CustomerShell } from '@/components/customer-shell'
import { CouponTicket } from '@/components/coupons/coupon-ticket'
import { couponClosedLine, couponUseByLine } from '@/lib/coupons'

/** Where a ready voucher is used: its garage's page, or the list of garages. */
export function couponBookPath(
  coupon: Pick<MyCoupon, 'vendorId' | 'code'>
): string {
  return coupon.vendorId && coupon.code
    ? `/garage/${coupon.vendorId}?code=${encodeURIComponent(coupon.code)}`
    : '/garages'
}

/**
 * The page a printed coupon's QR opens (/c/<code>): the offer, every
 * condition and the dates, then "Add to my Detlio". Signed out, that goes
 * to sign-in (or sign-up) and back here, where it is added at once.
 * Signed in, the coupon becomes a voucher in the customer's account (or
 * bonus stamps), and "Book a wash" takes it to checkout.
 *
 * Looked up once (POST, the code in the body; each look is a scan in the
 * team's figures) and never again on focus or on a timer: the API counts
 * wrong codes, and a refetch is not a new answer.
 */
export function CouponView({ code }: { code: string }) {
  const router = useRouter()
  const params = useSearchParams()
  const queryClient = useQueryClient()
  const user = useAuthStore((s) => s.user)
  const ready = useAuthStore((s) => s.isSessionReady)
  const rememberOffer = usePendingCheckoutStore((s) => s.rememberOffer)

  const lookup = useQuery({
    queryKey: [...couponKeys.all, 'lookup', code, user?.id ?? null],
    queryFn: async () => (await lookupCoupon(code)).coupon,
    enabled: ready,
    retry: false,
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  })

  const scanned = useRef(false)
  useEffect(() => {
    if (lookup.data && !scanned.current) {
      scanned.current = true
      track('coupon_scan')
    }
  }, [lookup.data])

  const [adding, setAdding] = useState(false)
  const [added, setAdded] = useState<MyCoupon | null>(null)
  const [addError, setAddError] = useState<string | null>(null)

  const add = async () => {
    if (adding) return
    if (!user) {
      router.push(`/login?next=${encodeURIComponent(`/c/${code}?add=1`)}`)
      return
    }
    setAdding(true)
    setAddError(null)
    try {
      const result = await redeemCoupon(code, 'link')
      track('coupon_redeem', { source: 'link' })
      setAdded(result.coupon)
      void invalidateCoupons(queryClient)
    } catch (error) {
      setAddError(
        error instanceof ApiError
          ? error.message
          : "Couldn't add the coupon. Check your connection and try again."
      )
    } finally {
      setAdding(false)
    }
  }

  // Back from sign-in with ?add=1: add it once, as the customer asked.
  const autoAdded = useRef(false)
  useEffect(() => {
    if (
      autoAdded.current ||
      !user ||
      params.get('add') !== '1' ||
      lookup.data?.state !== 'available'
    )
      return
    autoAdded.current = true
    router.replace(`/c/${code}`, { scroll: false })
    void add()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once, when the page is ready
  }, [user, lookup.data, params])

  const book = (coupon: MyCoupon) => {
    if (user && coupon.code && coupon.expiresAt) {
      rememberOffer({
        userId: user.id,
        code: coupon.code,
        vendorId: coupon.vendorId,
        vehicleId: null,
        endsAt: coupon.expiresAt,
      })
    }
    router.push(couponBookPath(coupon))
  }

  const body = (() => {
    if (!ready || lookup.isPending) {
      return (
        <div className="flex flex-col gap-3" aria-busy="true">
          <SkeletonCard />
          <SkeletonCard />
        </div>
      )
    }
    if (lookup.isError) {
      const error = lookup.error
      // A wrong code, a typo, too many tries: the server's sentence, nothing to retry.
      if (error instanceof ApiError && [400, 404, 429].includes(error.status)) {
        return (
          <EmptyState
            icon={<IconTicket size={32} stroke={1.5} />}
            title="We couldn't open this coupon"
            subtitle={error.message}
            actionLabel="Find garages"
            onAction={() => router.push('/garages')}
          />
        )
      }
      return (
        <ErrorState
          message="Couldn't load this coupon. Check your connection."
          onRetry={() => void lookup.refetch()}
        />
      )
    }

    const coupon = lookup.data
    if (!coupon) return null
    const closed = added ? null : couponClosedLine(coupon)
    const stamps = coupon.reward === 'stamps'

    return (
      <>
        <CouponTicket
          as="h1"
          reward={coupon.reward}
          title={coupon.title}
          conditions={coupon.conditions}
          stamps={coupon.stamps}
          code={coupon.code}
          dimmed={closed !== null && coupon.state !== 'added'}
          amountOff={coupon.offAmount}
          percentOff={coupon.offPercent}
        />

        {added ? (
          <ScCard className="flex flex-col gap-3">
            <p role="status" className="text-[14px] text-text-primary">
              {stamps
                ? 'Added to your Shine Card.'
                : 'Added to your Detlio account.'}
              {!stamps && added.expiresAt && (
                <> {couponUseByLine(added.expiresAt)}.</>
              )}
            </p>
            {!stamps && (
              <p className="text-[12px] text-text-secondary">
                It comes off at checkout, once.
              </p>
            )}
            {/* The page's one red action, now that the coupon is in. */}
            {stamps ? (
              <ScButton
                onClick={() => router.push('/profile/rewards')}
                className="min-h-11"
              >
                See your Shine Card
              </ScButton>
            ) : (
              <ScButton onClick={() => book(added)} className="min-h-11">
                Book a wash
              </ScButton>
            )}
            <Link
              href="/profile/coupons"
              className="flex min-h-11 items-center justify-center text-[13px] font-medium text-text-secondary hover:text-text-primary"
            >
              See your coupons
            </Link>
          </ScCard>
        ) : closed ? (
          <ScCard className="flex flex-col gap-2">
            <p className="text-[13px] text-text-secondary">{closed}</p>
            {coupon.state === 'added' && (
              <Link
                href="/profile/coupons"
                className="text-[13px] font-medium text-text-primary underline underline-offset-2"
              >
                Open my coupons
              </Link>
            )}
          </ScCard>
        ) : (
          <div className="flex flex-col gap-2">
            <p className="text-[12px] text-text-secondary">
              {couponUseByLine(coupon.validUntil)}
            </p>
            <ScButton
              onClick={() => void add()}
              disabled={adding}
              className="min-h-11"
            >
              {adding ? 'Adding…' : 'Add to my Detlio'}
            </ScButton>
            <p className="text-[12px] text-text-muted">
              {user
                ? stamps
                  ? 'The stamps go on your Shine Card in Detlio Rewards.'
                  : 'It goes into your account as a coupon only you can use, and comes off at checkout.'
                : 'Sign in or create an account with your phone number, then it is added to your account.'}
            </p>
            {addError && (
              <p role="alert" className="text-[12px] text-error">
                {addError}
              </p>
            )}
          </div>
        )}
      </>
    )
  })()

  return (
    <CustomerShell showNav={!!user} showBrand className="gap-4 py-4">
      {body}
    </CustomerShell>
  )
}
