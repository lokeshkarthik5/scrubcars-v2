'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useQueryClient } from '@tanstack/react-query'
import { IconGift } from '@tabler/icons-react'
import { ScBadge } from '@repo/ui/sc/badge'
import { ScButton } from '@repo/ui/sc/button'
import { ScButtonLink } from '@repo/ui/sc/button-link'
import { ScCard } from '@repo/ui/sc/card'
import { EmptyState, ErrorState, SkeletonCard } from '@repo/ui/sc/empty-state'
import { TopBar } from '@repo/ui/sc/top-bar'
import { ApiError } from '@repo/core/api/client'
import { makeGiftLink, type GiftLink, type GiftState, type SentGift } from '@repo/core/api/gifts'
import {
  giftsEnabled,
  invalidateGiftData,
  useGiftsConfig,
  useMySentGifts,
} from '@repo/core/api/hooks/use-gifts'
import { useAuthStore } from '@repo/core/stores/auth-store'
import { CustomerShell } from '@/components/customer-shell'
import { GiftCardArt } from '@/components/gifts/gift-card-art'
import { GiftShare } from '@/components/gifts/gift-share'
import { GiftsUnavailable } from '@/components/gifts/gifts-unavailable'
import { isHomeHubEnabled } from '@/lib/home-hub'
import { GIFT_STATE_LABELS, formatGiftDate, giftEvidenceLine, giftRupees } from '@/lib/gifts'

const STATE_BADGE: Record<GiftState, 'success' | 'pending' | 'muted'> = {
  pending: 'pending',
  available: 'pending',
  redeemed: 'success',
  expired: 'muted',
  cancelled: 'muted',
}

/**
 * Profile → Gifts you sent (0049): the gifts the customer bought, newest
 * first, each with its purchase evidence (the gift number, what was paid and
 * when, and the Razorpay payment id: a gift has no booking receipt), and
 * "Get the link" while it can still be redeemed. The code is never stored
 * where the buyer can read it again, so a link is always a new one, and a
 * new link ends the old: the button says so before it makes one.
 */
export default function SentGiftsPage() {
  const router = useRouter()
  const queryClient = useQueryClient()
  const user = useAuthStore((s) => s.user)
  const ready = useAuthStore((s) => s.isSessionReady)
  const config = useGiftsConfig()
  const on = giftsEnabled(config.data)
  const gifts = useMySentGifts(on && !!user)
  // The gift whose "Get a new link" is waiting for a second tap.
  const [confirming, setConfirming] = useState<string | null>(null)
  const [making, setMaking] = useState<string | null>(null)
  const [linkError, setLinkError] = useState<{ giftId: string; text: string } | null>(null)
  const [sharing, setSharing] = useState<{ gift: SentGift; link: GiftLink } | null>(null)

  const header = <TopBar title="Gifts you sent" showBack backHref="/profile" large={isHomeHubEnabled()} />

  if (ready && !user) {
    return (
      <CustomerShell showNav showBrand className="gap-4 py-4">
        {header}
        <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
          <p className="text-[15px] font-semibold text-text-primary">Sign in to see the gifts you sent</p>
          <ScButton
            className="mt-2 w-auto px-8"
            onClick={() => router.push(`/login?next=${encodeURIComponent('/profile/gifts')}`)}
          >
            Sign in
          </ScButton>
        </div>
      </CustomerShell>
    )
  }

  if (ready && !config.isPending && !on) {
    return (
      <CustomerShell showNav showBrand className="gap-4 py-4">
        {header}
        <GiftsUnavailable />
      </CustomerShell>
    )
  }

  const getLink = async (gift: SentGift) => {
    setMaking(gift.id)
    setLinkError(null)
    try {
      const link = await makeGiftLink(gift.id)
      setConfirming(null)
      setSharing({ gift: { ...gift, linkMade: true }, link })
      void invalidateGiftData(queryClient)
    } catch (error) {
      setLinkError({
        giftId: gift.id,
        text: error instanceof ApiError ? error.message : "Couldn't make the link. Check your connection and try again.",
      })
      void invalidateGiftData(queryClient)
    } finally {
      setMaking(null)
    }
  }

  if (sharing) {
    return (
      <CustomerShell showNav showBrand className="gap-4 py-4">
        <TopBar title="Share your gift" large={isHomeHubEnabled()} />
        <GiftShare gift={sharing.gift} link={sharing.link} />
        <ScButton variant="secondary" className="min-h-11" onClick={() => setSharing(null)}>
          Back to Gifts you sent
        </ScButton>
      </CustomerShell>
    )
  }

  const list = gifts.data ?? []

  return (
    <CustomerShell showNav showBrand className="gap-4 py-4">
      {header}

      {!ready || config.isPending || gifts.isPending ? (
        <div className="flex flex-col gap-3" aria-busy="true">
          <SkeletonCard />
          <SkeletonCard />
        </div>
      ) : gifts.isError && list.length === 0 ? (
        <ErrorState
          message="Couldn't load your gifts. Check your connection."
          onRetry={() => void gifts.refetch()}
        />
      ) : list.length === 0 ? (
        <EmptyState
          icon={<IconGift size={32} stroke={1.5} />}
          title="No gifts sent yet"
          subtitle="Give someone a car wash: they get a link that adds it to their Detlio credit."
          actionLabel="Gift a wash"
          onAction={() => router.push('/profile/gifts/new')}
        />
      ) : (
        <>
          <ScButtonLink href="/profile/gifts/new" fullWidth className="w-full">
            Gift a wash
          </ScButtonLink>
          <ul aria-label="Gifts you sent, newest first" className="flex flex-col gap-3">
            {list.map((gift) => (
              <li key={gift.id}>
                <ScCard className="flex flex-col gap-2">
                  <div className="flex items-start justify-between gap-3">
                    {/* The card as sent, in its stored design. */}
                    <GiftCardArt design={gift.design} variant="swatch" className="w-[64px] shrink-0" />
                    <div className="min-w-0 flex-1">
                      <p className="text-[15px] font-semibold text-text-primary">
                        <span className="font-numeric">{giftRupees(gift.amount)}</span> for {gift.recipientName}
                      </p>
                      {gift.state === 'redeemed' && gift.redeemedAt ? (
                        <p className="text-[12px] text-text-secondary">
                          Redeemed on <span className="font-numeric">{formatGiftDate(gift.redeemedAt)}</span>
                        </p>
                      ) : gift.state === 'available' && gift.expiresAt ? (
                        <p className="text-[12px] text-text-secondary">
                          Use by <span className="font-numeric">{formatGiftDate(gift.expiresAt)}</span>
                        </p>
                      ) : null}
                    </div>
                    <ScBadge variant={STATE_BADGE[gift.state]}>{GIFT_STATE_LABELS[gift.state]}</ScBadge>
                  </div>

                  {gift.message && (
                    <p className="line-clamp-2 break-words text-[12px] italic text-text-secondary">“{gift.message}”</p>
                  )}

                  {/* The purchase's evidence: there is no booking receipt for a gift. */}
                  <p className="break-all font-numeric text-[11px] text-text-muted">{giftEvidenceLine(gift)}</p>

                  {gift.canMakeLink &&
                    (gift.linkMade && confirming === gift.id ? (
                      <div className="flex flex-col gap-2 border-t border-border pt-2">
                        <p className="text-[12px] text-text-primary">
                          A new link replaces the old one. Any link you shared before stops working.
                        </p>
                        <div className="flex gap-2">
                          <ScButton
                            variant="secondary"
                            className="min-h-11"
                            disabled={making === gift.id}
                            onClick={() => setConfirming(null)}
                          >
                            Keep the old link
                          </ScButton>
                          <ScButton
                            variant="secondary"
                            className="min-h-11"
                            disabled={making === gift.id}
                            onClick={() => void getLink(gift)}
                          >
                            {making === gift.id ? 'Making…' : 'Get a new link'}
                          </ScButton>
                        </div>
                      </div>
                    ) : (
                      <ScButton
                        variant="secondary"
                        className="min-h-11"
                        disabled={making === gift.id}
                        onClick={() => (gift.linkMade ? setConfirming(gift.id) : void getLink(gift))}
                      >
                        {making === gift.id ? 'Making…' : gift.linkMade ? 'Get a new link' : 'Get the link'}
                      </ScButton>
                    ))}

                  {linkError?.giftId === gift.id && (
                    <p role="alert" className="text-[12px] text-error">
                      {linkError.text}
                    </p>
                  )}
                </ScCard>
              </li>
            ))}
          </ul>
        </>
      )}
    </CustomerShell>
  )
}
