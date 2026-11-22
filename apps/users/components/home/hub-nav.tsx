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
import { LitHalo, LitOrb, MetalGradient } from '@repo/ui/finish/lit-orb'
import { HUB_NAV_HREF, hubNavCurrent, type HubNavItem } from '@/lib/hub-nav'
import { msg, useT } from '@repo/core/i18n'

const TABS = [
  { item: 'home', label: msg('Home'), icon: IconHome },
  { item: 'map', label: msg('Map'), icon: IconMap2 },
  { item: 'bookings', label: msg('Bookings'), icon: IconCalendar },
  { item: 'profile', label: msg('Profile'), icon: IconUser },
] as const satisfies ReadonlyArray<{
  item: HubNavItem
  label: string
  icon: unknown
}>

/**
 * The floating pill nav of the Home hub look: Home, Map, the pearl +,
 * Bookings, Profile, each with its label. Behind NEXT_PUBLIC_HOME_HUB, on
 * every customer screen that shows a nav (CustomerShell, and the map, which
 * draws its own), in place of the flat bar.
 *
 * The approved F + H look (customer UI round, Nov 2026, red-glow mockup):
 * the tab you are on sits in a graphite orb with a ring of light, the other
 * icons are brushed silver, the + is pearl, all on a glass bar. The orb
 * pops in when the tab is reached and its ring of light turns while the tab
 * is lit, the one loop the finish allows (still under reduced motion). On the
 * list of garages the + opens, the same ring turns round the pearl (owner,
 * 22 Nov 2026), so you can see where you are; one item at most is lit.
 *
 * Search is not a tab any more (owner decision D9): it stays at /search, a
 * tap away from the garage list that + opens. Which item is lit, and why
 * /garages lights Home for a visitor and nothing for a customer, is
 * lib/hub-nav.ts. Every item is a 44pt target, and the lit one says so with
 * aria-current, since the light alone says nothing to a screen reader.
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
  const t = useT()
  const pathname = usePathname()
  // A visitor only once the session has been checked: until then nobody is
  // known to be signed out (see hubNavCurrent).
  const guest = useAuthStore((s) => s.isSessionReady && !s.user)
  const current = hubNavCurrent(pathname, { guest })
  const [home, map, bookings, profile] = TABS

  const tab = ({ item, label, icon: Icon }: (typeof TABS)[number]) => {
    const active = current === item
    return (
      // A label under every icon (F11), in the type scale's tab size (T5,
      // 11/500, the current one 600).
      <Link
        key={item}
        href={HUB_NAV_HREF[item]}
        aria-label={t(label)}
        aria-current={active ? 'page' : undefined}
        className={cn(
          'hub-tab flex min-h-12 min-w-[52px] flex-col items-center justify-center gap-0.5 rounded-[14px]',
          active ? 'hub-tab--on text-text-primary' : 'text-[#B4B4BC] hover:text-text-primary'
        )}
      >
        {active ? (
          <LitOrb icon={Icon} />
        ) : (
          <Icon size={21} aria-hidden />
        )}
        {/* Tamil's labels are longer: a size smaller, on one line, so the
            four tabs and the pearl button still fit the bar. */}
        <span
          className={cn(
            'whitespace-nowrap text-center text-t5 leading-none [:lang(ta)_&]:text-[10px]',
            active ? 'font-semibold' : 'font-medium'
          )}
        >
          {t(label)}
        </span>
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
      {/* The brushed metal every tab icon is drawn in (hub-tab in
          globals.css strokes with it). Drawn in the icons' own 24-unit
          grid, not each path's box: a straight line has a box with no
          width or height, and a box-sized gradient paints nothing on it,
          which would wipe out the calendar's rings and the map's folds. */}
      <MetalGradient />
      <nav
        aria-label={t('Main')}
        className="fx-glass fixed left-1/2 z-40 flex h-16 w-[min(340px,calc(100%-32px))] -translate-x-1/2 items-center justify-between rounded-pill px-3"
        style={{ bottom: 'calc(20px + env(safe-area-inset-bottom))' }}
      >
        {tab(home)}
        {tab(map)}
        {/* The list of garages, where every booking starts. Pearl, not red:
            the screen's one red is its own main action. On that list it is
            the item you are on, so the tabs' ring of light turns round it. */}
        <Link
          href={HUB_NAV_HREF.new}
          aria-label={t('New booking')}
          aria-current={current === 'new' ? 'page' : undefined}
          className="fx-pearl fx-press relative grid size-12 place-items-center rounded-full"
        >
          {current === 'new' && <LitHalo />}
          <IconPlus size={20} aria-hidden />
        </Link>
        {tab(bookings)}
        {tab(profile)}
      </nav>
    </>
  )
}
