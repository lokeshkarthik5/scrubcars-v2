'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  IconCalendar,
  IconHome,
  IconMap2,
  IconPlus,
  IconUser,
} from '@tabler/icons-react'
import { cn } from '@repo/core/utils'

const ITEMS = [
  { href: '/home', label: 'Home', icon: IconHome },
  { href: '/map', label: 'Map', icon: IconMap2 },
  { href: '/bookings', label: 'Bookings', icon: IconCalendar },
  { href: '/profile', label: 'Profile', icon: IconUser },
] as const

/**
 * The floating pill nav of the new Home: Home, Map, the white +, Bookings,
 * Profile. On Home only for now; the rest of the app keeps its flat bar
 * until the app-wide look ships (the next PR), behind the same flag.
 *
 * Search is not a tab any more (owner decision D9): it stays at /search, a
 * tap away from the garage list that + opens. The lit tab is white with one
 * 4px red dot under it, the bar's only red, as on the old bar.
 */
export function HubNav() {
  const pathname = usePathname()
  const [home, map, bookings, profile] = ITEMS

  const item = ({ href, label, icon: Icon }: (typeof ITEMS)[number]) => {
    const active = pathname === href || pathname.startsWith(`${href}/`)
    return (
      <Link
        key={href}
        href={href}
        aria-label={label}
        aria-current={active ? 'page' : undefined}
        className={cn(
          'relative grid size-11 place-items-center rounded-full transition-colors',
          active ? 'text-text-primary' : 'text-dim hover:text-text-primary'
        )}
      >
        <Icon size={21} stroke={1.5} aria-hidden />
        {active && (
          <span
            aria-hidden
            className="absolute bottom-0.5 left-1/2 size-1 -translate-x-1/2 rounded-full bg-brand-red"
          />
        )}
      </Link>
    )
  }

  return (
    <>
      {/* A scrim under the pill, so cards scrolling beneath it fade out
          rather than collide with it. */}
      <div
        aria-hidden
        className="pointer-events-none fixed bottom-0 left-1/2 z-30 h-24 w-full max-w-[428px] -translate-x-1/2 bg-gradient-to-b from-brand-black/0 to-brand-black"
      />
      <nav
        aria-label="Main"
        className="fixed left-1/2 z-40 flex h-[60px] w-[272px] -translate-x-1/2 items-center justify-between rounded-pill border border-line bg-[rgba(24,24,27,0.86)] px-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.05),0_18px_40px_-12px_rgba(0,0,0,0.7)] backdrop-blur-xl"
        style={{ bottom: 'calc(20px + env(safe-area-inset-bottom))' }}
      >
        {item(home)}
        {item(map)}
        {/* The list of garages, where every booking starts. White, not red:
            the screen's one red is its own main action. */}
        <Link
          href="/garages"
          aria-label="New booking"
          className="press grid size-11 place-items-center rounded-full bg-[#F5F5F6] text-brand-black shadow-[0_6px_16px_-8px_rgba(0,0,0,0.6)]"
        >
          <IconPlus size={20} stroke={1.75} aria-hidden />
        </Link>
        {item(bookings)}
        {item(profile)}
      </nav>
    </>
  )
}
