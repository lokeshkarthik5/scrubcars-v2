'use client'

import Link from 'next/link'
import { IconCamera, IconCar, IconChevronRight } from '@tabler/icons-react'
import { useT } from '@repo/core/i18n'
import { msg } from '@repo/core/i18n/translate'
import { ScButton } from '@repo/ui/sc/button'
import { ScButtonLink } from '@repo/ui/sc/button-link'
import { StatusChip } from '@repo/ui/sc/status-chip'
import { NumberPlate } from '@repo/ui/finish/number-plate'
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
  const t = useT()
  const deferred = useDeferredStatus(b.id)
  const who = b.customerName || t('the customer')
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
      aria-label={t('Job for {who}', { who })}
      className={cn(
        'hub-card relative scroll-mt-4 px-5 pt-4 pb-5',
        // The job under way keeps its blue edge (garage mockup 02).
        emphasis &&
          'border-tone-progress-dot/60 shadow-[inset_3px_0_0_var(--color-tone-progress-dot)]'
      )}
    >
      <div className="flex items-start justify-between gap-3">
        {/* The time, large and light, with am/pm small beside it. */}
        <p className="flex min-w-0 items-baseline gap-1 font-numeric text-text-primary">
          <span className="text-[38px] leading-none font-light tracking-[-0.035em]">
            {clock}
          </span>
          <span className="text-[14px] text-dim">{meridiem}</span>
        </p>
        <span className="relative z-10 mt-1 flex shrink-0 items-center gap-2">
          <RowChip
            booking={b}
            now={now}
            startsIn={startsIn}
            deferred={deferred}
          />
          {!step && (
            <IconChevronRight
              size={16}
              aria-hidden="true"
              className="shrink-0 text-text-muted"
            />
          )}
        </span>
      </div>
      {/* The name is the card's link: the whole card is its target. */}
      <Link
        href={`/bookings/${b.id}`}
        className="mt-2.5 block min-w-0 truncate text-[18px] text-text-primary after:absolute after:inset-0 after:rounded-[28px] after:content-['']"
      >
        {shortName(b.customerName)}
      </Link>
      {b.vehicle && (
        <p className="mt-1 flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-1 text-t4 text-text-secondary">
          <span className="min-w-0 truncate">
            {b.vehicle.make} {b.vehicle.model} ·
          </span>
          <NumberPlate plate={b.vehicle.plate} size="sm" />
        </p>
      )}
      <p className="mt-1 truncate text-t4 text-dim">
        {servicesLine(b)} · {t(BOOKING_TYPE_LABELS[b.bookingType])}
      </p>
      {dayOff && b.status !== 'completed' && (
        <p className="mt-1 text-t4 text-text-secondary">
          {t(cancelledLabel(b))}
        </p>
      )}

      {step && (
        // Above the card's link, so a tap on the button is the button's.
        <div className="relative z-10 mt-3.5">
          {step.kind === 'start' || step.kind === 'complete' ? (
            <ScButton
              variant={emphasis ? 'main' : 'outline'}
              size="md"
              fullWidth
              className={cn('rounded-full', !emphasis && 'border-line bg-white/[0.04]')}
              aria-label={t('{action} for {who}', { action: nextStepLabel(step), who })}
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
            <p className="text-t4 text-text-secondary">{step.text}</p>
          ) : (
            <ScButtonLink
              href={`/bookings/${b.id}`}
              variant={emphasis ? 'main' : 'outline'}
              size="md"
              fullWidth
              className={cn('rounded-full', !emphasis && 'border-line bg-white/[0.04]')}
              aria-label={t('{action} for {who}', { action: nextStepLabel(step), who })}
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
  confirmed: msg('Accepted'),
  in_progress: msg('In progress'),
  completed: msg('Done'),
  picked_up: msg('Picked up'),
  at_garage: msg('At garage'),
  out_for_delivery: msg('Out for delivery'),
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
  const t = useT()
  if (deferred) {
    return (
      <StatusChip tone={deferred === 'completed' ? 'done' : 'progress'}>
        {t(DEFERRED_CHIP[deferred])}
      </StatusChip>
    )
  }
  // An accepted job about to start says when, the way a garage plans its next hour.
  if (startsIn !== null && startsIn > 0 && startsIn <= 3 * 60 * 60 * 1000) {
    return (
      <span className="shrink-0 rounded-full border border-line px-2.5 py-1 font-numeric text-[12px] leading-none text-[#E4E4E7]">
        {formatRelative(b.scheduledAtIso, now)}
      </span>
    )
  }
  return (
    <StatusChip tone={bookingStatusTone(b.status)}>{t(statusLabel(b))}</StatusChip>
  )
}
