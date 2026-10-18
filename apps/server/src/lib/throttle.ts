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

/**
 * Lets each key through at most `limit` times per window, counted from that
 * key's first call in the window. Answers how many seconds until the key may
 * go again when it may not.
 *
 * For things that cost money per call, like the admin's AI pictures (about ₹4
 * each), where a stuck button or a script should hit a wall rather than a
 * bill. Kept in memory like createThrottle, so the limit is per server
 * instance: a few warm instances on Vercel each allow their own count, which
 * still bounds the spend.
 */
export function createKeyedLimit(
  limit: number,
  windowMs: number
): (key: string, now?: number) => { ok: true } | { ok: false; retryAfterSeconds: number } {
  const windows = new Map<string, { count: number; resetAt: number }>()
  return (key, now = Date.now()) => {
    const current = windows.get(key)
    if (!current || now >= current.resetAt) {
      windows.set(key, { count: 1, resetAt: now + windowMs })
      return { ok: true }
    }
    if (current.count >= limit) {
      return { ok: false, retryAfterSeconds: Math.ceil((current.resetAt - now) / 1000) }
    }
    current.count += 1
    return { ok: true }
  }
}
