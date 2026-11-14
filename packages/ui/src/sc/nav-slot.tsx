'use client'

import { createContext, useContext, type ReactNode } from 'react'
import { GarageNav } from './garage-nav'

/**
 * A bar the garage portal hands every AppShell at once, from its layout,
 * instead of each page passing `floatingNav`: Garage Book's bar (Home · Jobs
 * · + · Customers · Business) while GARAGE_BOOK is on. With no provider —
 * the book off — every garage page keeps GarageNav, exactly as before.
 */
const FloatingNavContext = createContext<ReactNode>(null)

export function FloatingNavProvider({ nav, children }: { nav: ReactNode; children: ReactNode }) {
  return <FloatingNavContext.Provider value={nav}>{children}</FloatingNavContext.Provider>
}

/** The garage's floating bar: the provided one (Garage Book's), else GarageNav. */
export function GarageBar() {
  const provided = useContext(FloatingNavContext)
  return <>{provided || <GarageNav />}</>
}
