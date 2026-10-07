'use client'

import { use, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { IconMapPin } from '@tabler/icons-react'
import { bookingStatusBadge, ScBadge } from '@repo/ui/sc/badge'
import { ScButton } from '@repo/ui/sc/button'
import { ScCard } from '@repo/ui/sc/card'
import { ErrorState, SkeletonCard } from '@repo/ui/sc/empty-state'
import { ScSection } from '@repo/ui/sc/section'
import { TopBar } from '@repo/ui/sc/top-bar'
import type { AdminBookingDetail } from '@repo/core/api/admin'
import { errorMessage, isAuthError } from '@repo/core/api/hooks/use-discounts'
import { useAdminBooking } from '@repo/core/api/hooks/use-admin-bookings'
import { directionsHref } from '@repo/core/contact-links'
import { useNow } from '@repo/core/hooks/use-now'
import { formatDuration } from '@repo/core/utils'
import { NoShowBadge, WaitingBadge } from '@/components/booking-badges'
import { CopyButton } from '@/components/copy-button'
import { PhoneLink } from '@/components/phone-link'
import {
  bookingsListHref,
  canCancel,
  canMarkNoShow,
  cancellationLabel,
  formatClock,
  formatRupees,
  formatWhen,
  paymentStatusLabel,
} from '@/lib/bookings'
import { CancelBookingDialog, NoShowDialog } from './booking-actions'
import { NotesSection } from './notes-section'

function Field({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="min-w-0">
      <p className="text-[10px] font-medium uppercase tracking-wide text-text-muted">
        {label}
      </p>
      <div className="text-[13px] text-text-primary">{children}</div>
    </div>
  )
}

/** A link to another booking in the same reschedule chain. */
function BookingLink({ id }: { id: string }) {
  return (
    <Link
      href={`/bookings/${id}`}
      className="inline-flex min-h-11 items-center font-numeric font-medium text-text-primary underline underline-offset-2"
    >
      #{id.slice(0, 8).toUpperCase()}
    </Link>
  )
}

interface TimelineStep {
  label: React.ReactNode
  at?: string | null
  detail?: React.ReactNode
}

/**
 * What happened to the booking, in order. Accepting and starting record who
 * but not when, so those steps show no time rather than a made-up one.
 */
function buildTimeline(b: AdminBookingDetail): TimelineStep[] {
  const steps: TimelineStep[] = [{ label: 'Booked', at: b.createdAt }]

  if (b.rescheduledFromId) {
    steps.push({
      label: (
        <>
          Moved here from <BookingLink id={b.rescheduledFromId} />
        </>
      ),
    })
  }

  if (b.payment?.status === 'paid' || b.payment?.paidAt) {
    steps.push({ label: 'Paid online', at: b.payment.paidAt })
  }

  const accepted =
    b.acceptedByName !== null ||
    ['confirmed', 'in_progress', 'completed'].includes(b.status)
  if (accepted) {
    steps.push({
      label: 'Accepted by the garage',
      detail: b.acceptedByName ? `by ${b.acceptedByName}` : null,
    })
  }
  if (b.status === 'in_progress' || b.status === 'completed') {
    steps.push({ label: 'Started' })
  }
  if (b.status === 'completed') {
    steps.push({
      label: 'Completed',
      detail: b.completedByName ? `by ${b.completedByName}` : null,
    })
  }

  const cancelled = cancellationLabel(b)
  if (cancelled) {
    steps.push({
      label: cancelled,
      at: b.noShowMarkedAt ?? b.cancelledAt,
      detail: b.cancellationReason,
    })
  }

  if (b.rescheduledToId) {
    steps.push({
      label: (
        <>
          Moved to <BookingLink id={b.rescheduledToId} />
        </>
      ),
    })
  }

  return steps
}

function Timeline({ booking }: { booking: AdminBookingDetail }) {
  const steps = buildTimeline(booking)
  return (
    <ol className="flex flex-col">
      {steps.map((step, index) => (
        <li key={index} className="relative flex gap-3 pb-3 last:pb-0">
          {/* The rail between dots; the last step has nothing after it. */}
          {index < steps.length - 1 && (
            <span
              aria-hidden
              className="absolute left-[4px] top-3 h-full w-px bg-border"
            />
          )}
          <span
            aria-hidden
            className="mt-1.5 size-[9px] shrink-0 rounded-full bg-text-secondary"
          />
          <div className="min-w-0 text-[13px]">
            <p className="text-text-primary">{step.label}</p>
            {step.at && (
              <p className="font-numeric text-[12px] text-text-muted">
                {formatWhen(step.at)}
              </p>
            )}
            {step.detail && (
              <p className="text-[12px] text-text-secondary">{step.detail}</p>
            )}
          </div>
        </li>
      ))}
    </ol>
  )
}

function BookingDetail({
  booking: b,
  backHref,
  staleSince,
}: {
  booking: AdminBookingDetail
  backHref: string
  /** When the last refresh failed: the time of the data still on screen. */
  staleSince: number | null
}) {
  // Re-evaluated every 30 seconds, so "Mark no-show" appears on its own once
  // the start time passes with the page open.
  const now = useNow(30_000)
  const [dialog, setDialog] = useState<'cancel' | 'no-show' | null>(null)

  // After a cancel or no-show the button that opened the dialog is gone, so
  // focus would fall to the top of the page. It goes to the line saying what
  // happened instead, once the dialog has closed and the status has landed.
  const summaryRef = useRef<HTMLDivElement>(null)
  const focusSummary = useRef(false)
  useEffect(() => {
    if (focusSummary.current && dialog === null && b.status === 'cancelled') {
      focusSummary.current = false
      summaryRef.current?.focus()
    }
  }, [dialog, b.status])
  const onActionDone = () => {
    focusSummary.current = true
  }

  const badge = bookingStatusBadge(b.status)
  const showCancel = canCancel(b.status)
  const showNoShow = canMarkNoShow(b, now)
  const directions =
    b.bookingType === 'doorstep'
      ? directionsHref({
          lat: b.lat,
          lng: b.lng,
          address: b.address ?? undefined,
        })
      : null
  const discount = Number(b.discountAmount)

  return (
    <>
      <TopBar
        showBack
        backHref={backHref}
        title={`Booking #${b.reference}`}
        right={<ScBadge variant={badge.variant}>{badge.label}</ScBadge>}
      />

      {staleSince !== null && (
        <p role="status" className="text-[12px] text-error">
          Couldn&apos;t refresh. Showing the booking as of{' '}
          <span className="font-numeric">{formatClock(staleSince)}</span>.
        </p>
      )}

      <div className="grid gap-4 md:grid-cols-[3fr_2fr] md:items-start">
        <div className="flex flex-col gap-4">
          <ScCard className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center gap-1.5">
              {b.waitingMins !== null && <WaitingBadge mins={b.waitingMins} />}
              {b.noShow && <NoShowBadge party={b.noShow} />}
            </div>
            <p className="font-numeric text-[20px] font-semibold text-text-primary">
              {formatWhen(b.scheduledAt)}
            </p>
            <p className="text-[13px] text-text-secondary">
              {b.bookingType === 'doorstep' ? 'Doorstep' : 'At the garage'} ·{' '}
              <span className="font-numeric">
                {formatDuration(b.durationMins)}
              </span>
            </p>
            {b.status === 'cancelled' && (
              <div
                ref={summaryRef}
                tabIndex={-1}
                className="mt-1 border-t border-border pt-2 focus:outline-none"
              >
                <p className="text-[13px] font-medium text-text-primary">
                  {cancellationLabel(b)}
                </p>
                {b.cancellationReason && (
                  <p className="mt-0.5 text-[12px] text-text-secondary">
                    {b.cancellationReason}
                  </p>
                )}
              </div>
            )}
          </ScCard>

          <ScSection title="People">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Customer">
                <p>{b.customer?.name ?? '—'}</p>
                {b.customer && (
                  <PhoneLink phone={b.customer.phone} name={b.customer.name} />
                )}
              </Field>
              <Field label="Garage">
                <p>{b.garage?.name ?? '—'}</p>
                {b.garage && (
                  <PhoneLink phone={b.garage.phone} name={b.garage.name} />
                )}
                {b.garageAddress && (
                  <p className="text-[12px] text-text-secondary">
                    {b.garageAddress}
                  </p>
                )}
              </Field>
              <Field label="Car">
                <p>
                  {b.vehicle ? `${b.vehicle.make} ${b.vehicle.model}` : '—'}
                </p>
                {b.vehicle?.plate && (
                  <p className="font-numeric text-[12px] text-text-secondary">
                    {b.vehicle.plate}
                  </p>
                )}
              </Field>
              {b.bookingType === 'doorstep' && (
                <Field label="Doorstep address">
                  <p>{b.address ?? 'Address missing'}</p>
                  {directions && (
                    <a
                      href={directions}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex min-h-11 items-center gap-1 text-[12px] text-text-secondary underline-offset-2 hover:underline"
                    >
                      <IconMapPin size={13} aria-hidden /> Open in Maps
                    </a>
                  )}
                </Field>
              )}
            </div>
          </ScSection>

          <ScSection title="Services and payment">
            <ul className="flex flex-col gap-1.5">
              {b.items.map((item) => (
                <li
                  key={item.id}
                  className="flex justify-between gap-3 text-[13px]"
                >
                  <span className="text-text-primary">{item.name}</span>
                  <span className="font-numeric text-text-secondary">
                    {formatRupees(item.amount)}
                  </span>
                </li>
              ))}
              {discount > 0 && (
                <li className="flex justify-between gap-3 text-[13px]">
                  <span className="text-text-secondary">
                    {b.discountCode ?? 'Discount'} ·{' '}
                    {b.discountFundedBy === 'platform'
                      ? 'Detlio funded'
                      : 'Garage funded'}
                  </span>
                  <span className="font-numeric text-text-secondary">
                    −{formatRupees(discount)}
                  </span>
                </li>
              )}
              <li className="flex justify-between gap-3 border-t border-border pt-1.5 text-[13px] font-semibold">
                <span className="text-text-primary">Total</span>
                <span className="font-numeric text-text-primary">
                  {formatRupees(b.amount)}
                </span>
              </li>
            </ul>

            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Payment">
                <p>{paymentStatusLabel(b.payment?.status)}</p>
              </Field>
              {b.payment?.gatewayTxnId && (
                <Field label="Razorpay payment id">
                  <div className="flex min-w-0 items-center">
                    <span className="truncate font-numeric">
                      {b.payment.gatewayTxnId}
                    </span>
                    <CopyButton
                      value={b.payment.gatewayTxnId}
                      label={`Copy Razorpay payment id ${b.payment.gatewayTxnId}`}
                      className="-my-2 shrink-0"
                    />
                  </div>
                </Field>
              )}
            </div>
          </ScSection>

          <ScSection title="Timeline">
            <Timeline booking={b} />
          </ScSection>
        </div>

        <div className="flex flex-col gap-4">
          {(showCancel || showNoShow) && (
            <ScSection title="Actions">
              <div className="flex flex-col gap-2">
                {showNoShow && (
                  <ScButton
                    variant="secondary"
                    onClick={() => setDialog('no-show')}
                    className="min-h-11"
                  >
                    Mark no-show…
                  </ScButton>
                )}
                {showCancel && (
                  <ScButton
                    variant="secondary"
                    onClick={() => setDialog('cancel')}
                    className="min-h-11"
                  >
                    Cancel booking…
                  </ScButton>
                )}
              </div>
              {!showNoShow &&
                (b.status === 'confirmed' || b.status === 'in_progress') && (
                  <p className="text-[12px] text-text-muted">
                    A no-show can be marked once the start time has passed.
                  </p>
                )}
            </ScSection>
          )}

          <NotesSection bookingId={b.id} notes={b.notes} />
        </div>
      </div>

      <CancelBookingDialog
        booking={b}
        open={dialog === 'cancel'}
        onClose={() => setDialog(null)}
        onDone={onActionDone}
      />
      <NoShowDialog
        booking={b}
        open={dialog === 'no-show'}
        onClose={() => setDialog(null)}
        onDone={onActionDone}
      />
    </>
  )
}

export default function AdminBookingDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const { id } = use(params)
  // The list's filters ride along in `back`, so the arrow returns to the same
  // search rather than the whole list.
  const { back } = use(searchParams)
  const backHref = bookingsListHref(typeof back === 'string' ? back : null)
  const router = useRouter()
  const {
    data: booking,
    isPending,
    error,
    refetch,
    dataUpdatedAt,
  } = useAdminBooking(id)

  // A dead admin session is a redirect, not an error message.
  useEffect(() => {
    if (isAuthError(error)) router.replace('/login')
  }, [error, router])

  if (!booking) {
    return (
      <>
        <TopBar showBack backHref={backHref} title="Booking" />
        {isPending ? (
          <div className="flex flex-col gap-2">
            <SkeletonCard />
            <SkeletonCard />
          </div>
        ) : (
          <ErrorState
            message={errorMessage(error, 'Failed to load this booking')}
            onRetry={() => void refetch()}
          />
        )}
      </>
    )
  }

  // A failed background refresh keeps the booking on screen. Swapping it for
  // an error would unmount a half-typed note or an open cancel dialog on one
  // dropped connection.
  return (
    <BookingDetail
      booking={booking}
      backHref={backHref}
      staleSince={error ? dataUpdatedAt : null}
    />
  )
}
