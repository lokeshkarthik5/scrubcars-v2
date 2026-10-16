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
import { useAuthStore } from '@repo/core/stores/auth-store'
import { cn } from '@repo/core/utils'
import { HUB_NAV_HREF, hubNavCurrent, type HubNavItem } from '@/lib/hub-nav'

const TABS = [
  { item: 'home', label: 'Home', icon: IconHome },
  { item: 'map', label: 'Map', icon: IconMap2 },
  { item: 'bookings', label: 'Bookings', icon: IconCalendar },
  { item: 'profile', label: 'Profile', icon: IconUser },
] as const satisfies ReadonlyArray<{ item: HubNavItem; label: string; icon: unknown }>

/** The lit item's mark: one 4px red dot, the bar's only red, as on the old bar. */
function LitDot() {
  return (
    <span
      aria-hidden
      className="absolute bottom-0.5 left-1/2 size-1 -translate-x-1/2 rounded-full bg-brand-red"
    />
  )
}

/**
 * The floating pill nav of the Home hub look: Home, Map, the white +,
 * Bookings, Profile. Behind NEXT_PUBLIC_HOME_HUB, on every customer screen
 * that shows a nav (CustomerShell, and the map, which draws its own), in
 * place of the flat bar.
 *
 * Search is not a tab any more (owner decision D9): it stays at /search, a
 * tap away from the garage list that + opens. Which item is lit, and why
 * /garages lights Home for a visitor and nothing for a customer, is
 * lib/hub-nav.ts. Every item is
 * a 44pt target, and the lit one says so with aria-current, since the colour
 * alone says nothing to a screen reader.
 */
export function HubNav({
  scrim = true,
}: {
  /**
   * The fade under the pill, so content scrolling beneath it fades out
   * rather than collides with it. Off on the map, where nothing scrolls under
   * it and a dark band would only hide the streets.
   */
  scrim?: boolean
}) {
  const pathname = usePathname()
  // A visitor only once the session has been checked: until then nobody is
  // known to be signed out (see hubNavCurrent).
  const guest = useAuthStore((s) => s.isSessionReady && !s.user)
  const current = hubNavCurrent(pathname, { guest })
  const [home, map, bookings, profile] = TABS

  const tab = ({ item, label, icon: Icon }: (typeof TABS)[number]) => {
    const active = current === item
    return (
      <Link
        key={item}
        href={HUB_NAV_HREF[item]}
        aria-label={label}
        aria-current={active ? 'page' : undefined}
        className={cn(
          'relative grid size-11 place-items-center rounded-full transition-colors',
          active ? 'text-text-primary' : 'text-dim hover:text-text-primary'
        )}
      >
        <Icon size={21} stroke={1.5} aria-hidden />
        {active && <LitDot />}
      </Link>
    )
  }

  return (
    <>
      {scrim && (
        <div
          aria-hidden
          className="pointer-events-none fixed bottom-0 left-1/2 z-30 h-24 w-full max-w-[428px] -translate-x-1/2 bg-gradient-to-b from-brand-black/0 to-brand-black"
        />
      )}
      <nav
        aria-label="Main"
        className="fixed left-1/2 z-40 flex h-[60px] w-[272px] -translate-x-1/2 items-center justify-between rounded-pill border border-line bg-[rgba(24,24,27,0.86)] px-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.05),0_18px_40px_-12px_rgba(0,0,0,0.7)] backdrop-blur-xl"
        style={{ bottom: 'calc(20px + env(safe-area-inset-bottom))' }}
      >
        {tab(home)}
        {tab(map)}
        {/* The list of garages, where every booking starts. White, not red:
            the screen's one red is its own main action. An action, not a
            place, so it is never lit. */}
        <Link
          href={HUB_NAV_HREF.new}
          aria-label="New booking"
          className="press grid size-11 place-items-center rounded-full bg-[#F5F5F6] text-brand-black shadow-[0_6px_16px_-8px_rgba(0,0,0,0.6)]"
        >
          <IconPlus size={20} stroke={1.75} aria-hidden />
        </Link>
        {tab(bookings)}
        {tab(profile)}
      </nav>
    </>
  )
}
