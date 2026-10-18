'use client'

import { Suspense, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { toast } from 'react-toastify'
import { IconChevronLeft, IconChevronRight, IconShare, IconSparkles, IconStarFilled, IconX } from '@tabler/icons-react'
import { ScButton } from '@repo/ui/sc/button'
import { BrandMark } from '@repo/ui/sc/brand-mark'
import { EmptyState, ErrorState } from '@repo/ui/sc/empty-state'
import { ScSwitch } from '@repo/ui/sc/switch'
import { ApiError } from '@repo/core/api/client'
import { rewardsEnabled, useRewardsConfig } from '@repo/core/api/hooks/use-rewards'
import { useWrapped, useWrappedEvent } from '@repo/core/api/hooks/use-reward-extras'
import { useAuthStore } from '@repo/core/stores/auth-store'
import { cn } from '@repo/core/utils'
import { BADGE_CATALOG } from '@repo/core/achievements'
import { WRAPPED_SHARE_LINE, wrappedCards, type WrappedCard, type WrappedStats } from '@repo/core/wrapped'
import { BadgeMedal } from '@/components/rewards/badge-medal'
import { WrappedVisual } from '@/components/rewards/wrapped-visual'
import { levelMetal, shareWrappedCard, splitBig, wrappedBackground } from '@/lib/wrapped-image'

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
        <div className="wrapped-story-size mx-auto mt-6 aspect-[9/16] animate-pulse rounded-[24px] bg-surface" aria-busy="true" />
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
      const outcome = await shareWrappedCard(card, { year, index, total: cards.length, level: stats.level })
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
        className="wrapped-story wrapped-story-size relative mx-auto mt-3 aspect-[9/16] overflow-hidden rounded-[24px] border border-white/10"
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
        <span key={`glow-${card.key}`} className="wrapped-story__glow" aria-hidden />
        <WrappedCardView key={`${card.key}-${showName}`} card={card} year={year} stats={stats} />
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

/** The badge keys for the names on the level card (the API sends names). */
function badgeKeysFor(names: string[]) {
  return names.map((name) => ({ name, key: BADGE_CATALOG.find((b) => b.label === name)?.key ?? ('challenge' as const) }))
}

/**
 * One card on screen: the same words, in the same order, as its image, with
 * the level's pill, the figure huge (its unit under it), and a picture that
 * fills the card (the coupé, coins, the year's months, the level's medal).
 */
function WrappedCardView({ card, year, stats }: { card: WrappedCard; year: number; stats: WrappedStats }) {
  const split = splitBig(card.big)
  const metal = levelMetal(stats.level.key)
  return (
    <div className="wrapped-card--in absolute inset-0 flex flex-col px-6 pb-6 pt-6" aria-live="polite">
      <div className="flex items-center justify-between">
        <BrandMark height={20} />
        <span className="font-numeric text-[11px] font-semibold tracking-[0.12em] text-white/75">WRAPPED {year}</span>
      </div>
      <span
        className="mt-4 inline-flex items-center gap-1.5 self-start rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.12em]"
        style={{ background: `linear-gradient(120deg, ${metal.light}, ${metal.base} 55%, ${metal.dark})`, color: metal.ink }}
      >
        <IconStarFilled size={11} aria-hidden />
        {stats.level.label} level
      </span>

      <div className="mt-6 flex flex-col">
        <span aria-hidden className="mb-2.5 h-[3px] w-6 rounded-full bg-[#E4002B]" />
        <p className="text-[14px] text-white/75">{card.eyebrow}</p>
        {split ? (
          <p className="mt-1 text-white">
            <span className="block font-numeric text-[84px] font-bold leading-[0.95] tracking-[-0.03em]">{split.figure}</span>
            {split.unit && <span className="block text-[24px] font-semibold leading-tight">{split.unit}</span>}
          </p>
        ) : (
          <p className={cn('mt-1 font-numeric font-bold leading-[1.02] tracking-[-0.02em] text-white', card.big.length > 14 ? 'text-[34px]' : 'text-[48px]')}>{card.big}</p>
        )}
        <p className="mt-2 text-[14px] text-white/85">{card.caption}</p>
        {card.key === 'level' && card.extra.length > 0 && (
          <ul className="mt-3 flex gap-3" aria-label="Badges earned">
            {badgeKeysFor(card.extra).map((b) => (
              <li key={b.name} className="flex w-[64px] flex-col items-center gap-1 text-center">
                <BadgeMedal badgeKey={b.key} earned size={40} />
                <span className="text-[10px] leading-tight text-white/80">{b.name}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="relative min-h-0 flex-1">
        <WrappedVisual cardKey={card.key} monthIndex={stats.busiestMonth ? stats.busiestMonth.month - 1 : null} level={stats.level} />
      </div>

      <p className="flex items-center gap-1.5 text-[14px] font-semibold text-white">
        <span aria-hidden className="size-1.5 rounded-full bg-[#E4002B]" />
        {WRAPPED_SHARE_LINE}
      </p>
    </div>
  )
}
