'use client'

import Link from 'next/link'
import { useParams } from 'next/navigation'
import {
  IconArrowLeft,
  IconBrandWhatsapp,
  IconCheck,
  IconChevronDown,
  IconCircle,
  IconLock,
  IconPhone,
} from '@tabler/icons-react'
import { AppShell } from '@repo/ui/sc/app-shell'
import { ScButton } from '@repo/ui/sc/button'
import { EmptyState } from '@repo/ui/sc/empty-state'
import { LoadError } from '@repo/ui/sc/load-error'
import { SkeletonList } from '@repo/ui/sc/skeleton'
import { Stars } from '@repo/ui/sc/stars'
import { StatusChip } from '@repo/ui/sc/status-chip'
import { BeforeAfterCompare } from '@repo/ui/features/before-after'
import { BOOKING_TYPE_LABELS, bookingReference } from '@repo/core/booking-types'
import { telHref, whatsAppHref } from '@repo/core/contact-links'
import { contactWindowState } from '@repo/core/contact-window'
import { formatWhen } from '@repo/core/format'
import { useNow } from '@repo/core/hooks/use-now'
import { jobStepTimes } from '@repo/core/job-records'
import { pickupTimeline } from '@repo/core/pickup'
import { bookingStatusTone } from '@repo/core/status-tone'
import type { Booking } from '@repo/core/types'
import { cn } from '@repo/core/utils'
import { ExtraWorkPanel } from '@/components/extra-work'
import { FinalBillPanel } from '@/components/final-bill'
import { JobContact } from '@/components/job-contact'
import { JobPhotos } from '@/components/job-photos'
import { NewBookingCard } from '@/components/new-booking-card'
import { PickupSteps } from '@/components/pickup-steps'
import { changeStatusWithUndo, useDeferredStatus } from '@/lib/deferred-status'
import { cancelledLabel, statusLabel } from '@/lib/job-words'
import {
  blockers,
  photoCount,
  photosOpen,
  photoStage,
  progressIndex,
  PROGRESS_STEPS,
  servicesLine,
} from '@/lib/jobs'
import { useVendorBookings } from '@/lib/use-vendor-bookings'

/**
 * One job, one screen, one next step (UX audit, garage finding 10; mockup
 * 03). Opened from a job's row on Today, Later or Done, or from a new
 * booking's details. No bottom tabs: the screen is for this one job.
 *
 *   who, when and the reference, with Call and WhatsApp in the header while
 *   the contact window is open; the car and plate, big
 *   a progress line: Accepted → Before → Working → After → Done
 *   only the photo step in hand, as two big tiles
 *   Extra work and Final bill as two rows that open their sheets
 *   where the job is (Maps), and Detlio support outside the window
 *   Start job / Complete job docked at the thumb, with what's missing listed
 *   beside it when it can't be pressed
 */
export default function JobPage() {
  const { id } = useParams<{ id: string }>()
  const { bookings, loaded, failed, retrying, reload } = useVendorBookings()
  const now = useNow(10_000)
  const booking = bookings.find((b) => b.id === id)

  if (!booking) {
    return (
      <AppShell navType="vendor" className="gap-4 py-4">
        <BackLink />
        {!loaded ? (
          <SkeletonList count={3} itemClassName="h-32" />
        ) : failed ? (
          <LoadError what="this job" onRetry={reload} retrying={retrying} />
        ) : (
          <EmptyState
            title="This job isn't on your list"
            subtitle="It may belong to another garage, or the link is old."
          />
        )}
      </AppShell>
    )
  }

  return <Job booking={booking} now={now} onChanged={reload} />
}

function BackLink() {
  return (
    <Link
      href="/bookings"
      aria-label="Back to bookings"
      className="press flex size-12 shrink-0 items-center justify-center rounded-full border border-white/20 text-text-primary"
    >
      <IconArrowLeft size={22} aria-hidden="true" />
    </Link>
  )
}

function Job({
  booking: b,
  now,
  onChanged,
}: {
  booking: Booking
  now: number
  onChanged: () => void
}) {
  const deferred = useDeferredStatus(b.id)
  const who = b.customerName || 'the customer'
  const ended = b.status === 'cancelled' || b.status === 'rescheduled'
  const contactOpen =
    !ended && contactWindowState(b.contactWindow, now) === 'open'
  const callHref = contactOpen ? telHref(b.customerPhone) : null
  const firstName = b.customerName?.trim().split(/\s+/)[0]
  const chatHref = contactOpen
    ? whatsAppHref(
        b.customerPhone,
        // Says who is writing: the customer has never seen this number.
        `Hi${firstName ? ` ${firstName}` : ''}, this is ${b.vendorName || 'your garage'} about your Detlio booking for ${b.scheduledAt}.`
      )
    : null
  const working = b.status === 'confirmed' || b.status === 'in_progress'
  const stepTimes = b.status !== 'pending' ? jobStepTimes(b, now) : []
  const stage = photoStage(b)
  const docked = working && !ended
  const shownStatus: Booking['status'] =
    deferred === 'completed'
      ? 'completed'
      : deferred === 'in_progress'
        ? 'in_progress'
        : b.status

  return (
    <AppShell
      navType="vendor"
      className={cn(
        'gap-5 py-4',
        docked && 'pb-[calc(13rem+env(safe-area-inset-bottom))]'
      )}
    >
      <header className="flex items-start gap-3">
        <BackLink />
        <div className="min-w-0 flex-1">
          <h1
            title={b.customerName}
            className="line-clamp-2 break-words text-[22px] font-semibold leading-tight text-text-primary"
          >
            {who}
          </h1>
          <p className="font-numeric text-[15px] text-text-secondary">
            {formatWhen(b.scheduledAtIso, now)} · #{bookingReference(b.id)}
          </p>
        </div>
        {/* Only inside the contact window, as the server sends the number. */}
        {callHref && (
          <a
            href={callHref}
            aria-label={`Call ${who}`}
            className="press flex size-12 shrink-0 items-center justify-center rounded-full border border-white/20 text-text-primary"
          >
            <IconPhone size={22} aria-hidden="true" />
          </a>
        )}
        {chatHref && (
          <a
            href={chatHref}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`WhatsApp ${who}`}
            className="press flex size-12 shrink-0 items-center justify-center rounded-full border border-white/20 text-[#25D366]"
          >
            <IconBrandWhatsapp size={22} aria-hidden="true" />
          </a>
        )}
      </header>

      <section className="flex flex-col gap-1">
        <div className="flex items-start justify-between gap-3">
          {b.vehicle ? (
            <p className="text-[20px] font-semibold text-text-primary">
              {b.vehicle.make} {b.vehicle.model} ·{' '}
              <span className="whitespace-nowrap font-numeric tracking-wide">
                {b.vehicle.plate}
              </span>
            </p>
          ) : (
            <span />
          )}
          <StatusChip tone={bookingStatusTone(shownStatus)} size="md">
            {statusLabel({ ...b, status: shownStatus })}
          </StatusChip>
        </div>
        <p className="text-[16px] text-text-secondary">
          {servicesLine(b)} · {BOOKING_TYPE_LABELS[b.bookingType]}
        </p>
        {stepTimes.length > 0 && (
          <p className="font-numeric text-[14px] text-text-secondary">
            {stepTimes.join(' · ')}
          </p>
        )}
      </section>

      {b.status === 'pending' && (
        <NewBookingCard booking={b} now={now} onChanged={onChanged} onPage />
      )}

      {(working || b.status === 'completed') && (
        <Progress booking={b} deferred={deferred} />
      )}

      {working && (
        <section className="rounded-[20px] border border-border bg-surface p-4">
          <JobPhotos
            booking={b}
            stage={stage}
            onChanged={onChanged}
            readOnly={!photosOpen(b, stage, now)}
          />
          {b.photoStandard?.required && b.photoStandard.waived && (
            <p className="mt-3 text-[13px] text-text-secondary">
              Detlio waived the photos for this job: Start and Complete
              don&apos;t wait for them.
            </p>
          )}
          {stage === 'after' && (
            // The car as it came in, folded away while the work goes on.
            <details className="mt-4 border-t border-border pt-3">
              <summary className="flex min-h-12 cursor-pointer list-none items-center gap-1 text-[15px] font-medium text-text-primary">
                Before photos ·
                <span className="font-numeric">
                  {photoCount(b, 'before').have}
                </span>
                <IconChevronDown
                  size={18}
                  aria-hidden="true"
                  className="ml-auto text-text-secondary"
                />
              </summary>
              <JobPhotos
                booking={b}
                stage="before"
                onChanged={onChanged}
                readOnly={!photosOpen(b, 'before', now)}
              />
            </details>
          )}
        </section>
      )}

      {b.status === 'completed' && (
        <section className="flex flex-col gap-4">
          {/* Done shows the finished job beside how it came in, once (finding 11). */}
          <BeforeAfterCompare photos={b.jobPhotos} />
          {photosOpen(b, 'after', now) && (
            <JobPhotos booking={b} stage="after" onChanged={onChanged} />
          )}
        </section>
      )}

      {(working ||
        b.status === 'completed' ||
        b.extraWork.length > 0 ||
        b.finalBill) && (
        <section className="divide-y divide-border overflow-hidden rounded-[20px] border border-border bg-surface empty:hidden">
          <ExtraWorkPanel booking={b} onChanged={onChanged} />
          {(b.status === 'in_progress' ||
            b.status === 'completed' ||
            b.finalBill) && (
            <FinalBillPanel booking={b} onChanged={onChanged} />
          )}
        </section>
      )}

      {b.status === 'completed' && b.review && (
        <section className="rounded-[20px] border border-border bg-surface p-4">
          <div className="flex items-center gap-2">
            <Stars rating={b.review.rating} size={16} />
            <span className="font-numeric text-[15px] font-semibold text-text-primary">
              {b.review.rating}
            </span>
          </div>
          {b.review.comment && (
            <p className="mt-1 text-[15px] text-text-secondary">
              {b.review.comment}
            </p>
          )}
        </section>
      )}

      {ended && (
        <section className="rounded-[20px] border border-border bg-surface p-4">
          <p className="text-[16px] font-medium text-text-primary">
            {cancelledLabel(b)}
          </p>
          {/* The label says it all for a missed answer (its reason is the same words). */}
          {b.cancellationReason && !b.notAcceptedInTime && (
            <p className="mt-1 text-[15px] text-text-secondary">
              {b.cancellationReason}
            </p>
          )}
        </section>
      )}

      {/* Where the job is, and how to reach the customer outside the window. */}
      <JobContact booking={b} now={now} callButtons={false} />

      {docked && (
        <DockedStep booking={b} deferred={deferred} onChanged={onChanged} />
      )}
    </AppShell>
  )
}

const STEP_STATE_WORDS = {
  done: 'done',
  current: 'now',
  upcoming: 'to come',
} as const

/** Accepted → Before → Working → After → Done, or pickup & drop's own steps. */
function Progress({
  booking: b,
  deferred,
}: {
  booking: Booking
  deferred: ReturnType<typeof useDeferredStatus>
}) {
  const pickup = b.bookingType === 'pickup' ? pickupTimeline(b) : null
  const steps = pickup
    ? pickup.map((step) => ({ label: step.label, state: step.state }))
    : PROGRESS_STEPS.map((label, i) => {
        const current =
          deferred === 'completed'
            ? PROGRESS_STEPS.length
            : deferred === 'in_progress'
              ? 2
              : (progressIndex(b) ?? 0)
        return {
          label,
          state: i < current ? 'done' : i === current ? 'current' : 'upcoming',
        } as const
      })
  return (
    <ol aria-label="Job progress" className="flex items-start">
      {steps.map((step, i) => (
        <li
          key={step.label}
          // Named with its state ("Before: done"), and the one in hand is the
          // current step, so the line reads the same without the picture.
          aria-label={`${step.label}: ${STEP_STATE_WORDS[step.state]}`}
          aria-current={step.state === 'current' ? 'step' : undefined}
          className="relative flex flex-1 flex-col items-center gap-1.5 text-center"
        >
          {i > 0 && (
            <span
              aria-hidden="true"
              className={cn(
                'absolute right-1/2 top-[15px] h-0.5 w-full -translate-x-[16px]',
                step.state === 'upcoming' ? 'bg-border' : 'bg-text-primary'
              )}
            />
          )}
          <span
            className={cn(
              'relative z-10 flex size-8 items-center justify-center rounded-full',
              step.state === 'done' && 'bg-text-primary text-brand-black',
              step.state === 'current' &&
                'border-2 border-tone-progress-dot bg-brand-black text-tone-progress-dot',
              step.state === 'upcoming' &&
                'border-2 border-border bg-brand-black'
            )}
          >
            {step.state === 'done' ? (
              <IconCheck size={16} stroke={3} aria-hidden="true" />
            ) : step.state === 'current' ? (
              <span
                aria-hidden="true"
                className="size-3 rounded-full bg-tone-progress-dot"
              />
            ) : null}
          </span>
          <span
            className={cn(
              'text-[13px] leading-tight',
              step.state === 'upcoming'
                ? 'text-text-secondary'
                : 'font-medium text-text-primary'
            )}
          >
            {step.label}
          </span>
        </li>
      ))}
    </ol>
  )
}

/**
 * The one button at the thumb: Start job, then Complete job, each with five
 * seconds of Undo. When it can't be pressed it stays readable, in grey, with
 * what's missing listed above it. Pickup & drop's step (with its code) sits
 * here instead.
 */
function DockedStep({
  booking: b,
  deferred,
  onChanged,
}: {
  booking: Booking
  deferred: ReturnType<typeof useDeferredStatus>
  onChanged: () => void
}) {
  const who = b.customerName || 'the customer'
  const action = b.status === 'confirmed' ? 'start' : 'complete'
  const missing = blockers(b, action)

  return (
    <div className="fixed inset-x-0 bottom-0 z-30 mx-auto w-full max-w-[428px] border-t border-border bg-brand-black/95 px-4 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-3 backdrop-blur">
      {/* A step waiting behind its Undo, or on its way, holds every
          button here, pickup's included: no second tap. */}
      {deferred ? (
        <p
          role="status"
          className="flex min-h-14 items-center justify-center text-[16px] font-medium text-text-primary"
        >
          {deferred === 'in_progress'
            ? 'Starting the job…'
            : 'Completing the job…'}
        </p>
      ) : b.bookingType === 'pickup' ? (
        <PickupSteps
          booking={b}
          onStartWork={() => changeStatusWithUndo(b.id, 'in_progress')}
          onChanged={onChanged}
        />
      ) : (
        <div className="flex flex-col gap-3">
          {missing.length > 0 && (
            <ul
              id={`job-${b.id}-missing`}
              aria-label="Still to do"
              className="flex flex-col gap-2"
            >
              {missing.map((line) => (
                <li
                  key={line}
                  className="flex items-center gap-2.5 text-[16px] text-text-primary"
                >
                  <IconCircle
                    size={22}
                    stroke={2.2}
                    aria-hidden="true"
                    className="shrink-0 text-warning"
                  />
                  {line}
                </li>
              ))}
            </ul>
          )}
          {action === 'start' ? (
            <ScButton
              variant="main"
              size="lg"
              disabled={missing.length > 0}
              aria-describedby={
                missing.length > 0 ? `job-${b.id}-missing` : undefined
              }
              aria-label={`Start job for ${who}`}
              onClick={() => changeStatusWithUndo(b.id, 'in_progress')}
            >
              {missing.length > 0 && <IconLock size={20} aria-hidden="true" />}
              Start job
            </ScButton>
          ) : (
            <ScButton
              variant="main"
              size="lg"
              disabled={missing.length > 0}
              aria-describedby={
                missing.length > 0 ? `job-${b.id}-missing` : undefined
              }
              aria-label={`Complete job for ${who}`}
              onClick={() => changeStatusWithUndo(b.id, 'completed')}
            >
              {missing.length > 0 && <IconLock size={20} aria-hidden="true" />}
              Complete job
            </ScButton>
          )}
        </div>
      )}
    </div>
  )
}
