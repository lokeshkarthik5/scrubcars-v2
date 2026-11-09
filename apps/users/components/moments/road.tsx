'use client'

import { useEffect, useRef, useState } from 'react'
import { roadStopAt } from '@repo/core/moments'
import { cn } from '@repo/core/utils'
import { t } from '@repo/core/i18n/translate'
import { usePrefersReducedMotion, useSeenOnce } from '@repo/ui/finish/motion'

/** The small side-on car that drives the road (the list card's own). */
export function RoadCar({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={cn('mo-road__car', className)}>
      <path
        fill="currentColor"
        d="M2.5 15.6v-2.3c0-.9.6-1.6 1.4-1.8l2.6-.6l2.6-3.1c.4-.5 1-.8 1.7-.8h4.6c.7 0 1.3.3 1.7.8l2.7 3.1l1.9.4c.8.2 1.4.9 1.4 1.8v2.5c0 .5-.4.9-.9.9h-1.1a2.4 2.4 0 0 0-4.6 0H8.6a2.4 2.4 0 0 0-4.6 0h-.6c-.5 0-.9-.4-.9-1z"
      />
      <circle fill="currentColor" cx="6.3" cy="16.6" r="1.7" />
      <circle fill="currentColor" cx="17.7" cy="16.6" r="1.7" />
    </svg>
  )
}

/**
 * The road from you to the garage (§5): a hairline from your white dot to
 * the garage's red pin, drawn in once when it comes into view while the car
 * drives to the garage. Decorative: the distance is said in words beside it.
 */
export function GarageRoad({ from, to, className }: { from?: string; to: string; className?: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const seen = useSeenOnce(ref)
  const reduce = usePrefersReducedMotion()
  return (
    <div ref={ref} aria-hidden="true" className={cn('pt-0.5', className)}>
      <div className="mo-road" data-play={seen && !reduce ? '' : undefined} style={{ '--share': 1 } as React.CSSProperties}>
        <span className="mo-road__line" />
        <span className="mo-road__me" />
        <span className="mo-road__pin" />
        <span className="mo-road__carriage">
          <RoadCar />
        </span>
      </div>
      <div className="mt-[9px] flex justify-between gap-3 text-t5 font-medium text-[#8E8E98]">
        <span>{from ?? t('You')}</span>
        <span className="truncate">{to}</span>
      </div>
    </div>
  )
}

export interface RoadStop {
  label: string
  state: 'done' | 'current' | 'upcoming'
}

/**
 * The road is the progress bar (moment 2): the steps are stops along the
 * road, the part travelled lit and the car parked at the step reached. When
 * the step changes while the page is open the car drives on to it; the
 * garage's pin flashes like headlights when the booking is accepted, and is
 * a green tick once it is done. Four stops for a booking, six for pickup &
 * drop. Read as an ordered list of the steps, the one reached marked
 * current; the road itself is drawn, not read. Its list is named "Booking
 * status", not "Booking progress": that is the full timeline's name lower on
 * the same page, and two lists with one name can't be told apart.
 */
export function ProgressRoad({
  stops,
  label,
  flashAt,
  compact = false,
  className,
}: {
  stops: RoadStop[]
  label?: string
  /** The step whose arrival flashes the garage's pin (Accepted). */
  flashAt?: number
  /** The ticket's small road: no labels under it. */
  compact?: boolean
  className?: string
}) {
  const reduce = usePrefersReducedMotion()
  const doneAll = stops.length > 0 && stops.every((stop) => stop.state === 'done')
  const currentIndex = stops.findIndex((stop) => stop.state === 'current')
  const lastDone = stops.reduce((last, stop, i) => (stop.state === 'done' ? i : last), -1)
  // Where the car is: at the current step, or the last one done.
  const at = doneAll ? stops.length - 1 : currentIndex >= 0 ? currentIndex : Math.max(0, lastDone)
  const share = roadStopAt(at, stops.length)

  // The pin flashes once when the booking reaches the flash step, whether it
  // just changed under the customer or the page opened on it.
  const [flash, setFlash] = useState(false)
  const flashedFor = useRef<number | null>(null)
  useEffect(() => {
    if (reduce || flashAt === undefined || at !== flashAt || flashedFor.current === at) return
    flashedFor.current = at
    setFlash(true)
    const timer = window.setTimeout(() => setFlash(false), 1500)
    return () => window.clearTimeout(timer)
  }, [at, flashAt, reduce])

  return (
    <div className={cn('flex flex-col', className)}>
      <div className="mo-track mx-1.5" aria-hidden="true" style={{ '--share': share } as React.CSSProperties}>
        <span className="mo-track__fill" />
        {stops.map((stop, i) => {
          const end = i === stops.length - 1
          return (
            <span
              key={stop.label}
              className={cn('mo-stop', end && 'mo-stop--end')}
              style={{ left: `${roadStopAt(i, stops.length) * 100}%` }}
              data-on={!end && i <= at ? '' : undefined}
              data-flash={end && flash ? '' : undefined}
              data-done={end && doneAll ? '' : undefined}
            />
          )
        })}
        {!doneAll && (
          <span className="mo-road__carriage">
            <RoadCar />
          </span>
        )}
      </div>
      <ol aria-label={label ?? t('Booking status')} className={cn('mt-3.5 flex justify-between gap-1 text-t5 font-medium', compact && 'sr-only')}>
        {stops.map((stop, i) => (
          <li
            key={stop.label}
            aria-current={i === at ? 'step' : undefined}
            className={cn(
              // Wraps rather than cuts off: Tamil step names are longer.
              'min-w-0 flex-1 break-words',
              i === 0 ? 'text-left' : i === stops.length - 1 ? 'text-right' : 'text-center',
              i === at ? 'text-text-primary' : 'text-[#8E8E98]'
            )}
          >
            {stop.label}
          </li>
        ))}
      </ol>
    </div>
  )
}

/** The four steps (STATUS_STEPS) as stops, in the language chosen, from the headline's step. */
export function statusStops(steps: readonly string[], step: number, finished: boolean): RoadStop[] {
  return steps.map((label, i) => ({
    label: t(label),
    state: finished || i < step ? 'done' : i === step ? 'current' : 'upcoming',
  }))
}
