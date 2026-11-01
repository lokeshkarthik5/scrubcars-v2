/**
 * Codes in these links are secrets: a coupon, a gift, an invite. The rest of the app
 * must never see the URL, so they are lifted out here and the app goes on without them.
 */
const SECRET_LINK = /^\/(c|gift|invite)\/([^/?#]+)/;

export type HeldCode = { kind: 'c' | 'gift' | 'invite'; code: string };

let held: HeldCode | null = null;

/** In memory only. The coupon, gift and invite screens (stage 3) take it from here. */
export const heldLinkCode = {
  take: () => {
    const code = held;
    held = null;
    return code;
  },
};

/**
 * What the phone hands over: the web's address, the app's scheme, or Expo Go's
 * exp://host/--/path. Runs before the app has started and on anything, so it never
 * throws.
 */
export function rewriteSystemPath(path: string): string {
  try {
    const url = new URL(path, 'detlio://app');
    const scheme = url.protocol === 'detlio:';
    // detlio://bookings?x has "bookings" as its host; a web link has a real one.
    const host = scheme && url.host && url.host !== 'app' ? `/${url.host}` : '';
    const route = url.pathname.replace(/^\/--(?=\/|$)/, '').replace(/^\/+/, '/') || '/';
    const pathname = `${host}${route === '/' && host ? '' : route}` || '/';
    const secret = pathname.match(SECRET_LINK);
    if (secret) {
      held = { kind: secret[1] as HeldCode['kind'], code: decodeURIComponent(secret[2]) };
      return '/';
    }
    return `${pathname}${url.search}`;
  } catch {
    return '/';
  }
}
