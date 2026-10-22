'use client'

import { IconClock } from '@tabler/icons-react'
import { useNow } from '@repo/core/hooks/use-now'
import { garageCountdown } from '@repo/core/response-deadline'
import type { ResponseDeadline } from '@repo/core/types'
import { cn } from '@repo/core/utils'

/**
 * How long the garage has left to answer a paid booking (0042): "Accept
 * within 12 min", or "Accept by 9:30 am" while its clock waits for opening
 * time. Amber in the last five minutes. Past it, with auto-cancel on, the
 * booking is being cancelled and refunded and the card says so instead.
 * Ticks on its own every 10 seconds, so the minutes move while the page sits
 * open between the job list's polls.
 */
export function ResponseCountdown({ deadline }: { deadline: ResponseDeadline }) {
  const now = useNow(10_000)
  const countdown = garageCountdown(deadline, now)
  return (
    <p
      // A screen reader hears the change when it turns amber or runs out,
      // not every minute.
      aria-live={countdown.amber || countdown.kind === 'passed' ? 'polite' : 'off'}
      className={cn(
        'flex items-center gap-1.5 text-[12px] font-medium',
        countdown.kind === 'passed' && countdown.enforced
          ? 'text-text-secondary'
          : countdown.amber || countdown.kind === 'passed'
            ? 'text-warning'
            : 'text-text-primary'
      )}
    >
      <IconClock size={14} aria-hidden="true" className="shrink-0" />
      <span className="font-numeric">{countdown.text}</span>
    </p>
  )
}

/** Whether the garage's time to answer has run out and the server is cancelling the booking. */
export function responseRunOut(deadline: ResponseDeadline | null, now: number): boolean {
  return Boolean(deadline?.enforced && new Date(deadline.respondBy).getTime() <= now)
}
