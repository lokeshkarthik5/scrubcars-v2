/**
 * Lets something through at most once per interval: the first call says yes,
 * then every call says no until the interval has passed.
 *
 * For alerts about a condition rather than an event. When the SMS provider is
 * down, every login attempt fails the same way, and one message to the team
 * says everything a hundred would. Kept in memory, so the limit is per server
 * instance: on Vercel a few warm instances may each send one, which is still
 * a handful rather than a flood, and needs no table.
 */
export function createThrottle(intervalMs: number): (now?: number) => boolean {
  let last = -Infinity
  return (now = Date.now()) => {
    if (now - last < intervalMs) return false
    last = now
    return true
  }
}
