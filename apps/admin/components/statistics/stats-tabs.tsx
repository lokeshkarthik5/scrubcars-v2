'use client'

import Link from 'next/link'
import { cn } from '@repo/core/utils'

export const STATS_TABS = [
  { value: 'overview', label: 'Overview' },
  { value: 'breakdown', label: 'Breakdown' },
  { value: 'commission', label: 'Commission' },
] as const

export type StatsTab = (typeof STATS_TABS)[number]['value']

export function isStatsTab(value: string | null): value is StatsTab {
  return STATS_TABS.some((tab) => tab.value === value)
}

/**
 * "Overview · Breakdown · Commission". Each is its own view with its own
 * address (?tab=), so a link opens on the tab it was copied from: links with
 * aria-current, drawn as the Discounts page's Codes · Notices are, rather than
 * Radix tabs, which promise panels already on the page.
 */
export function StatsTabs({
  current,
  hrefFor,
}: {
  current: StatsTab
  hrefFor: (tab: StatsTab) => string
}) {
  return (
    <nav
      aria-label="Statistics sections"
      className="flex w-full gap-0.5 rounded-[12px] bg-surface p-1 sm:w-fit"
    >
      {STATS_TABS.map((tab) => (
        <Link
          key={tab.value}
          href={hrefFor(tab.value)}
          scroll={false}
          aria-current={current === tab.value ? 'page' : undefined}
          className={cn(
            'flex min-h-11 flex-1 items-center justify-center rounded-[9px] px-5 text-[13px] font-medium transition-colors sm:flex-none',
            current === tab.value
              ? 'bg-surface-elevated text-text-primary shadow-sm'
              : 'text-text-secondary hover:text-text-primary'
          )}
        >
          {tab.label}
        </Link>
      ))}
    </nav>
  )
}
