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
 * Nothing reads it yet. /home renders the garage list either way until the
 * hub itself lands.
 */
export function isHomeHubEnabled(
  value: string | undefined = process.env.NEXT_PUBLIC_HOME_HUB
): boolean {
  return value === 'on'
}
