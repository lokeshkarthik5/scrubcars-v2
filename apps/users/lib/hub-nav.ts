/** The five places of the floating nav, left to right. */
export type HubNavItem = 'home' | 'map' | 'new' | 'bookings' | 'profile'

/** Where each item goes. + is the list of garages, where every booking starts. */
export const HUB_NAV_HREF: Record<HubNavItem, string> = {
  home: '/home',
  map: '/map',
  new: '/garages',
  bookings: '/bookings',
  profile: '/profile',
}

const under = (pathname: string, route: string) =>
  pathname === route || pathname.startsWith(`${route}/`)

/**
 * Which item of the floating nav is lit on a path, or null for none.
 *
 * Each tab lights on its own route and the screens under it (a booking lights
 * Bookings). The + never lights: it is an action, a white button that starts
 * a booking, and the approved nav has no lit state for it.
 *
 * /garages, the list, is the one place that depends on who is looking (the
 * spec's "none or Home"). A signed-in customer's Home is the hub, so a lit
 * Home on the list would point a screen reader at the wrong page, and the
 * list lights nothing. A visitor has no hub: /home sends them straight here,
 * so the list is their Home, and Home lights — otherwise the tab they just
 * tapped would light nowhere. `guest` is false until the session has been
 * checked, so a signed-in customer never sees Home flash lit on the list.
 *
 * /search lights nothing. It is a step off the list rather than a place of its
 * own (owner decision D9 took it out of the nav). /updates has no nav.
 */
export function hubNavCurrent(
  pathname: string | null,
  { guest = false }: { guest?: boolean } = {}
): HubNavItem | null {
  if (!pathname) return null
  if (under(pathname, HUB_NAV_HREF.home)) return 'home'
  if (under(pathname, HUB_NAV_HREF.map)) return 'map'
  if (pathname === HUB_NAV_HREF.new) return guest ? 'home' : null
  if (under(pathname, HUB_NAV_HREF.bookings)) return 'bookings'
  if (under(pathname, HUB_NAV_HREF.profile)) return 'profile'
  return null
}
