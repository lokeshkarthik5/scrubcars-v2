'use client'

import { useEffect, useState } from 'react'
import { cn } from '@repo/core/utils'

const SEEN_KEY = 'detlio:shine-stamps-seen'

function StarIcon({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden focusable="false">
      <path
        fill="currentColor"
        d="M12 2.6l2.75 5.82 6.35.8-4.67 4.38 1.2 6.3L12 16.8l-5.63 3.1 1.2-6.3L2.9 9.22l6.35-.8L12 2.6z"
      />
    </svg>
  )
}

function readSeen(fallback: number): number | null {
  if (typeof window === 'undefined') return null
  try {
    const stored = window.localStorage.getItem(SEEN_KEY)
    const value = stored === null ? fallback : Number(stored)
    return Number.isFinite(value) ? value : fallback
  } catch {
    return fallback
  }
}

/**
 * The Shine Card's stars: one per stamp the card holds, filled for each on
 * it. The stamp the customer has not seen yet (counted on this device only,
 * a display nicety) lands with a small pop; a full card glints once. Both
 * stop under prefers-reduced-motion (globals.css).
 */
export function StampStars({
  onCard,
  goal,
  size = 14,
  className,
  remember = false,
}: {
  onCard: number
  goal: number
  size?: number
  className?: string
  /** Animate a stamp only the first time this device shows it. */
  remember?: boolean
}) {
  // The count this device last showed, read once; the new count stored for next time.
  const [seen] = useState<number | null>(() => (remember ? readSeen(onCard) : onCard))
  useEffect(() => {
    if (!remember) return
    try {
      window.localStorage.setItem(SEEN_KEY, String(onCard))
    } catch {
      // Storage blocked: nothing animates, the stars are still right.
    }
  }, [onCard, remember])

  const full = onCard >= goal
  return (
    <span className={cn('flex items-center gap-[inherit]', full && 'shine-stars--full', className)}>
      {Array.from({ length: goal }, (_, i) => {
        const on = i < onCard
        const fresh = on && seen !== null && i >= seen
        return (
          <span
            key={i}
            style={{ ['--i' as string]: i }}
            className={cn('shine-star', on && 'shine-star--on', fresh && 'shine-star--new')}
          >
            <StarIcon size={size} />
          </span>
        )
      })}
    </span>
  )
}
