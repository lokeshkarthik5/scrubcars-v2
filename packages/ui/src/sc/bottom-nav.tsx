'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  IconBuildingStore,
  IconCalendar,
  IconChartBar,
  IconDiscount2,
  IconHome,
  IconMap,
  IconReceiptRefund,
  IconSearch,
  IconSettings,
  IconTool,
  IconUser,
} from '@tabler/icons-react'
import { useIsVendorAdmin } from '@repo/core/hooks/use-vendor-role'
import { cn } from '@repo/core/utils'

export type NavType = 'customer' | 'vendor' | 'admin'

type NavItem = {
  href: string
  label: string
  icon: typeof IconHome
  /** Other routes this tab stands for, so it stays lit on them too. */
  alsoActiveOn?: string[]
}

const customerItems: NavItem[] = [
  // The garage list moved to /garages but is still what Home shows, so a
  // customer sent there ("Find another garage", the map's List) sees the same
  // tab lit as on /home, and tapping it there stays on /garages (see below).
  // Drop it once the new Home gives the list its own way in.
  { href: '/home', label: 'Home', icon: IconHome, alsoActiveOn: ['/garages'] },
  { href: '/search', label: 'Search', icon: IconSearch },
  { href: '/bookings', label: 'Bookings', icon: IconCalendar },
  { href: '/profile', label: 'Profile', icon: IconUser },
]

const vendorItems: NavItem[] = [
  { href: '/home', label: 'Home', icon: IconHome },
  { href: '/bookings', label: 'Bookings', icon: IconCalendar },
  { href: '/services', label: 'Services', icon: IconTool },
  { href: '/earnings', label: 'Earnings', icon: IconChartBar },
  { href: '/settings', label: 'Settings', icon: IconSettings },
]

// On a phone this is the admin's only menu (PanelShell hides the header nav
// below md), so every page the header offers is here too — Discounts and
// Coverage were header-only, and so out of reach on a phone. Refunds
// especially: a checkout that became no booking has no booking page, so this
// is the only way to the place its refund is marked done.
const adminItems: NavItem[] = [
  { href: '/vendors', label: 'Vendors', icon: IconBuildingStore },
  { href: '/bookings', label: 'Bookings', icon: IconCalendar },
  { href: '/refunds', label: 'Refunds', icon: IconReceiptRefund },
  { href: '/discounts', label: 'Discounts', icon: IconDiscount2 },
  { href: '/coverage', label: 'Coverage', icon: IconMap },
]

const itemsByType: Record<NavType, NavItem[]> = {
  customer: customerItems,
  vendor: vendorItems,
  admin: adminItems,
}

export function BottomNav({ type = 'customer' }: { type?: NavType }) {
  const pathname = usePathname()
  const isVendorAdmin = useIsVendorAdmin()
  // An operator's nav is Home and Bookings — jobs, which is their whole job.
  // Earnings is money, and Services and Settings are catalogue and
  // configuration; every endpoint behind those three is vendor_admin-only, so
  // leaving the tabs visible would only put a 403 in front of someone trying to
  // work. Hiding them is convenience, not the boundary.
  const OPERATOR_HIDDEN = [
    '/earnings',
    '/services',
    '/settings',
  ]

  const items =
    type === 'vendor' && !isVendorAdmin
      ? vendorItems.filter((item) => !OPERATOR_HIDDEN.includes(item.href))
      : itemsByType[type]

  return (
    <nav className="fixed bottom-0 left-1/2 z-40 w-full max-w-[428px] -translate-x-1/2 border-t border-border bg-surface">
      <div className="flex items-center justify-around px-2 py-2 pb-[max(8px,env(safe-area-inset-bottom))]">
        {items.map(({ href, label, icon: Icon, alsoActiveOn = [] }) => {
          // A lit tab links to the route that lit it. Tapping the current
          // tab should leave the customer where they are; sending /garages to
          // /home would remount the list and drop their mode, category and
          // sort, and "current page" would be untrue for a screen reader.
          const matched = [href, ...alsoActiveOn].find(
            (route) => pathname === route || pathname.startsWith(`${route}/`)
          )
          const active = matched !== undefined
          return (
            <Link
              key={href}
              href={matched ?? href}
              // The colour change alone says nothing to a screen reader.
              aria-current={active ? 'page' : undefined}
              className="relative flex flex-1 flex-col items-center gap-0.5 py-1"
            >
              {/* The current tab is white, and the bar's only red is this one
                  4px dot above it — a focal point, per the brand, rather than
                  a red icon and label sitting under every red button on the
                  screen above. */}
              {active && (
                <span
                  aria-hidden="true"
                  className="absolute -top-1 h-1 w-1 rounded-full bg-brand-red"
                />
              )}
              <Icon
                size={22}
                stroke={active ? 2 : 1.5}
                className={cn(active ? 'text-text-primary' : 'text-text-muted')}
              />
              <span
                className={cn(
                  'text-[10px] font-medium',
                  active ? 'text-text-primary' : 'text-text-muted'
                )}
              >
                {label}
              </span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
