'use client'

import { useEffect } from 'react'
import { readConditionPhoto } from '@repo/core/api/condition-check'
import type { Booking } from '@repo/core/types'

/**
 * Asks Detlio to look at each car-check photo it has not looked at yet
 * (0075, `conditionCheck.unread`), one at a time, and re-reads the job once
 * each is done. Shared by the job page and "Check the marks": a photo asked
 * about once is not asked again from either while the tab is open, and the
 * server answers a second ask without asking the model again anyway.
 *
 * Nothing here holds the job up: a look that fails leaves the photo without
 * marks, and the garage carries on.
 */
const asked = new Set<string>()
let queue: Promise<void> = Promise.resolve()

export function useConditionReader(booking: Booking | undefined, onChanged: () => void) {
  const bookingId = booking?.id
  const unread = booking?.conditionCheck?.unread ?? []
  const key = unread.join(',')

  useEffect(() => {
    if (!bookingId || !key) return
    for (const photoId of key.split(',')) {
      if (asked.has(photoId)) continue
      asked.add(photoId)
      queue = queue
        .then(() => readConditionPhoto(bookingId, photoId))
        .then(() => onChanged())
        // A failed ask is left for the next visit; the photo stands as it is.
        .catch(() => {
          asked.delete(photoId)
        })
    }
    // onChanged is the page's reload, stable for its lifetime.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookingId, key])
}

/** Whether Detlio is still looking at any of the job's car-check photos. */
export function conditionReading(booking: Booking): boolean {
  return (booking.conditionCheck?.unread.length ?? 0) > 0
}
