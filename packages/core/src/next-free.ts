import { formatClock, formatDay } from './format'

/**
 * "Next free" on the garage list's cards (customer UI round, Nov 2026): the
 * first day a garage has a time for the job checkout books from a card, and
 * up to three of its times, as GET /vendors/next-free answers (the server's
 * lib/next-free.ts runs the picker's own rule).
 */
export interface NextFree {
  /** 'today', 'tomorrow' or the IST date, as the server saw it. */
  day: string
  /** Up to three ISO starts, earliest first. */
  times: string[]
}

/** How many garages one ask may name (the server's NEXT_FREE_MAX_IDS). */
export const NEXT_FREE_MAX_IDS = 20

/**
 * "Today", "Tomorrow", else "Thu 12 Nov": read from the first time itself
 * against this clock, not from the server's word, so an answer kept by the
 * browser across midnight never says "Today" for yesterday's times.
 */
export function nextFreeDayLabel(free: NextFree, now: number = Date.now()): string {
  const first = free.times[0]
  return first ? formatDay(first, now) : ''
}

/** The times as the card's buttons say them: "9:00 am". */
export function nextFreeTimeLabels(free: NextFree): string[] {
  return free.times.map((time) => formatClock(time)).filter(Boolean)
}

/**
 * The times still ahead of this clock. A kept answer can hold a time that
 * has since passed; the card drops it rather than offer what checkout would
 * refuse, and hides the row once none is left.
 */
export function upcomingNextFree(free: NextFree | null | undefined, now: number = Date.now()): NextFree | null {
  if (!free) return null
  const times = free.times.filter((time) => Date.parse(time) > now)
  return times.length > 0 ? { day: free.day, times } : null
}

/** Ids in asks of at most `size`, in the order they came, none repeated. */
export function nextFreeBatches(ids: readonly string[], size: number = NEXT_FREE_MAX_IDS): string[][] {
  const unique = Array.from(new Set(ids))
  const batches: string[][] = []
  for (let i = 0; i < unique.length; i += size) batches.push(unique.slice(i, i + size))
  return batches
}
