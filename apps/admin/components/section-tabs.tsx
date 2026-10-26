'use client'

import Link from 'next/link'
import { cn } from '@repo/core/utils'

export interface SectionTab {
  href: string
  label: string
  active: boolean
}

/**
 * The tabs under a page's title for its sub-pages (Issues: Complaints · Redo
 * claims · Bypass reports). Links with aria-current, not Radix tabs: each is
 * its own address. On a phone the row scrolls inside itself rather than
 * pushing the whole page sideways (quick win 2).
 */
export function SectionTabs({
  label,
  tabs,
}: {
  label: string
  tabs: SectionTab[]
}) {
  return (
    <nav
      aria-label={label}
      className="-mx-4 overflow-x-auto px-4 [scrollbar-width:none] md:mx-0 md:px-0 [&::-webkit-scrollbar]:hidden"
    >
      <div className="flex w-max gap-0.5 rounded-[12px] bg-surface p-1">
        {tabs.map((tab) => (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={tab.active ? 'page' : undefined}
            className={cn(
              'flex min-h-11 shrink-0 items-center justify-center whitespace-nowrap rounded-[8px] px-4 text-[13px] font-medium transition-colors',
              tab.active
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
