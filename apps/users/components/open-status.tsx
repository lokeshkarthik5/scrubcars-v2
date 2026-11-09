'use client'

import { useEffect, useState } from 'react'
import { hoursLeftShare, openStatus, type OpeningDay } from '@repo/core/opening-hours'
import { cn } from '@repo/core/utils'
import { HoursRing } from '@repo/ui/finish/hours-ring'

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
  /** Its upcoming holidays as IST dates; today being one reads "Closed today". */
  closures?: readonly string[]
  /**
   * `line` sits in text; `overlay` is a pill that reads on top of a photo;
   * `ring` is the garage page's line (customer UI round, §5): the
   * opening-hours ring in place of the dot, drawn in once, and "closes"
   * rather than "Open till".
   */
  variant?: 'line' | 'overlay' | 'ring'
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
export function OpenStatus({
  hours,
  closures,
  variant = 'line',
  className,
}: OpenStatusProps) {
  const now = useMinuteClock()
  const status = openStatus(hours, now, closures)
  if (!status) return null

  if (variant === 'ring') {
    return (
      <span className={cn('inline-flex min-w-0 items-center gap-[7px] text-t4 font-medium text-[#C8C8D0]', className)}>
        <HoursRing share={status.isOpen ? hoursLeftShare(hours, now, closures) : null} play />
        <span className="truncate">
          <span className="text-text-primary">
            {status.isOpen ? 'Open' : status.closedToday ? 'Closed today' : 'Closed'}
          </span>
          {status.detail && ` · ${status.detail}`}
        </span>
      </span>
    )
  }

  return (
    <span
      className={cn(
        'inline-flex min-w-0 items-center gap-1.5',
        variant === 'overlay'
          ? 'rounded-full bg-brand-black/75 px-2 py-0.5 text-t5 leading-4 text-text-secondary backdrop-blur-sm'
          : 'text-t4 leading-[18px] text-text-secondary',
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
          {status.isOpen
            ? 'Open'
            : status.closedToday
              ? 'Closed today'
              : 'Closed'}
        </span>
        {status.detail && ` · ${status.detail}`}
      </span>
    </span>
  )
}
