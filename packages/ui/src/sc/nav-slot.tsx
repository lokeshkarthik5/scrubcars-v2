'use client'

import { createContext, useContext, type ReactNode } from 'react'
import { BottomNav, type NavType } from './bottom-nav'

/**
 * A floating nav an app hands every AppShell at once, from its layout,
 * instead of each page passing `floatingNav`: the garage portal's Garage
 * Book bar while GARAGE_BOOK is on. With no provider (the customer app,
 * admin, and the portal with the book off) every page keeps its flat bar,
 * and AppShell renders exactly as before.
 */
const FloatingNavContext = createContext<ReactNode>(null)

export function FloatingNavProvider({ nav, children }: { nav: ReactNode; children: ReactNode }) {
  return <FloatingNavContext.Provider value={nav}>{children}</FloatingNavContext.Provider>
}

/**
 * The provided floating nav, or the flat BottomNav of `type`. A floating
 * nav sits over the page rather than under it, so 32px more room is left
 * after the page: with AppShell's own 5rem that is FLOATING_NAV_CLEARANCE.
 */
export function NavSlot({ type }: { type: NavType }) {
  const floating = useContext(FloatingNavContext)
  if (!floating) return <BottomNav type={type} />
  return (
    <>
      <div aria-hidden className="h-8 shrink-0" />
      {floating}
    </>
  )
}
