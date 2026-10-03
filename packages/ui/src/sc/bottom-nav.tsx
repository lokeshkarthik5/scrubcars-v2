'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  IconBuildingStore,
  IconCalendar,
  IconChartBar,
  IconHome,
  IconSearch,
  IconSettings,
  IconTool,
  IconUser,
} from '@tabler/icons-react'
import { useIsVendorAdmin } from '@repo/core/hooks/use-vendor-role'
import { cn } from '@repo/core/utils'

export type NavType = 'customer' | 'vendor' | 'admin'

const customerItems = [
  { href: '/home', label: 'Home', icon: IconHome },
  { href: '/search', label: 'Search', icon: IconSearch },
  { href: '/bookings', label: 'Bookings', icon: IconCalendar },
  { href: '/profile', label: 'Profile', icon: IconUser },
]

const vendorItems = [
  { href: '/home', label: 'Home', icon: IconHome },
  { href: '/bookings', label: 'Bookings', icon: IconCalendar },
  { href: '/services', label: 'Services', icon: IconTool },
  { href: '/earnings', label: 'Earnings', icon: IconChartBar },
  { href: '/settings', label: 'Settings', icon: IconSettings },
]

const adminItems = [
  { href: '/vendors', label: 'Vendors', icon: IconBuildingStore },
  { href: '/bookings', label: 'Bookings', icon: IconCalendar },
]

const itemsByType: Record<NavType, typeof customerItems> = {
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
        {items.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(`${href}/`)
          return (
            <Link
              key={href}
              href={href}
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
