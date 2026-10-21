'use client'

import { Suspense, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { toast } from 'react-toastify'
import { IconChevronLeft, IconChevronRight, IconShare, IconSparkles, IconX } from '@tabler/icons-react'
import { ScButton } from '@repo/ui/sc/button'
import { BrandMark } from '@repo/ui/sc/brand-mark'
import { EmptyState, ErrorState } from '@repo/ui/sc/empty-state'
import { ScSwitch } from '@repo/ui/sc/switch'
import { ApiError } from '@repo/core/api/client'
import { rewardsEnabled, useRewardsConfig } from '@repo/core/api/hooks/use-rewards'
import { useWrapped, useWrappedEvent } from '@repo/core/api/hooks/use-reward-extras'
import { useAuthStore } from '@repo/core/stores/auth-store'
import { cn } from '@repo/core/utils'
import { WRAPPED_SHARE_LINE, wrappedCards, type WrappedCard, type WrappedStats } from '@repo/core/wrapped'
import { shareWrappedCard, wrappedBackground } from '@/lib/wrapped-image'

/**
 * Detlio Wrapped (0054): the customer's year as story cards. Tap the right
 * of a card (or swipe left, or →) for the next, the left for the one
 * before. Each card shares as a 1080×1920 image made on this phone, with
 * the first name (or not: the switch) and nothing else about them.
 */
export default function WrappedPage() {
  return (
    <Suspense>
      <WrappedScreen />
    </Suspense>
  )
}

function WrappedScreen() {
  const router = useRouter()
  const params = useSearchParams()
  const user = useAuthStore((s) => s.user)
  const ready = useAuthStore((s) => s.isSessionReady)
  const config = useRewardsConfig()
  const on = rewardsEnabled(config.data)
  const year = Number(params.get('year')) || null
  const wrapped = useWrapped(year, on && !!user)

  useEffect(() => {
    if (ready && !user) router.replace(`/login?next=${encodeURIComponent(`/profile/rewards/wrapped?year=${year ?? ''}`)}`)
  }, [ready, user, router, year])

  const back = (
    <Link href="/profile/rewards" aria-label="Close" className="grid size-10 place-items-center rounded-full text-text-primary hover:bg-surface">
      <IconX size={20} />
    </Link>
  )

  if (!ready || config.isPending || (on && wrapped.isPending)) {
    return (
      <Frame>
        <div className="flex justify-end">{back}</div>
        <div className="mx-auto mt-6 aspect-[9/16] w-full max-w-[360px] animate-pulse rounded-[24px] bg-surface" aria-busy="true" />
      </Frame>
    )
  }
  if (!on || wrapped.isError || !wrapped.data || !year) {
    return (
      <Frame>
        <div className="flex justify-end">{back}</div>
        {wrapped.isError && !(wrapped.error instanceof ApiError && wrapped.error.code === 'WRAPPED_NOT_AVAILABLE') ? (
          <ErrorState message="Couldn't load your Wrapped. Check your connection." onRetry={() => void wrapped.refetch()} />
        ) : (
          <EmptyState
            icon={<IconSparkles size={32} stroke={1.5} />}
            title="Your Detlio Wrapped isn't here yet"
            subtitle="It opens on 1 December, with every wash of your year."
            actionLabel="Back to rewards"
            onAction={() => router.push('/profile/rewards')}
          />
        )}
      </Frame>
    )
  }
  return <Story stats={wrapped.data} year={year} close={back} />
}

function Frame({ children }: { children: React.ReactNode }) {
  return <main className="mx-auto flex min-h-dvh w-full max-w-[428px] flex-col bg-brand-black px-4 pb-6 pt-3">{children}</main>
}

function Story({ stats, year, close }: { stats: WrappedStats; year: number; close: React.ReactNode }) {
  const [showName, setShowName] = useState(true)
  const [index, setIndex] = useState(0)
  const [sharing, setSharing] = useState(false)
  const event = useWrappedEvent()
  const opened = useRef(false)
  const start = useRef<{ x: number; y: number } | null>(null)
  const cards = useMemo(() => wrappedCards(stats, { showName }), [stats, showName])
  const card = cards[Math.min(index, cards.length - 1)]

  useEffect(() => {
    if (opened.current) return
    opened.current = true
    event.mutate({ year, kind: 'opened' })
  }, [event, year])

  const go = (step: number) => setIndex((i) => Math.max(0, Math.min(cards.length - 1, i + step)))

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') setIndex((i) => Math.min(cards.length - 1, i + 1))
      if (e.key === 'ArrowLeft') setIndex((i) => Math.max(0, i - 1))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [cards.length])

  const share = async () => {
    setSharing(true)
    try {
      const outcome = await shareWrappedCard(card, { year, index, total: cards.length })
      if (outcome !== 'cancelled') event.mutate({ year, kind: 'shared' })
      if (outcome === 'downloaded') toast.success('Image saved')
    } catch {
      toast.error("Couldn't make the image. Try again.")
    } finally {
      setSharing(false)
    }
  }

  return (
    <Frame>
      <div className="flex items-center gap-2">
        <div className="flex flex-1 gap-1" aria-hidden>
          {cards.map((c, i) => (
            <span key={c.key} className="h-[3px] flex-1 overflow-hidden rounded-full bg-white/20">
              <span className="wrapped-segment__fill block h-full rounded-full bg-white" style={{ width: i <= index ? '100%' : '0%' }} />
            </span>
          ))}
        </div>
        {close}
      </div>

      <section
        aria-roledescription="story"
        aria-label={`Detlio Wrapped ${year}, card ${index + 1} of ${cards.length}`}
        className="wrapped-story relative mx-auto mt-3 aspect-[9/16] w-full max-w-[360px] overflow-hidden rounded-[24px] border border-white/10"
        style={{ background: wrappedBackground(card.key) }}
        onPointerDown={(e) => {
          start.current = { x: e.clientX, y: e.clientY }
        }}
        onPointerUp={(e) => {
          const from = start.current
          start.current = null
          if (!from) return
          const dx = e.clientX - from.x
          if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(e.clientY - from.y)) return go(dx < 0 ? 1 : -1)
          const rect = e.currentTarget.getBoundingClientRect()
          go(e.clientX - rect.left < rect.width / 3 ? -1 : 1)
        }}
      >
        <WrappedCardView key={`${card.key}-${showName}`} card={card} year={year} />
      </section>

      <div className="mx-auto mt-3 flex w-full max-w-[360px] items-center justify-between gap-2">
        <button type="button" onClick={() => go(-1)} disabled={index === 0} aria-label="Previous card" className="grid size-11 place-items-center rounded-full border border-border text-text-primary disabled:opacity-30">
          <IconChevronLeft size={20} />
        </button>
        <ScButton className="flex h-11 items-center justify-center gap-2" fullWidth onClick={() => void share()} disabled={sharing}>
          <IconShare size={18} aria-hidden />
          {sharing ? 'Making the image…' : 'Share this card'}
        </ScButton>
        <button type="button" onClick={() => go(1)} disabled={index === cards.length - 1} aria-label="Next card" className="grid size-11 place-items-center rounded-full border border-border text-text-primary disabled:opacity-30">
          <IconChevronRight size={20} />
        </button>
      </div>
      {stats.firstName && (
        <div className="mx-auto mt-3 flex w-full max-w-[360px] items-center justify-between gap-3">
          <span className="text-[12px] text-text-secondary">Show my first name</span>
          <ScSwitch checked={showName} onChange={setShowName} label="Show my first name on the cards" />
        </div>
      )}
      <p className="mx-auto mt-2 max-w-[360px] text-center text-[11px] text-text-muted">
        Images are made on your phone. They show your first name (if you leave it on), garage names and your numbers, nothing else.
      </p>
    </Frame>
  )
}

/** One card on screen: the same words, in the same places, as its image. */
function WrappedCardView({ card, year }: { card: WrappedCard; year: number }) {
  return (
    <div className="wrapped-card--in absolute inset-0 flex flex-col px-7 pb-7 pt-7" aria-live="polite">
      <div className="flex items-center justify-between">
        <BrandMark height={20} />
        <span className="font-numeric text-[12px] font-semibold text-white/70">Wrapped {year}</span>
      </div>
      <div className="mt-auto flex flex-col gap-2 pb-6">
        <p className="text-[14px] text-white/70">{card.eyebrow}</p>
        <p className={cn('font-numeric font-semibold leading-[1.02] text-white', card.big.length > 14 ? 'text-[34px]' : 'text-[48px]')}>{card.big}</p>
        <p className="mt-2 text-[14px] text-white/85">{card.caption}</p>
        {card.extra.length > 0 && (
          <ul className="mt-1 text-[13px] text-white/70">
            {card.extra.map((line) => (
              <li key={line}>· {line}</li>
            ))}
          </ul>
        )}
      </div>
      <p className="text-[15px] font-semibold text-white">{WRAPPED_SHARE_LINE}</p>
    </div>
  )
}
