'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useIsVendorAdmin } from '@repo/core/hooks/use-vendor-role'
import { cn } from '@repo/core/utils'
import { garageNavItems } from './bottom-nav'

/**
 * The garage's bottom bar in the customer app's look (owner, 10 Nov 2026:
 * "Yes, restyle them"; mockups garage-calendar A and B): the floating glass
 * pill of apps/users' HubNav, with the garage's own tabs — Home, Bookings,
 * Services, Earnings, Settings, or Home and Bookings for an operator (see
 * garageNavItems) — in the same order and to the same places as the flat bar
 * it replaces. AppShell draws it for navType="vendor".
 *
 * The tab you are on sits in the graphite orb with its ring of light, the
 * others are brushed silver, each with its label under it (T5, 11/500, the
 * current one 600). The orb pops in once when the tab is reached and never
 * turns; there is no motion under reduced motion. No pearl +: the garage has
 * no action that belongs in the bar. The look is finish.css's `hub-*` and
 * `fx-*` classes, the customer bar's own copy, so the two cannot drift.
 * Every item is at least 44pt, and the lit one says so with aria-current,
 * since the light alone says nothing to a screen reader.
 */
export function GarageNav() {
  const pathname = usePathname()
  const isVendorAdmin = useIsVendorAdmin()
  const items = garageNavItems(isVendorAdmin)

  return (
    <>
      {/* The fade under the pill, so a list scrolling beneath it fades out
          rather than collides with it. */}
      <div
        aria-hidden
        className="pointer-events-none fixed bottom-0 left-1/2 z-30 h-24 w-full max-w-[428px] -translate-x-1/2 bg-gradient-to-b from-brand-black/0 to-brand-black"
      />
      {/* The brushed metal the tab icons are drawn in (hub-tab in
          finish.css strokes with it), in the icons' own 24-unit grid, as
          the customer bar draws it. */}
      <svg width="0" height="0" aria-hidden="true" className="absolute">
        <defs>
          <linearGradient id="hub-metal" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2="24">
            <stop offset="0" stopColor="#ffffff" />
            <stop offset=".55" stopColor="#d9d9de" />
            <stop offset="1" stopColor="#9c9ca6" />
          </linearGradient>
        </defs>
      </svg>
      <nav
        aria-label="Main"
        className="fx-glass fixed left-1/2 z-40 grid h-16 -translate-x-1/2 items-center rounded-pill px-2"
        style={{
          bottom: 'calc(20px + env(safe-area-inset-bottom))',
          // Five tabs fill the column as the mockup draws them (16 in from
          // each side); an operator's two sit in a shorter pill rather than
          // far apart in a long one.
          width: `min(${items.length * 76 + 16}px, calc(100% - 32px))`,
          gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))`,
        }}
      >
        {items.map(({ href, label, icon: Icon, alsoActiveOn = [] }) => {
          // A lit tab links to the route that lit it, as the flat bar did.
          const matched = [href, ...alsoActiveOn].find(
            (route) => pathname === route || pathname.startsWith(`${route}/`)
          )
          const active = matched !== undefined
          return (
            <Link
              key={href}
              href={matched ?? href}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'hub-tab flex min-h-12 min-w-0 flex-col items-center justify-center gap-0.5 rounded-[14px]',
                active ? 'hub-tab--on text-text-primary' : 'text-[#B4B4BC] hover:text-text-primary'
              )}
            >
              {active ? (
                <span aria-hidden="true" className="hub-orb fx-pop">
                  <span className="hub-orb__bloom" />
                  <span className="hub-orb__well" />
                  <span className="hub-orb__ring" />
                  <Icon size={17} className="relative" />
                </span>
              ) : (
                <Icon size={21} aria-hidden />
              )}
              <span className={cn('text-t5 leading-none', active ? 'font-semibold' : 'font-medium')}>
                {label}
              </span>
            </Link>
          )
        })}
      </nav>
    </>
  )
}
