import { apiClient } from './client'
import { nextFreeBatches, type NextFree } from '@repo/core/next-free'
import type { BookingType } from '@repo/core/types'

/**
 * GET /vendors/next-free — the first free times of up to 20 garages, in one
 * ask. Every id asked for comes back as a key; null is "no time this week"
 * (or the garage cannot take this kind of booking).
 */
export function getNextFree(
  ids: readonly string[],
  bookingType: BookingType
): Promise<Record<string, NextFree | null>> {
  return apiClient<Record<string, NextFree | null>>('/vendors/next-free', {
    auth: false,
    params: { ids: ids.join(','), bookingType },
  })
}

/**
 * How long the batcher waits for more cards before it asks. Cards that come
 * into view together (the first screen, a fling) land in the same window, so
 * the list asks once for all of them rather than once per card.
 */
export const NEXT_FREE_BATCH_MS = 150

type Waiter = { resolve: (free: NextFree | null) => void; reject: (error: unknown) => void }

/** Ids waiting for the next ask, per booking type. */
const waiting = new Map<BookingType, Map<string, Waiter[]>>()
let timer: ReturnType<typeof setTimeout> | null = null

function flush() {
  timer = null
  const asks = Array.from(waiting.entries())
  waiting.clear()
  for (const [bookingType, byId] of asks) {
    for (const batch of nextFreeBatches(Array.from(byId.keys()))) {
      getNextFree(batch, bookingType).then(
        (data) => {
          for (const id of batch) byId.get(id)?.forEach((w) => w.resolve(data[id] ?? null))
        },
        (error: unknown) => {
          for (const id of batch) byId.get(id)?.forEach((w) => w.reject(error))
        }
      )
    }
  }
}

/**
 * One garage's next free times, asked for together with every other card
 * that wants its own inside the same NEXT_FREE_BATCH_MS. Each card's query
 * calls this; the network sees one request per screenful.
 */
export function loadNextFree(id: string, bookingType: BookingType): Promise<NextFree | null> {
  return new Promise((resolve, reject) => {
    let byId = waiting.get(bookingType)
    if (!byId) {
      byId = new Map()
      waiting.set(bookingType, byId)
    }
    const list = byId.get(id) ?? []
    list.push({ resolve, reject })
    byId.set(id, list)
    if (timer === null) timer = setTimeout(flush, NEXT_FREE_BATCH_MS)
  })
}
