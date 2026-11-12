'use client'

import { useEffect, useRef, useState } from 'react'
import type { Milestone } from '@repo/core/api/garage-book'
import { useMarkMilestoneSeen, useMilestone } from '@repo/core/api/hooks/use-garage-book'
import { milestoneTitle, monthName, monthYear, rupees } from '@repo/core/garage-book'
import { useT } from '@repo/core/i18n'

/**
 * Milestones in metal (moment 6, the owner's): the 100th customer, the
 * first ₹1 lakh month, the best month ever, on a brushed-silver card whose
 * number rolls up once, with what comes next on gold under it. Shown once:
 * it is marked seen as it appears, and stays on screen until the owner
 * closes it or leaves (the milestone is kept here, so the refetch that
 * follows the "seen" does not snatch it away).
 */
export function MilestoneCard({ garage }: { garage: string }) {
  const t = useT()
  const query = useMilestone()
  const seen = useMarkMilestoneSeen()
  const [shown, setShown] = useState<Milestone | null>(null)
  const [closed, setClosed] = useState(false)
  const marked = useRef<string | null>(null)
  const { mutate } = seen
  const milestone = shown ?? query.data?.milestone ?? null

  useEffect(() => {
    const next = query.data?.milestone
    if (!next || marked.current) return
    marked.current = next.key
    setShown(next)
    mutate(next.key)
  }, [query.data, mutate])

  if (!milestone || closed) return null
  const now = new Date()
  const [from, to] = figures(milestone)
  // What comes next, on gold under its own NEXT (milestoneNext's "Next: …" without the word twice).
  const next = milestone.next ? milestoneTitle(milestone.next) : null
  const title =
    milestone.kind === 'customers'
      ? milestoneTitle({ kind: 'customers', value: milestone.value })
      : milestone.kind === 'lakh_month'
        ? milestoneTitle({ kind: 'lakh_month', value: milestone.value })
        : milestoneTitle({ kind: 'best_month' })
  const since =
    milestone.kind === 'customers'
      ? milestone.since && t('Since {date}', { date: monthYear(milestone.since) })
      : milestone.kind === 'best_month'
        ? t('{month} · before, {amount}', { month: monthName(milestone.month, now), amount: rupees(milestone.previousBestPaise) ?? '' })
        : monthName(milestone.month, now)

  return (
    <section aria-label={title} className="flex flex-col gap-2.5">
      <div className="gb-metal relative px-[18px] pt-4 pb-[18px]">
        <button type="button" onClick={() => setClosed(true)} aria-label={t('Close')} className="absolute top-1.5 right-1.5 grid size-11 place-items-center text-[#3a3a44]">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
            <path d="M6 6l12 12M18 6l-12 12" />
          </svg>
        </button>
        <p className="text-[10px] font-bold tracking-[0.12em] uppercase opacity-70">{garage}</p>
        <p className="mt-3.5">
          <span className="sr-only">{to}</span>
          <span aria-hidden className="gb-roll">
            <span>
              <b>{from}</b>
              <b>{to}</b>
            </span>
          </span>
        </p>
        <p className="mt-0.5 text-[15px] font-bold">{title}</p>
        {since && <p className="mt-3.5 text-[12px] opacity-70">{since}</p>}
      </div>
      {next && (
        <div className="gb-metal gb-metal--gold px-[18px] py-3.5">
          <p className="text-[10px] font-bold tracking-[0.12em] uppercase opacity-70">{t('Next')}</p>
          <p className="mt-1 text-[15px] font-bold">{next}</p>
        </div>
      )}
    </section>
  )
}

/** The number the card rolls from, and the one it settles on. */
function figures(milestone: Milestone): [string, string] {
  if (milestone.kind === 'customers') return [String(Math.max(0, milestone.value - 10)), String(milestone.value)]
  if (milestone.kind === 'lakh_month') return [`₹${Math.max(0, milestone.value - 1)}L`, `₹${milestone.value}L`]
  return [rupees(milestone.previousBestPaise) ?? '', rupees(milestone.takenPaise) ?? '']
}
