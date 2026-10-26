'use client'

import { IconCheck, IconKey } from '@tabler/icons-react'
import { ScCard } from '@/components/ui/card'
import { formatStepTime } from '@repo/core/job-records'
import {
  pickupCodeCard,
  pickupTimeline,
  type PickupTimelineBooking,
} from '@repo/core/pickup'
import type { Booking } from '@repo/core/types'
import { cn } from '@repo/core/utils'

/**
 * A pickup & drop job's timeline on the booking page: Booked → Picked up →
 * At garage → Being worked on → Out for delivery → Delivered, with the time
 * under each step reached. The same look as StatusStepper, which the other
 * modes use; the steps and their states are pickupTimeline's
 * (@repo/core/pickup), so this only draws them.
 */
export function PickupTimeline({
  booking,
  now,
}: {
  booking: PickupTimelineBooking
  now: number
}) {
  const steps = pickupTimeline(booking)
  if (!steps) return null

  return (
    <ol aria-label="Pickup progress" className="flex flex-col">
      {steps.map((step, i) => {
        const done = step.state === 'done'
        const active = step.state !== 'upcoming'
        const isLast = i === steps.length - 1
        return (
          <li
            key={step.key}
            className="flex gap-3"
            aria-current={step.state === 'current' ? 'step' : undefined}
          >
            <div className="flex flex-col items-center">
              <div
                className={cn(
                  'flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full border-2',
                  done
                    ? 'border-brand-white bg-brand-white'
                    : step.state === 'current'
                      ? 'border-brand-white'
                      : 'border-text-muted'
                )}
              >
                {done && (
                  <IconCheck
                    size={13}
                    stroke={3}
                    className="text-brand-black"
                  />
                )}
                {step.state === 'current' && (
                  <span className="pulse-dot h-2 w-2 rounded-full bg-brand-white" />
                )}
              </div>
              {!isLast && (
                <div
                  className={cn(
                    'my-1 min-h-[18px] w-px flex-1',
                    done ? 'bg-brand-white/30' : 'bg-border'
                  )}
                />
              )}
            </div>
            <div className={cn(isLast ? 'pb-0' : 'pb-3.5')}>
              <p
                className={cn(
                  'text-[14px] font-semibold leading-tight',
                  active ? 'text-text-primary' : 'text-text-muted'
                )}
              >
                {step.label}
              </p>
              <p
                className={cn(
                  'mt-0.5 text-[12px] leading-tight',
                  active ? 'text-text-secondary' : 'text-text-muted'
                )}
              >
                {step.caption}
              </p>
              {step.at && (
                <p className="mt-0.5 font-numeric text-[11px] leading-tight text-text-muted">
                  {formatStepTime(step.at, now)}
                </p>
              )}
            </div>
          </li>
        )
      })}
    </ol>
  )
}

/**
 * The handover code, while the customer needs one: the pickup code until the
 * garage has the car, then the delivery code until it is back. Only the
 * customer's own booking carries the codes (the server never puts them in
 * another payload); pickupCodeCard picks which to show, and none once the
 * booking is over.
 *
 * The code is one run of text in the numeric face, wide-spaced so it can be
 * read out, not split into four boxes a screen reader would read as four
 * separate things.
 */
export function PickupCodeCard({
  booking,
}: {
  booking: Pick<Booking, 'status' | 'pickup'>
}) {
  const card = pickupCodeCard(booking)
  if (!card) return null

  return (
    <ScCard className="flex flex-col gap-2 px-4 py-4">
      <div className="flex items-center gap-2">
        <IconKey
          size={16}
          className="shrink-0 text-text-secondary"
          aria-hidden
        />
        <h2 className="text-sm font-semibold text-text-primary">
          {card.title}
        </h2>
      </div>
      <p className="text-[13px] text-text-secondary">{card.line}</p>
      <p className="font-numeric text-[36px] font-bold leading-none tracking-[0.3em] text-text-primary">
        {card.code}
      </p>
      <p className="text-[11px] text-text-muted">
        {card.kind === 'pickup'
          ? 'Share it only when you hand over your car. The garage enters it to mark your car picked up.'
          : 'Share it only once you have your car back. The garage enters it to finish the job.'}
      </p>
    </ScCard>
  )
}
