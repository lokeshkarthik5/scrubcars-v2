import { safeNextPath } from '@repo/core/redirect';

/**
 * The web's addresses name an item after a `#`: `#job-<id>` on Bookings,
 * `#claim-<id>` on the free redo claims, `#request-<id>` and `#repair-<id>` on Requests.
 */
const HASH_TARGETS = [
  ['#job-', 'job'],
  ['#claim-', 'claim'],
  ['#request-', 'request'],
  // A repair quote's card on Requests (0075).
  ['#repair-', 'repair'],
] as const;

/**
 * A push or a link says `/bookings?tab=incoming#job-<id>`, on the web's address
 * or the app's scheme. The router drops the `#job-…`, so it travels as `job=`
 * (`claim=` and `request=` likewise). Runs before the app has started and on anything the phone hands over, so it
 * never throws.
 */
export function rewriteSystemPath(path: string): string {
  try {
    const url = new URL(path, 'detliogarages://app');
    const scheme = url.protocol === 'detliogarages:';
    // detliogarages://bookings?x has "bookings" as its host; a web link has a real one.
    const host = scheme && url.host && url.host !== 'app' ? `/${url.host}` : '';
    // Expo Go's own links say exp://host/--/bookings.
    const route = url.pathname.replace(/^\/--(?=\/|$)/, '').replace(/^\/+/, '/') || '/';
    const pathname = `${host}${route === '/' && host ? '' : route}` || '/';
    const params = new URLSearchParams(url.search);
    for (const [prefix, name] of HASH_TARGETS) {
      if (!url.hash.startsWith(prefix)) continue;
      const id = url.hash.slice(prefix.length);
      if (id) params.set(name, id);
    }
    const query = params.toString();
    return `${pathname}${query ? `?${query}` : ''}`;
  } catch {
    return '/';
  }
}

/** Where to go after signing in, when a link was opened signed out. */
export function afterSignIn(next: string | null, landing: string): string {
  return safeNextPath(next) ?? landing;
}
