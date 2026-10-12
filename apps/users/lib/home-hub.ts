/**
 * Whether the new Home hub is switched on for this build.
 *
 * NEXT_PUBLIC_HOME_HUB is read at build time (Next inlines NEXT_PUBLIC_
 * variables into the bundle), so turning it on or off means a redeploy, not a
 * restart. Only the exact value 'on' turns it on: unset, empty, a typo or
 * 'true' all leave the old Home in place, because a production build that
 * quietly flipped to an unfinished screen is the mistake worth guarding
 * against. It stays off in production until the owner signs off the new look.
 *
 * Read by /home (the hub, or the garage list as before) and by the hub look
 * elsewhere: CustomerShell's floating nav on every customer screen with a nav
 * and on the map, MainAction (the red pill on a screen's one main action,
 * including the add-address sheet's Save address), the add-car sheet's Save
 * car, the garage page's graphite Add buttons, and the large titles on
 * Bookings and Profile.
 */
export function isHomeHubEnabled(
  value: string | undefined = process.env.NEXT_PUBLIC_HOME_HUB
): boolean {
  return value === 'on'
}

/**
 * Where the car-care tip's × is kept on the phone: the IST day it was closed
 * on, so the tip is back the next day. The privacy policy's storage table
 * names this key (lib/legal/privacy.ts, checked by legal-docs.test.ts).
 */
export const TIP_HIDDEN_KEY = 'detlio:tip-hidden-on'
