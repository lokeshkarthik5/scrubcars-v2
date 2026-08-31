'use client'

import { useEffect, useRef, useState } from 'react'
import { cn } from '@repo/core/utils'

/**
 * The confirmation moment after a booking is paid for.
 *
 * A drawn tick rather than a static icon: the stroke walks its dash offset to
 * zero, which reads as the app completing something rather than just reporting
 * it. The ring and confetti are pure decoration and are switched off entirely
 * under prefers-reduced-motion (see globals.css) — the tick and the words
 * still arrive, instantly.
 */

/** Fixed so the burst looks the same on every booking, not random per render. */
const CONFETTI = [
  { x: '-56px', r: '-220deg', delay: 120, color: 'bg-brand-red' },
  { x: '42px', r: '180deg', delay: 60, color: 'bg-success' },
  { x: '-24px', r: '140deg', delay: 220, color: 'bg-warning' },
  { x: '64px', r: '-160deg', delay: 300, color: 'bg-brand-white' },
  { x: '10px', r: '200deg', delay: 180, color: 'bg-brand-red' },
  { x: '-70px', r: '120deg', delay: 340, color: 'bg-success' },
]

interface SuccessBurstProps {
  title: string
  subtitle?: string
  /** Auto-dismisses after this long; the overlay is celebratory, not a step. */
  durationMs?: number
  onDone: () => void
}

export function SuccessBurst({
  title,
  subtitle,
  durationMs = 2200,
  onDone,
}: SuccessBurstProps) {
  const [leaving, setLeaving] = useState(false)
  // Held in a ref (written in an effect, never during render) so the timers
  // below are not restarted every time the page behind re-renders — the
  // booking page polls its status, which would otherwise keep the burst alive
  // indefinitely.
  const onDoneRef = useRef(onDone)

  useEffect(() => {
    onDoneRef.current = onDone
  }, [onDone])

  useEffect(() => {
    // Fade out slightly before handing control back, so the overlay is gone
    // rather than cut when the underlying page takes over.
    const fade = setTimeout(() => setLeaving(true), durationMs)
    const done = setTimeout(() => onDoneRef.current(), durationMs + 220)
    return () => {
      clearTimeout(fade)
      clearTimeout(done)
    }
  }, [durationMs])

  return (
    <div
      className={cn(
        'fixed inset-0 z-[60] flex flex-col items-center justify-center bg-brand-black/95 px-8 text-center backdrop-blur-sm',
        leaving ? 'overlay-out' : 'overlay-in'
      )}
      role="status"
      aria-live="polite"
    >
      <div className="relative flex h-28 w-28 items-center justify-center">
        {/* Expanding halo, behind the badge. */}
        <span className="success-ring absolute inset-0 rounded-full border-2 border-success" />

        <span className="success-pop relative flex h-20 w-20 items-center justify-center rounded-full bg-success-muted">
          <svg viewBox="0 0 36 36" className="h-11 w-11" aria-hidden="true">
            <path
              d="M10 18.5 L15.5 24 L26 12.5"
              fill="none"
              stroke="var(--color-success)"
              strokeWidth="3.2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="success-draw"
            />
          </svg>
        </span>

        {CONFETTI.map((piece, i) => (
          <span
            key={i}
            className={cn(
              'confetti-piece absolute left-1/2 top-3 h-1.5 w-1.5 rounded-[1px]',
              piece.color
            )}
            style={
              {
                '--confetti-x': piece.x,
                '--confetti-r': piece.r,
                '--confetti-delay': `${piece.delay}ms`,
              } as React.CSSProperties
            }
          />
        ))}
      </div>

      <h2 className="success-pop mt-6 text-[20px] font-bold tracking-tight text-text-primary">
        {title}
      </h2>
      {subtitle && (
        <p className="mt-1.5 max-w-[280px] text-[13px] text-text-secondary">
          {subtitle}
        </p>
      )}
    </div>
  )
}
