import { safeNextPath } from '@repo/core/redirect';

/**
 * A push or a link says `/bookings?tab=incoming#job-<id>`, on the web's address
 * or the app's scheme. The router drops the `#job-…`, so it travels as `job=`.
 * Runs before the app has started and on anything the phone hands over, so it
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
    if (url.hash.startsWith('#job-')) {
      const id = url.hash.slice('#job-'.length);
      if (id) params.set('job', id);
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
