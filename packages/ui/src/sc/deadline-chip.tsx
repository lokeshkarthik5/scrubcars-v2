'use client'

import { useEffect, useRef, useState } from 'react'
import {
  deadlineState,
  formatClock,
  type DeadlineState,
} from '@repo/core/format'
import { cn } from '@repo/core/utils'

const SLOW_TICK_MS = 15_000
const FAST_TICK_MS = 1_000
const MINUTE_MS = 60_000

interface DeadlineChipProps {
  /** ISO time it is due by. */
  deadline: string
  /** False while the shop is shut and the clock hasn't started: "By 9:30 am". */
  shopOpen?: boolean
  /** When the window opened, so the bar drains against its whole length. */
  startedAt?: string
  /** Amber at or under this many minutes. Default 5. */
  urgentMins?: number
  /** The words once it has run out. Default "Missed". */
  missedLabel?: string
  /** Called once, when it runs out while on screen. */
  onExpire?: () => void
  /** What the time is for, in the spoken label: "22 minutes left to answer". */
  action?: string
  className?: string
}

/** "1 h 05 min" → "1 hour 5 minutes", for a screen reader. */
function spoken(minutes: number): string {
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  const parts = [
    hours > 0 && `${hours} ${hours === 1 ? 'hour' : 'hours'}`,
    (rest > 0 || hours === 0) && `${rest} ${rest === 1 ? 'minute' : 'minutes'}`,
  ].filter(Boolean)
  return parts.join(' ')
}

function ariaLabel(
  state: DeadlineState,
  deadline: string,
  now: number,
  action: string,
  missedLabel: string
): string {
  if (state.kind === 'missed') return missedLabel
  if (state.kind === 'closed') {
    const verb = action.replace(/^to /, '')
    return `${verb.charAt(0).toUpperCase()}${verb.slice(1)} by ${formatClock(deadline)}`
  }
  const minutes = Math.ceil((Date.parse(deadline) - now) / MINUTE_MS)
  return `${spoken(minutes)} left ${action}`
}

/**
 * The deadline in its four looks, the same on every screen (garage mockup
 * 04): "By 9:30 am" while the shop is shut, "22 min" with a draining bar,
 * amber "4 min" in the last few minutes, then grey "Missed". It ticks every
 * 15 s, and every second inside the urgent window, so the switch to amber
 * and to Missed lands on time without a re-render from the page.
 */
export function DeadlineChip({
  deadline,
  shopOpen = true,
  startedAt,
  urgentMins = 5,
  missedLabel = 'Missed',
  onExpire,
  action = 'to answer',
  className,
}: DeadlineChipProps) {
  const [now, setNow] = useState(() => Date.now())
  const state = deadlineState(deadline, {
    now,
    shopOpen,
    startedAt,
    urgentMins,
  })

  // The next tick: every second when urgent, else every 15 s but never
  // later than the moment it turns urgent.
  useEffect(() => {
    if (state.kind === 'missed') return
    const untilUrgent = Date.parse(deadline) - urgentMins * MINUTE_MS - now
    const delay =
      state.kind === 'urgent'
        ? FAST_TICK_MS
        : untilUrgent > 0
          ? Math.min(SLOW_TICK_MS, untilUrgent)
          : SLOW_TICK_MS
    const timer = setTimeout(() => setNow(Date.now()), delay)
    return () => clearTimeout(timer)
  }, [now, deadline, urgentMins, state.kind])

  // Once, and only for a run-out seen here: a chip that mounts already past
  // its time says Missed without asking the page to refetch again.
  const onExpireRef = useRef(onExpire)
  useEffect(() => {
    onExpireRef.current = onExpire
  }, [onExpire])
  const seenRunning = useRef(false)
  const expired = useRef(false)
  useEffect(() => {
    if (state.kind !== 'missed') {
      seenRunning.current = true
      return
    }
    if (seenRunning.current && !expired.current) {
      expired.current = true
      onExpireRef.current?.()
    }
  }, [state.kind])

  const urgent = state.kind === 'urgent'
  const missed = state.kind === 'missed'
  const showBar = state.kind === 'running' || urgent

  // The server renders one moment and the browser another, a second
  // apart; the next tick puts it right, so React is told not to mind.
  return (
    <span
      role="timer"
      suppressHydrationWarning
      aria-label={ariaLabel(state, deadline, now, action, missedLabel)}
      className={cn(
        'inline-flex min-w-[64px] flex-col justify-center gap-1 rounded-[10px] border px-2.5 py-1.5',
        urgent
          ? 'border-warning/60 bg-warning-muted text-warning'
          : missed
            ? 'border-border bg-surface text-text-muted'
            : 'border-border bg-surface text-text-primary',
        className
      )}
    >
      <span
        suppressHydrationWarning
        className="font-numeric text-[15px] font-semibold leading-none"
      >
        {missed ? missedLabel : state.label}
      </span>
      {showBar && (
        <span
          aria-hidden="true"
          className="block h-[3px] w-full overflow-hidden rounded-full bg-white/10"
        >
          <span
            suppressHydrationWarning
            className={cn(
              'block h-full rounded-full transition-[width] duration-1000 ease-linear motion-reduce:transition-none',
              urgent ? 'bg-warning' : 'bg-text-primary'
            )}
            style={{ width: `${Math.round(state.fractionLeft * 1000) / 10}%` }}
          />
        </span>
      )}
    </span>
  )
}
