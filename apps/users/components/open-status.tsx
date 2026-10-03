'use client'

import { useEffect, useState } from 'react'
import { openStatus, type OpeningDay } from '@repo/core/opening-hours'
import { cn } from '@repo/core/utils'

/**
 * The current time, re-read on each minute boundary — so a garage page left
 * open across closing time turns from "Open" to "Closed" without a reload.
 */
function useMinuteClock() {
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>
    const untilNextMinute = () => 60_000 - (Date.now() % 60_000)
    const tick = () => {
      setNow(new Date())
      timer = setTimeout(tick, untilNextMinute())
    }
    timer = setTimeout(tick, untilNextMinute())
    return () => clearTimeout(timer)
  }, [])

  return now
}

interface OpenStatusProps {
  /** The garage's weekly hours. Null or empty renders nothing. */
  hours: readonly OpeningDay[] | null | undefined
  /** `line` sits in text; `overlay` is a pill that reads on top of a photo. */
  variant?: 'line' | 'overlay'
  className?: string
}

/**
 * "Open · closes 7 PM" / "Closed · opens 9 AM tomorrow", from real hours.
 *
 * Renders nothing when the hours are unknown. A status we cannot back up is
 * worse than none: the badge this replaced said "Open" for any active account,
 * at 2 AM and on the weekly off day, and a customer who drives over on its word
 * learns not to trust the rest of the page either.
 */
export function OpenStatus({ hours, variant = 'line', className }: OpenStatusProps) {
  const now = useMinuteClock()
  const status = openStatus(hours, now)
  if (!status) return null

  return (
    <span
      className={cn(
        'inline-flex min-w-0 items-center gap-1.5',
        variant === 'overlay'
          ? 'rounded-full bg-brand-black/75 px-2 py-0.5 text-[12px] leading-4 text-text-secondary backdrop-blur-sm'
          : 'text-[13px] leading-[18px] text-text-secondary',
        className
      )}
    >
      {/* Colour is only a second cue: the word itself says open or closed. */}
      <span
        aria-hidden="true"
        className={cn(
          'h-1.5 w-1.5 shrink-0 rounded-full',
          status.isOpen ? 'bg-success' : 'bg-text-muted'
        )}
      />
      <span className="truncate">
        <span className="font-medium text-text-primary">
          {status.isOpen ? 'Open' : 'Closed'}
        </span>
        {status.detail && ` · ${status.detail}`}
      </span>
    </span>
  )
}
