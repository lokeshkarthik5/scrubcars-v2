'use client'

import { useEffect, useMemo, useState } from 'react'
import { ScButton } from '@repo/ui/sc/button'
import { ScSheet } from '@repo/ui/sc/modal'
import { Figures } from '@repo/ui/sc/figures'
import type { BadgeToCelebrate } from '@repo/core/api/reward-extras'
import { useMarkBadgesSeen } from '@repo/core/api/hooks/use-reward-extras'
import { bonusStampsLine } from '@repo/core/achievements'
import { BadgeMedal } from './badge-medal'
import { useT, useTn } from '@repo/core/i18n'

/** A sheet shows at most this many; any more wait in the cabinet, already counted as seen. */
const SHOWN_AT_ONCE = 3

/**
 * The celebration (0054): a sheet for each badge the customer has not seen
 * yet, one after another, then they are marked seen on every device. Shown
 * on Home and the Rewards page; a push's tap (…?badge=<id>) puts that one
 * first. The medal lands with a small pop and a soft glow, which stop under
 * prefers-reduced-motion (globals.css); the words arrive either way.
 */
export function BadgeCelebration({ badges, focusId = null }: { badges: BadgeToCelebrate[]; focusId?: string | null }) {
  const tn = useTn()
  const t = useT()
  const seen = useMarkBadgesSeen()
  // The list is fixed when the sheet opens, so a refetch underneath never reshuffles it.
  const [queue, setQueue] = useState<BadgeToCelebrate[]>([])
  const [index, setIndex] = useState(0)
  const [open, setOpen] = useState(false)
  const [done, setDone] = useState<string[]>([])
  // Every badge waiting when the sheet opened: all are marked seen at the end, shown or not.
  const [waiting, setWaiting] = useState<string[]>([])

  const ordered = useMemo(() => {
    const fresh = badges.filter((b) => !done.includes(b.id))
    const first = fresh.find((b) => b.id === focusId)
    return first ? [first, ...fresh.filter((b) => b !== first)] : fresh
  }, [badges, focusId, done])

  useEffect(() => {
    if (open || ordered.length === 0) return
    // A moment after the page is there under it, not over a loading screen.
    const timer = window.setTimeout(() => {
      setQueue(ordered.slice(0, SHOWN_AT_ONCE))
      setWaiting(ordered.map((b) => b.id))
      setIndex(0)
      setOpen(true)
    }, 450)
    return () => window.clearTimeout(timer)
  }, [ordered, open])

  const badge = queue[index] ?? null
  const finish = () => {
    if (!open) return
    const ids = waiting
    setDone((current) => [...current, ...ids])
    setOpen(false)
    seen.mutate(ids)
  }
  const next = () => {
    if (index < queue.length - 1) setIndex(index + 1)
    else finish()
  }

  const more = queue.length - index - 1
  const inCabinet = waiting.length - queue.length
  const bonus = badge ? bonusStampsLine(badge.bonusStamps) : null

  return (
    <ScSheet open={open && badge !== null} onClose={finish} aria-label={t('Badge earned')}>
      {badge && (
        <div key={badge.id} className="flex flex-col items-center gap-3 px-6 pb-2 pt-3 text-center">
          <div className="badge-celebrate relative grid size-[150px] place-items-center">
            <span aria-hidden className="badge-celebrate__glow" />
            <BadgeMedal badgeKey={badge.key} earned size={104} className="badge-celebrate__medal" />
          </div>
          <p className="text-t5 uppercase tracking-[0.12em] text-text-secondary">{t('Badge earned')}</p>
          <h2 className="text-[22px] font-semibold leading-tight text-text-primary" aria-live="polite">
            {badge.label}
          </h2>
          <p className="text-t4 text-text-secondary">{badge.howTo}</p>
          {more === 0 && inCabinet > 0 && (
            <p className="text-t5 text-text-muted">
              {tn(inCabinet, 'And {count} more badge in your cabinet.', 'And {count} more badges in your cabinet.')}
            </p>
          )}
          {bonus && (
            <p className="rounded-full border border-line px-3 py-1 text-t5 text-text-primary">
              <Figures text={t('{bonus} added to your Shine Card', { bonus })} />
            </p>
          )}
          <ScButton variant="secondary" className="mt-2" onClick={next}>
            {more > 0 ? t('Next badge ({more} more)', { more }) : t('Nice')}
          </ScButton>
        </div>
      )}
    </ScSheet>
  )
}
