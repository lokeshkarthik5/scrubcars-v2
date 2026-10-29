'use client'

import { useSyncExternalStore } from 'react'

const noop = () => () => {}

/**
 * False on the server and during hydration, true after: for a component on
 * a server-rendered page (the landing, 0062) that reads something only the
 * browser has (localStorage through a persisted store), so its first client
 * render matches the HTML and the browser's value follows a moment later.
 */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    noop,
    () => true,
    () => false
  )
}
