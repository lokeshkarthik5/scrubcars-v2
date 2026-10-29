'use client'

import Link from 'next/link'
import { IconCamera, IconCar, IconChevronRight } from '@tabler/icons-react'
import { ScButton } from '@repo/ui/sc/button'
import { ScButtonLink } from '@repo/ui/sc/button-link'
import { StatusChip } from '@repo/ui/sc/status-chip'
import { BOOKING_TYPE_LABELS } from '@repo/core/booking-types'
import { formatClock, formatRelative } from '@repo/core/format'
import { bookingStatusTone } from '@repo/core/status-tone'
import type { Booking } from '@repo/core/types'
import { cn } from '@repo/core/utils'
import { cancelledLabel, statusLabel } from '@/lib/job-words'
import { changeStatusWithUndo, useDeferredStatus } from '@/lib/deferred-status'
import { nextStep, nextStepLabel, servicesLine, shortName } from '@/lib/jobs'

/**
 * One short row per job on Today, Later and Done (garage mockup 02): the time
 * big down the left edge, then who, the car and plate, and what; the job's
 * state on the right. Tapping the row opens the job's own page.
 *
 * On Today a row also carries the job's one next step as its button: Start
 * job and Complete job right here (each with Undo), and anything that needs
 * the job page (photos, a pickup code) as a way into it.
 */
export function JobRow({
  booking: b,
  now,
  showStep = false,
  emphasis = false,
}: {
  booking: Booking
  now: number
  /** Show the next step's button (Today). */
  showStep?: boolean
  /** The job under way: outlined in blue, its step the screen's one red. */
  emphasis?: boolean
}) {
  const deferred = useDeferredStatus(b.id)
  const who = b.customerName || 'the customer'
  const step = showStep && !deferred ? nextStep(b) : null
  const startsIn =
    b.status === 'confirmed' ? new Date(b.scheduledAtIso).getTime() - now : null
  const [clock, meridiem] = formatClock(b.scheduledAtIso).split(' ')
  const dayOff =
    b.status === 'completed' ||
    b.status === 'cancelled' ||
    b.status === 'rescheduled'

  return (
    <article
      id={`job-${b.id}`}
      aria-label={`Job for ${who}`}
      className={cn(
        'relative scroll-mt-4 rounded-[20px] border bg-surface p-4',
        emphasis
          ? 'border-tone-progress-dot/60 shadow-[inset_4px_0_0_var(--color-tone-progress-dot)]'
          : 'border-border'
      )}
    >
      <div className="flex gap-4">
        <p className="w-16 shrink-0 font-numeric leading-none text-text-primary">
          <span className="block text-[24px] font-bold tracking-tight">
            {clock}
          </span>
          <span className="mt-1 block text-[14px] text-text-secondary">
            {meridiem}
          </span>
        </p>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            {/* The name is the row's link: the whole row is its target. */}
            <Link
              href={`/bookings/${b.id}`}
              className="min-w-0 truncate text-[17px] font-semibold text-text-primary after:absolute after:inset-0 after:rounded-[20px] after:content-['']"
            >
              {shortName(b.customerName)}
            </Link>
            <RowChip
              booking={b}
              now={now}
              startsIn={startsIn}
              deferred={deferred}
            />
          </div>
          {b.vehicle && (
            <p className="truncate text-[15px] text-text-secondary">
              {b.vehicle.make} {b.vehicle.model} ·{' '}
              <span className="font-numeric tracking-wide">
                {b.vehicle.plate}
              </span>
            </p>
          )}
          <p className="truncate text-[15px] text-text-secondary">
            {servicesLine(b)} · {BOOKING_TYPE_LABELS[b.bookingType]}
          </p>
          {dayOff && b.status !== 'completed' && (
            <p className="mt-1 text-[14px] text-text-secondary">
              {cancelledLabel(b)}
            </p>
          )}
        </div>
        {!step && (
          <IconChevronRight
            size={20}
            aria-hidden="true"
            className="mt-1 shrink-0 self-center text-text-muted"
          />
        )}
      </div>

      {step && (
        // Above the row's link, so a tap on the button is the button's.
        <div className="relative z-10 mt-3">
          {step.kind === 'start' || step.kind === 'complete' ? (
            <ScButton
              variant={emphasis ? 'main' : 'outline'}
              size={emphasis ? 'lg' : 'md'}
              fullWidth
              aria-label={`${nextStepLabel(step)} for ${who}`}
              onClick={() =>
                changeStatusWithUndo(
                  b.id,
                  step.kind === 'start' ? 'in_progress' : 'completed'
                )
              }
            >
              {nextStepLabel(step)}
            </ScButton>
          ) : step.kind === 'wait' ? (
            <p className="text-[14px] text-text-secondary">{step.text}</p>
          ) : (
            <ScButtonLink
              href={`/bookings/${b.id}`}
              variant={emphasis ? 'main' : 'outline'}
              size={emphasis ? 'lg' : 'md'}
              fullWidth
              aria-label={`${nextStepLabel(step)} for ${who}`}
            >
              {step.kind === 'photos' && (
                <IconCamera size={20} aria-hidden="true" />
              )}
              {step.kind === 'pickup' && (
                <IconCar size={20} aria-hidden="true" />
              )}
              {nextStepLabel(step)}
            </ScButtonLink>
          )}
        </div>
      )}
    </article>
  )
}

/** A step waiting behind its Undo, as the row's chip says it (0066 adds Accept and pickup's steps). */
const DEFERRED_CHIP: Record<NonNullable<ReturnType<typeof useDeferredStatus>>, string> = {
  confirmed: 'Accepted',
  in_progress: 'In progress',
  completed: 'Done',
  picked_up: 'Picked up',
  at_garage: 'At garage',
  out_for_delivery: 'Out for delivery',
}

function RowChip({
  booking: b,
  now,
  startsIn,
  deferred,
}: {
  booking: Booking
  now: number
  startsIn: number | null
  deferred: ReturnType<typeof useDeferredStatus>
}) {
  if (deferred) {
    return (
      <StatusChip tone={deferred === 'completed' ? 'done' : 'progress'}>
        {DEFERRED_CHIP[deferred]}
      </StatusChip>
    )
  }
  // An accepted job about to start says when, the way a garage plans its next hour.
  if (startsIn !== null && startsIn > 0 && startsIn <= 3 * 60 * 60 * 1000) {
    return (
      <span className="shrink-0 rounded-full border border-white/25 px-2.5 py-0.5 font-numeric text-[13px] font-medium text-text-primary">
        {formatRelative(b.scheduledAtIso, now)}
      </span>
    )
  }
  return (
    <StatusChip tone={bookingStatusTone(b.status)}>{statusLabel(b)}</StatusChip>
  )
}
