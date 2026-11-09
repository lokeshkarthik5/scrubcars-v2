'use client'

import { useEffect, useRef, useState } from 'react'
import { ProgressRoad, type RoadStop } from './road'

/** How long the moment holds before it hands the page back. */
const HOLD_MS = 2400

/**
 * Ignition (moment 1), the moment after paying, in place of the confetti
 * burst: the Pay button's red light runs out along the bottom like an LED
 * strip switching on, the screen dims, a tick draws itself in a red-lit
 * ring, and the booking card rises with the road and the car parked at
 * Requested. The same words as before ("Booking requested / Waiting for…",
 * "Booking confirmed / …"): it celebrates what happened, never more.
 *
 * Plays once and hands the page back by itself, as the burst did; under
 * reduced motion everything is simply there for the same time. Announced
 * once (role status).
 */
export function Ignition({
  title,
  subtitle,
  stops,
  caption,
  onDone,
}: {
  title: string
  subtitle?: string
  /** The booking's road, the car at its step (Requested after paying). */
  stops: RoadStop[]
  /** The line under the road ("Requested · they answer by 10:30 am"). */
  caption?: string | null
  onDone: () => void
}) {
  const [leaving, setLeaving] = useState(false)
  // Held in a ref (written in an effect, never during render) so the timers
  // below are not restarted every time the page behind re-renders — the
  // booking page polls its status, which would otherwise keep the moment up.
  const onDoneRef = useRef(onDone)
  useEffect(() => {
    onDoneRef.current = onDone
  }, [onDone])

  useEffect(() => {
    const fade = setTimeout(() => setLeaving(true), HOLD_MS)
    const done = setTimeout(() => onDoneRef.current(), HOLD_MS + 220)
    return () => {
      clearTimeout(fade)
      clearTimeout(done)
    }
  }, [])

  return (
    <div
      role="status"
      aria-live="polite"
      data-leaving={leaving ? '' : undefined}
      className="mo-ign fixed inset-0 z-[60]"
    >
      <div aria-hidden="true" className="mo-ign__dim absolute inset-0 bg-[rgb(0_0_0/0.78)]" />
      <div className="relative mx-auto flex h-full w-full max-w-[428px] flex-col items-center px-4">
        <svg viewBox="0 0 64 64" aria-hidden="true" className="mt-[22vh] size-16">
          <circle cx="32" cy="32" r="30" fill="none" stroke="#ff2d4a" strokeWidth="2" className="mo-ign__ring" />
          <path
            d="M20 33l8 8l16-17"
            fill="none"
            stroke="#fff"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="mo-ign__tick"
          />
        </svg>
        <div className="mo-ign__card fx-edge mt-6 w-full rounded-[22px] p-4 text-left">
          <h2 className="text-t2 font-semibold text-text-primary">{title}</h2>
          {subtitle && <p className="mt-1 text-t4 text-text-secondary">{subtitle}</p>}
          <ProgressRoad stops={stops} compact className="mb-3 mt-[26px]" label="Your booking, just sent" />
          {caption && <p className="text-t5 font-medium text-[#8E8E98]">{caption}</p>}
        </div>
        <span aria-hidden="true" className="mo-ign__strip" />
      </div>
    </div>
  )
}
