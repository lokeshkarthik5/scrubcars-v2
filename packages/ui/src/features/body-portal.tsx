'use client'

import { useSyncExternalStore, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

const noSubscribe = () => () => undefined

/** True once in the browser (false in the server's HTML), so a portal never renders on the server. */
function useInBrowser(): boolean {
  return useSyncExternalStore(noSubscribe, () => true, () => false)
}

/**
 * Its children on document.body. For a sheet opened from inside the garage
 * page's sections: they arrive with an animation (`.gp-sec`, fill-mode
 * both) that leaves a transform applied, and a transformed ancestor pins a
 * `position: fixed` sheet inside the section instead of the screen. Both
 * "What this means" sheets (the medal's and the Luxury specialist's) go
 * through this.
 */
export function BodyPortal({ children }: { children: ReactNode }) {
  const inBrowser = useInBrowser()
  return inBrowser ? createPortal(children, document.body) : null
}
