/** The five places of the floating nav, left to right. As apps/users/lib/hub-nav.ts. */
export type HubNavItem = 'home' | 'map' | 'new' | 'bookings' | 'profile';

export const HUB_NAV_HREF: Record<HubNavItem, string> = {
  home: '/home',
  map: '/map',
  new: '/garages',
  bookings: '/bookings',
  profile: '/profile',
};

const under = (pathname: string, route: string) => pathname === route || pathname.startsWith(`${route}/`);

/**
 * Which item is lit. /garages, the list the + opens, lights the + for a customer (the red
 * ring round the pearl, owner 22 Nov 2026) and Home for a guest, whose Home it is.
 * /search lights nothing.
 */
export function hubNavCurrent(pathname: string | null, { guest = false }: { guest?: boolean } = {}): HubNavItem | null {
  if (!pathname) return null;
  if (under(pathname, HUB_NAV_HREF.home)) return 'home';
  if (under(pathname, HUB_NAV_HREF.map)) return 'map';
  if (pathname === HUB_NAV_HREF.new) return guest ? 'home' : 'new';
  if (under(pathname, HUB_NAV_HREF.bookings)) return 'bookings';
  if (under(pathname, HUB_NAV_HREF.profile)) return 'profile';
  return null;
}
