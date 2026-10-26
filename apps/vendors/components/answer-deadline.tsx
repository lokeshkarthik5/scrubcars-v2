'use client'

import { IconAlarm } from '@tabler/icons-react'
import { deadlineState } from '@repo/core/format'
import { useNow } from '@repo/core/hooks/use-now'
import { garageCountdown } from '@repo/core/response-deadline'
import type { ResponseDeadline } from '@repo/core/types'
import { cn } from '@repo/core/utils'

const MINUTE_MS = 60 * 1000

/**
 * The top of a new-booking card (garage mockup 01): how long is left to
 * answer, big, with a bar that drains. The same four looks as everywhere
 * (`deadlineState`): "By 9:30 am" while the clock waits for opening time,
 * "22 min" running, amber "4 min" in the last five, then missed. Ticks on its
 * own every 10 seconds, between the list's polls.
 *
 * The server has already folded the opening hours into `respondBy`: a
 * deadline further off than the window itself is one whose clock hasn't
 * started (the garage is shut), which is the "By" look.
 */
export function AnswerDeadline({ deadline }: { deadline: ResponseDeadline }) {
  const now = useNow(10_000)
  const respondBy = new Date(deadline.respondBy).getTime()
  const windowMs = deadline.windowMins * MINUTE_MS
  const state = deadlineState(deadline.respondBy, {
    now,
    shopOpen: respondBy - now <= windowMs,
    startedAt: new Date(respondBy - windowMs),
  })

  if (state.kind === 'missed') {
    // With auto-cancel on the booking is going; off, the garage is only late.
    const text = garageCountdown(deadline, now).text
    return (
      <div
        role="status"
        className="rounded-t-[20px] border-b border-border bg-surface-elevated px-5 py-3 text-[15px] font-medium text-text-secondary"
      >
        {text}
      </div>
    )
  }

  const urgent = state.kind === 'urgent'
  return (
    <div
      // A screen reader hears it when it turns urgent, not every tick.
      aria-live={urgent ? 'polite' : 'off'}
      className={cn(
        'relative overflow-hidden rounded-t-[20px] border-b border-border',
        urgent && 'bg-warning/15'
      )}
    >
      <div className="flex items-center justify-between gap-3 px-5 pb-3 pt-4">
        <p
          className={cn(
            'flex items-baseline gap-2',
            urgent ? 'text-warning' : 'text-text-primary'
          )}
        >
          {state.kind === 'closed' ? (
            <>
              <span className="font-numeric text-[28px] font-bold leading-none tracking-tight">
                {state.label}
              </span>
              <span className="text-[16px] font-medium">to answer</span>
            </>
          ) : (
            <>
              <span className="font-numeric text-[40px] font-bold leading-none tracking-tight">
                {state.label}
              </span>
              <span className="text-[16px] font-medium">left to answer</span>
            </>
          )}
        </p>
        <IconAlarm
          size={26}
          aria-hidden="true"
          className={urgent ? 'text-warning' : 'text-text-secondary'}
        />
      </div>
      {state.kind !== 'closed' && (
        <div aria-hidden="true" className="h-1.5 w-full bg-border">
          <div
            className={cn(
              'h-full rounded-r-full transition-[width] duration-1000',
              urgent ? 'bg-warning' : 'bg-text-primary'
            )}
            style={{
              width: `${Math.max(2, Math.round(state.fractionLeft * 100))}%`,
            }}
          />
        </div>
      )}
    </div>
  )
}
