'use client'

import { useEffect, useState } from 'react'
import { usePrefersReducedMotion } from '@repo/ui/finish/motion'

/** How long each hint stays before the next rolls in. */
const HINT_MS = 2600

/**
 * The search field's hint, rolling through real searches (§3: "garages or
 * services", "foam wash", …): each one slides up and out as the next comes
 * in. The one loop the finish allows, and only while the page is in view;
 * under reduced motion it stays on the first hint. Drawn only: the field's
 * own name is what a screen reader says.
 */
export function RollingHint({ hints }: { hints: readonly string[] }) {
  const reduce = usePrefersReducedMotion()
  const [index, setIndex] = useState(0)

  useEffect(() => {
    if (reduce || hints.length < 2) return
    const timer = window.setInterval(() => {
      if (document.hidden) return
      setIndex((i) => (i + 1) % hints.length)
    }, HINT_MS)
    return () => window.clearInterval(timer)
  }, [reduce, hints.length])

  const shown = reduce ? 0 : index
  return (
    <span aria-hidden="true" className="relative block h-[1.35em] min-w-[11em] overflow-hidden">
      {hints.map((hint, i) => (
        <span
          key={hint}
          className="absolute left-0 top-0 whitespace-nowrap leading-[1.35em] transition-[transform,opacity] duration-500 ease-[cubic-bezier(.22,1,.36,1)] motion-reduce:transition-none"
          style={{
            transform: `translateY(${i === shown ? 0 : i === (shown - 1 + hints.length) % hints.length ? -100 : 100}%)`,
            opacity: i === shown ? 1 : 0,
          }}
        >
          {hint}
        </span>
      ))}
    </span>
  )
}
