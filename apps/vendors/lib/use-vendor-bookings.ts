'use client'

import { useCallback, useEffect, useState } from 'react'
import { useBookingsStore } from '@repo/core/stores/bookings-store'
import { useAuthStore } from '@repo/core/stores/auth-store'

/** How often the job lists re-read: the same on Home, Bookings and a job's page. */
export const POLL_MS = 10_000

/**
 * The garage's jobs, read now and every 10 seconds while the screen is open
 * (UX audit, garage finding 1: Home used to read once and never again, so a
 * paid booking could time out behind a stale list).
 *
 * `loaded` is false only until the first read settles, so the list never
 * blinks on a poll. `failed` says the last read failed; with no earlier
 * list that is "Couldn't load", never an empty list or a 0.
 */
export function useVendorBookings() {
  const vendorId = useAuthStore((s) => s.vendor?.id)
  const bookings = useBookingsStore((s) => s.vendorBookings)
  const fetchVendorBookings = useBookingsStore((s) => s.fetchVendorBookings)
  const [loaded, setLoaded] = useState(false)
  const [failed, setFailed] = useState(false)
  const [retrying, setRetrying] = useState(false)

  const read = useCallback(
    () =>
      fetchVendorBookings()
        .then(() => setFailed(false))
        .catch(() => setFailed(true))
        .finally(() => setLoaded(true)),
    [fetchVendorBookings]
  )

  useEffect(() => {
    if (!vendorId) return
    void read()
    const timer = setInterval(() => void read(), POLL_MS)
    // Back from another app: read at once rather than at the next tick.
    const onVisible = () => {
      if (document.visibilityState === 'visible') void read()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [vendorId, read])

  const reload = useCallback(() => {
    setRetrying(true)
    void read().finally(() => setRetrying(false))
  }, [read])

  return { bookings, loaded, failed, retrying, reload }
}
