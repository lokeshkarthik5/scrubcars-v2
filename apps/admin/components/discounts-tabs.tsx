'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@repo/core/utils'

const TABS = [
  { href: '/discounts', label: 'Codes' },
  // Printed coupons with QR codes (0056).
  { href: '/discounts/coupons', label: 'Coupons' },
  { href: '/discounts/notices', label: 'Notices' },
] as const

/**
 * "Codes · Coupons · Notices": team notices live under Discounts (owner decision D8)
 * rather than as a sixth item in the panel's menu. Two pages, so links
 * (with aria-current), not Radix tabs, which promise panels on one page.
 * Drawn as the header menu is, so it reads as the same kind of control.
 */
export function DiscountsTabs() {
  const pathname = usePathname()
  const current = pathname.startsWith('/discounts/notices')
    ? '/discounts/notices'
    : pathname.startsWith('/discounts/coupons')
      ? '/discounts/coupons'
      : '/discounts'

  return (
    <nav
      aria-label="Offers sections"
      // Scrolls inside itself on a phone, never the page (quick win 2).
      className="-mx-4 overflow-x-auto px-4 [scrollbar-width:none] sm:mx-0 sm:px-0 [&::-webkit-scrollbar]:hidden"
    >
      <div className="flex w-max min-w-full gap-0.5 rounded-[12px] bg-surface p-1 sm:min-w-0">
        {TABS.map((tab) => (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={current === tab.href ? 'page' : undefined}
            className={cn(
              'flex min-h-11 flex-1 shrink-0 items-center justify-center whitespace-nowrap rounded-[8px] px-4 text-[13px] font-medium transition-colors sm:flex-none sm:px-5',
              current === tab.href
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
