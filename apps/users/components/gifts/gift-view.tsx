'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { IconGift } from '@tabler/icons-react'
import { ScButton } from '@repo/ui/sc/button'
import { ScButtonLink } from '@repo/ui/sc/button-link'
import { ScCard } from '@repo/ui/sc/card'
import { EmptyState, ErrorState, SkeletonCard } from '@repo/ui/sc/empty-state'
import { ApiError } from '@repo/core/api/client'
import { lookupGift, redeemGift, type PublicGift, type RedeemResult } from '@repo/core/api/gifts'
import { giftKeys, giftsEnabled, invalidateGiftData, useGiftsConfig } from '@repo/core/api/hooks/use-gifts'
import { useAuthStore } from '@repo/core/stores/auth-store'
import { CustomerShell } from '@/components/customer-shell'
import { GiftsUnavailable } from '@/components/gifts/gifts-unavailable'
import { PremiumCard } from '@/components/premium-card/premium-card'
import { ShareCardImage } from '@/components/premium-card/share-card-image'
import { formatGiftDate, giftRupees } from '@/lib/gifts'
import { CARS_ILLUSTRATION_LINE, firstName, giftCardSpec } from '@/lib/premium-card'

/** What a gift that can't be redeemed says instead of the button. */
function closedLine(gift: PublicGift): string | null {
  switch (gift.state) {
    case 'redeemed':
      return 'This gift has already been redeemed.'
    case 'expired':
      return gift.expiresAt ? `This gift expired on ${formatGiftDate(gift.expiresAt)}.` : 'This gift has expired.'
    case 'cancelled':
      return 'This gift was cancelled.'
    default:
      return null
  }
}

/**
 * The gift page's body: the card, who it is for and from, the message,
 * "Redeem on Detlio" and "Share to Instagram". Signed out, Redeem goes to sign-in and back here;
 * signed in, it adds the gift to the customer's Detlio credit.
 *
 * Looked up once (POST, the code in the body) and never again on focus or
 * on a timer: the API counts wrong codes, and a refetch is not a new answer.
 * Every refusal (a wrong code, too many tries, already redeemed, expired,
 * cancelled) is shown in the server's own words.
 */
export function GiftView({ code }: { code: string }) {
  const router = useRouter()
  const queryClient = useQueryClient()
  const user = useAuthStore((s) => s.user)
  const ready = useAuthStore((s) => s.isSessionReady)
  const config = useGiftsConfig()
  const on = giftsEnabled(config.data)

  const lookup = useQuery({
    queryKey: [...giftKeys.all, 'lookup', code],
    queryFn: async () => (await lookupGift(code)).gift,
    enabled: on,
    retry: false,
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  })

  const [redeeming, setRedeeming] = useState(false)
  const [redeemed, setRedeemed] = useState<RedeemResult | null>(null)
  const [redeemError, setRedeemError] = useState<string | null>(null)

  const redeem = async () => {
    if (redeeming) return
    if (!user) {
      // Back to this page after signing in.
      router.push(`/login?next=${encodeURIComponent(`/gift/${code}`)}`)
      return
    }
    setRedeeming(true)
    setRedeemError(null)
    try {
      setRedeemed(await redeemGift(code))
      void invalidateGiftData(queryClient)
    } catch (error) {
      setRedeemError(
        error instanceof ApiError ? error.message : "Couldn't redeem the gift. Check your connection and try again."
      )
    } finally {
      setRedeeming(false)
    }
  }

  const body = (() => {
    if (config.isPending || (on && lookup.isPending)) {
      return (
        <div className="flex flex-col gap-3" aria-busy="true">
          <SkeletonCard />
          <SkeletonCard />
        </div>
      )
    }
    if (!on) return <GiftsUnavailable />
    if (lookup.isError) {
      const error = lookup.error
      // A wrong code, too many tries: the server's sentence, nothing to retry.
      if (error instanceof ApiError && (error.status === 404 || error.status === 429)) {
        return (
          <EmptyState
            icon={<IconGift size={32} stroke={1.5} />}
            title="We couldn't open this gift"
            subtitle={error.message}
            actionLabel="Find garages"
            onAction={() => router.push('/garages')}
          />
        )
      }
      return (
        <ErrorState
          message="Couldn't load this gift. Check your connection."
          onRetry={() => void lookup.refetch()}
        />
      )
    }

    const gift = lookup.data
    if (!gift) return null
    const closed = redeemed ? null : closedLine(gift)
    const cardSpec = (showName: boolean) =>
      giftCardSpec({ design: gift.design, amount: gift.amount, recipientName: gift.recipientName, expiresAt: gift.expiresAt, validMonths: config.data?.validMonths, showName })

    return (
      <>
        {/* The stored card (0055); an old link's #card= fragment is ignored. */}
        <div className="flex flex-col gap-1.5">
          <PremiumCard spec={cardSpec(true)} />
          <p className="text-center text-[11px] text-text-muted">{CARS_ILLUSTRATION_LINE}</p>
        </div>

        <div className="flex flex-col gap-1">
          <h1 className="text-[20px] font-semibold leading-tight text-text-primary">
            <span className="font-numeric">{giftRupees(gift.amount)}</span> Detlio gift for {gift.recipientName}
          </h1>
          <p className="text-[13px] text-text-secondary">From {gift.fromName}</p>
        </div>

        {gift.message && (
          <ScCard>
            <p className="whitespace-pre-wrap break-words text-[14px] text-text-primary">“{gift.message}”</p>
          </ScCard>
        )}

        {redeemed ? (
          <ScCard className="flex flex-col gap-3">
            <p role="status" className="text-[14px] text-text-primary">
              <span className="font-numeric">{giftRupees(redeemed.amount)}</span> added to your Detlio credit.
              Balance <span className="font-numeric">{giftRupees(redeemed.balance)}</span>.
              {redeemed.expiresAt && (
                <>
                  {' '}
                  Use by <span className="font-numeric">{formatGiftDate(redeemed.expiresAt)}</span>.
                </>
              )}
            </p>
            <p className="text-[12px] text-text-secondary">It comes off your next booking at checkout.</p>
            {/* The page's one red action, now that the gift is in. */}
            <ScButtonLink href="/garages" fullWidth className="w-full">
              Book a wash
            </ScButtonLink>
            <Link
              href="/profile/credit"
              className="flex min-h-11 items-center justify-center text-[13px] font-medium text-text-secondary hover:text-text-primary"
            >
              See your Detlio credit
            </Link>
          </ScCard>
        ) : closed ? (
          <ScCard>
            <p className="text-[13px] text-text-secondary">{closed}</p>
          </ScCard>
        ) : (
          <div className="flex flex-col gap-2">
            {gift.expiresAt && (
              <p className="text-[12px] text-text-secondary">
                Use by <span className="font-numeric">{formatGiftDate(gift.expiresAt)}</span>
              </p>
            )}
            <ScButton onClick={() => void redeem()} disabled={redeeming || !ready} className="min-h-11">
              {redeeming ? 'Redeeming…' : 'Redeem on Detlio'}
            </ScButton>
            <p className="text-[12px] text-text-muted">
              {user
                ? 'The gift becomes Detlio credit on your account, used at checkout on your next booking.'
                : 'Sign in or create an account with your phone number, then the gift becomes Detlio credit on it.'}
            </p>
            {redeemError && (
              <p role="alert" className="text-[12px] text-error">
                {redeemError}
              </p>
            )}
          </div>
        )}

        {/* The card as a picture for Instagram: never the code or the link. */}
        <ShareCardImage spec={cardSpec} firstName={firstName(gift.recipientName) || null} fileName="detlio-gift" />
      </>
    )
  })()

  return (
    <CustomerShell showNav={!!user} showBrand className="gap-4 py-4">
      {body}
    </CustomerShell>
  )
}
