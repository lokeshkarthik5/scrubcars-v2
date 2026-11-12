'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { IconCalendar, IconHome, IconLayoutGrid, IconPlus, IconUsers } from '@tabler/icons-react'
import { msg, useT } from '@repo/core/i18n'
import { cn } from '@repo/core/utils'
import { LitOrb, MetalGradient } from '@repo/ui/finish/lit-orb'

type Place = 'home' | 'jobs' | 'customers' | 'business'

const TABS = [
  { place: 'home', label: msg('Home'), href: '/home', icon: IconHome },
  { place: 'jobs', label: msg('Jobs'), href: '/book/jobs', icon: IconCalendar },
  { place: 'customers', label: msg('Customers'), href: '/book/customers', icon: IconUsers },
  { place: 'business', label: msg('Business'), href: '/book/business', icon: IconLayoutGrid },
] as const

const under = (path: string, route: string) => path === route || path.startsWith(`${route}/`)

/** Which tab is lit on a path. Today's Services, Earnings and Settings now live under Business. */
export function bookPlace(path: string | null): Place | null {
  if (!path) return null
  if (under(path, '/home')) return 'home'
  if (under(path, '/book/jobs') || under(path, '/bookings')) return 'jobs'
  if (under(path, '/book/customers') || under(path, '/book/reminders')) return 'customers'
  if (
    ['/book/business', '/book/stats', '/book/owed', '/book/team', '/book/expenses', '/book/bill', '/book/link', '/book/payments', '/book/import', '/book/stock', '/services', '/earnings', '/settings', '/reviews', '/photos', '/requests', '/guarantee', '/agreement', '/account'].some(
      (route) => under(path, route)
    )
  ) {
    return 'business'
  }
  return null
}

/**
 * Garage Book's bar (SPEC.md decision 2): Home · Jobs · + · Customers ·
 * Business, a glass pill. The tab you are on sits in the graphite orb with
 * its ring of light (F); the others are brushed silver (H); the pearl +
 * adds a walk-in. The same bar as the customer app's HubNav, the same parts.
 */
export function BookNav() {
  const t = useT()
  const pathname = usePathname()
  const current = bookPlace(pathname)
  const [home, jobs, customers, business] = TABS

  const tab = ({ place, label, href, icon: Icon }: (typeof TABS)[number]) => {
    const active = current === place
    return (
      <Link
        key={place}
        href={href}
        aria-label={t(label)}
        aria-current={active ? 'page' : undefined}
        className={cn(
          'hub-tab flex min-h-12 min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-[14px]',
          active ? 'hub-tab--on text-text-primary' : 'text-[#B4B4BC] hover:text-text-primary'
        )}
      >
        {active ? <LitOrb icon={Icon} /> : <Icon size={21} aria-hidden />}
        {/* A longer Tamil word ends in an ellipsis inside its tab, clipped sideways
            only so its tall marks are never cut (GarageNav does the same). */}
        <span
          className={cn(
            'min-w-0 max-w-full overflow-x-clip text-ellipsis whitespace-nowrap px-0.5 text-t5 leading-none',
            active ? 'font-semibold' : 'font-medium'
          )}
        >
          {t(label)}
        </span>
      </Link>
    )
  }

  return (
    <div className="gb-nav">
      <div
        aria-hidden
        className="pointer-events-none fixed bottom-0 left-1/2 z-30 h-24 w-full max-w-[428px] -translate-x-1/2 bg-gradient-to-b from-brand-black/0 to-brand-black"
      />
      <MetalGradient />
      <nav
        aria-label={t('Garage app')}
        className="fx-glass fixed left-1/2 z-40 flex h-16 w-[min(340px,calc(100%-32px))] -translate-x-1/2 items-center justify-between rounded-pill px-2.5"
        style={{ bottom: 'calc(20px + env(safe-area-inset-bottom))' }}
      >
        {tab(home)}
        {tab(jobs)}
        {/* Adds a walk-in. Pearl, not red: a screen's one red is its own main action. */}
        <Link href="/book/new" aria-label={t('Add a walk-in job')} className="fx-pearl fx-press grid size-12 shrink-0 place-items-center rounded-full">
          <IconPlus size={20} stroke={2.1} aria-hidden />
        </Link>
        {tab(customers)}
        {tab(business)}
      </nav>
    </div>
  )
}
