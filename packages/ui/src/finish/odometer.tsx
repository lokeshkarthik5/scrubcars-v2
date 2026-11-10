'use client'

import { useEffect, useRef, useState } from 'react'
import { COUNT_UP_MS, countUpFrame, odometerPlaces, odometerRoll } from '@repo/core/figure-motion'
import { cn } from '@repo/core/utils'
import { usePrefersReducedMotion } from './motion'

/**
 * A figure that rolls like an odometer when it changes (§1: "numbers that
 * change roll like an odometer"): each digit place that changed rolls in from
 * below when the figure grew, from above when it shrank. Read by screen
 * readers as the plain figure; the rolling places are hidden from them.
 */
export function Odometer({
  value,
  numeric,
  className,
}: {
  /** The figure as it should read, formatted ("₹1,049", "5"). */
  value: string
  /** The number it stands for, for the direction; parsed from `value` when left out. */
  numeric?: number
  className?: string
}) {
  const reduce = usePrefersReducedMotion()
  const number = numeric ?? Number(value.replace(/[^0-9.-]/g, ''))
  // The direction is worked out during the render the figure changes in
  // (state adjusted in render, not an effect, so no frame shows the new
  // figure unrolled), and the key bumped so the changed places mount again
  // and play their roll once.
  const [shown, setShown] = useState<{ number: number; key: number; dir: 'up' | 'down' | 'none' }>({
    number,
    key: 0,
    dir: 'none',
  })
  if (shown.number !== number && !(Number.isNaN(shown.number) && Number.isNaN(number))) {
    setShown({ number, key: shown.key + 1, dir: reduce ? 'none' : odometerRoll(shown.number, number) })
  }
  const roll = shown

  const places = odometerPlaces(value)
  return (
    <span className={cn('font-numeric', className)}>
      <span className="sr-only">{value}</span>
      <span aria-hidden="true" className="inline-flex">
        {places.map((place, i) => (
          <span key={`${places.length - i}-${place.digit === null ? place.char : roll.key}`} className="fx-odo">
            <span className={place.digit !== null && roll.dir !== 'none' ? `fx-odo-${roll.dir}` : undefined}>
              {place.char}
            </span>
          </span>
        ))}
      </span>
    </span>
  )
}

/**
 * A figure that counts up from nothing once `run` turns true (a card coming
 * into view), with the settled figure's decimals on every frame. Shows the
 * figure itself straight away under reduced motion, and before `run` it is
 * the settled figure too, so a card that never animates is never left at 0.
 */
export function useCountUp(to: number, decimals: number, run: boolean): string {
  const reduce = usePrefersReducedMotion()
  const [frame, setFrame] = useState<string | null>(null)
  const started = useRef(false)

  useEffect(() => {
    if (!run || reduce || started.current || !Number.isFinite(to)) return
    started.current = true
    let raf = 0
    const t0 = performance.now()
    const tick = (now: number) => {
      const elapsed = now - t0
      setFrame(countUpFrame(to, elapsed, decimals))
      if (elapsed < COUNT_UP_MS) raf = requestAnimationFrame(tick)
      else setFrame(null)
    }
    raf = requestAnimationFrame(tick)
    // A new figure mid-count (the list refetching with a location, say) must
    // not leave the card on a part-way frame like "0.0 km": drop the frame so
    // the settled figure shows, and let the new figure count from the start.
    return () => {
      cancelAnimationFrame(raf)
      setFrame(null)
      started.current = false
    }
  }, [run, reduce, to, decimals])

  return frame ?? (Number.isFinite(to) ? to.toFixed(decimals) : '')
}
