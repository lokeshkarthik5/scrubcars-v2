'use client'

import { useEffect, useState } from 'react'

/**
 * The current time, refreshed every `intervalMs`, for screens whose options
 * depend on it (a slot losing its notice, a booking crossing its cutoff).
 * State rather than Date.now() in render, so renders stay pure and the
 * screen updates on its own while it sits open.
 */
export function useNow(intervalMs = 60_000): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), intervalMs)
    return () => clearInterval(timer)
  }, [intervalMs])
  return now
}
