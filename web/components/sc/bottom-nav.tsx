'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  IconCalendar,
  IconChartBar,
  IconHome,
  IconSearch,
  IconSettings,
  IconTool,
  IconUser,
} from '@tabler/icons-react'
import { cn } from '@/lib/utils'

type NavType = 'customer' | 'vendor'

const customerItems = [
  { href: '/home', label: 'Home', icon: IconHome },
  { href: '/search', label: 'Search', icon: IconSearch },
  { href: '/bookings', label: 'Bookings', icon: IconCalendar },
  { href: '/profile', label: 'Profile', icon: IconUser },
]

const vendorItems = [
  { href: '/vendor/home', label: 'Home', icon: IconHome },
  { href: '/vendor/bookings', label: 'Bookings', icon: IconCalendar },
  { href: '/vendor/services', label: 'Services', icon: IconTool },
  { href: '/vendor/earnings', label: 'Earnings', icon: IconChartBar },
  { href: '/vendor/settings', label: 'Settings', icon: IconSettings },
]

export function BottomNav({ type = 'customer' }: { type?: NavType }) {
  const pathname = usePathname()
  const items = type === 'vendor' ? vendorItems : customerItems

  return (
    <nav className="fixed bottom-0 left-1/2 z-40 w-full max-w-[428px] -translate-x-1/2 border-t border-border bg-surface">
      <div className="flex items-center justify-around px-2 py-2 pb-[max(8px,env(safe-area-inset-bottom))]">
        {items.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(`${href}/`)
          return (
            <Link
              key={href}
              href={href}
              className="flex flex-1 flex-col items-center gap-0.5 py-1"
            >
              <Icon
                size={22}
                stroke={1.5}
                className={cn(active ? 'text-brand-red' : 'text-text-muted')}
              />
              <span
                className={cn(
                  'text-[10px] font-medium',
                  active ? 'text-brand-red' : 'text-text-muted'
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
