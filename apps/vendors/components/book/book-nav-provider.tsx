'use client'

import type { ReactNode } from 'react'
import { FloatingNavProvider } from '@repo/ui/sc/nav-slot'
import { useGarageBookOn } from '@/lib/garage-book'
import { BookNav } from './book-nav'

/** Hands every page Garage Book's bar while the book is on; off, every page keeps today's bar. */
export function BookNavProvider({ children }: { children: ReactNode }) {
  const { on } = useGarageBookOn()
  return <FloatingNavProvider nav={on ? <BookNav /> : null}>{children}</FloatingNavProvider>
}
