/**
 * "Saw a garage" (garage_card_seen), once per visit: the first time a garage
 * card is at least half on screen in a list (the homepage's garages, the
 * garage list), not merely rendered below the fold. The visit is the
 * browser tab, so the flag lives in sessionStorage beside the visit id
 * (packages/core/src/analytics.ts) and ends with it.
 */

/** sessionStorage: set once this visit has reported a garage card. */
export const GARAGE_SEEN_KEY = 'detlio:garage-seen'

/** The attribute a garage card in a list carries, for the watcher to find. */
export const GARAGE_CARD_ATTRIBUTE = 'data-garage-card'

/** How much of a card must be on screen to count as seen. */
export const GARAGE_SEEN_RATIO = 0.5

type SessionStore = Pick<Storage, 'getItem' | 'setItem'> | null

/** Whether this visit has already reported a garage card. Unreadable storage: assume not. */
export function garageAlreadySeen(storage: SessionStore): boolean {
  try {
    return storage?.getItem(GARAGE_SEEN_KEY) === '1'
  } catch {
    return false
  }
}

/**
 * Called when a card crosses into view: true the first time in this visit
 * (and marks it), false after. Without storage it still reports, once per
 * page (the caller stops watching).
 */
export function claimGarageSeen(storage: SessionStore): boolean {
  if (garageAlreadySeen(storage)) return false
  try {
    storage?.setItem(GARAGE_SEEN_KEY, '1')
  } catch {
    // Private mode: reported once for this page instead.
  }
  return true
}

/** True for an entry that is on screen enough to count. */
export function cardInView(entry: {
  isIntersecting: boolean
  intersectionRatio: number
}): boolean {
  return entry.isIntersecting && entry.intersectionRatio >= GARAGE_SEEN_RATIO
}
