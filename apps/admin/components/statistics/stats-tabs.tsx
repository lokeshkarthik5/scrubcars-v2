'use client'

import Link from 'next/link'
import { cn } from '@repo/core/utils'

export const STATS_TABS = [
  { value: 'overview', label: 'Overview' },
  { value: 'breakdown', label: 'Breakdown' },
  { value: 'commission', label: 'Commission' },
  { value: 'funnel', label: 'Funnel' },
  { value: 'behaviour', label: 'Behaviour' },
] as const

export type StatsTab = (typeof STATS_TABS)[number]['value']

export function isStatsTab(value: string | null): value is StatsTab {
  return STATS_TABS.some((tab) => tab.value === value)
}

/**
 * "Overview · Breakdown · Commission · Funnel · Behaviour". Each is its own view with its own
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
      // Scrolls inside itself on a phone, never the page (quick win 2).
      className="-mx-4 overflow-x-auto px-4 [scrollbar-width:none] sm:mx-0 sm:px-0 [&::-webkit-scrollbar]:hidden"
    >
      <div className="flex w-max min-w-full gap-0.5 rounded-[12px] bg-surface p-1 sm:min-w-0">
        {STATS_TABS.map((tab) => (
          <Link
            key={tab.value}
            href={hrefFor(tab.value)}
            scroll={false}
            aria-current={current === tab.value ? 'page' : undefined}
            className={cn(
              'flex min-h-11 flex-1 shrink-0 items-center justify-center whitespace-nowrap rounded-[8px] px-4 text-[13px] font-medium transition-colors sm:flex-none sm:px-5',
              current === tab.value
                ? 'bg-surface-elevated text-text-primary shadow-sm'
                : 'text-text-secondary hover:text-text-primary'
            )}
          >
            {tab.label}
          </Link>
        ))}
      </div>
    </nav>
  )
}
