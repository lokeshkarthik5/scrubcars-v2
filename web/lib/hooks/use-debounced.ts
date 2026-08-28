'use client'

import { useEffect, useState } from 'react'

/**
 * Trails `value` by `delayMs`, so a value that changes on every keystroke only
 * reaches whatever consumes it once typing pauses.
 *
 * Used for search text that keys a network query — without it, "car wash" is
 * eight requests instead of one.
 */
export function useDebounced<T>(value: T, delayMs = 300): T {
  const [debounced, setDebounced] = useState(value)

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs)
    return () => clearTimeout(timer)
  }, [value, delayMs])

  return debounced
}
