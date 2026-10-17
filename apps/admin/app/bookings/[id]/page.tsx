'use client'

import { use, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'react-toastify'
import { IconMapPin } from '@tabler/icons-react'
import { bookingStatusBadge, ScBadge } from '@repo/ui/sc/badge'
import { ScButton } from '@repo/ui/sc/button'
import { ScCard } from '@repo/ui/sc/card'
import { ErrorState } from '@repo/ui/sc/empty-state'
import { PageHeader } from '@repo/ui/sc/page-header'
import { ScSection } from '@repo/ui/sc/section'
import { SkeletonList } from '@repo/ui/sc/skeleton'
import { ScSwitch } from '@repo/ui/sc/switch'
import type { AdminBookingDetail } from '@repo/core/api/admin'
import { errorMessage, isAuthError } from '@repo/core/api/hooks/use-discounts'
import { useAdminBooking } from '@repo/core/api/hooks/use-admin-bookings'
import {
  useDataResetConfig,
  useSetAdminBookingTestMark,
} from '@repo/core/api/hooks/use-admin-data-reset'
import { directionsHref } from '@repo/core/contact-links'
import { useNow } from '@repo/core/hooks/use-now'
import { formatDuration } from '@repo/core/utils'
import {
  BillDueBadge,
  NoShowBadge,
  RefundedBadge,
  RefundOwedBadge,
  TestBadge,
  TestModePaymentBadge,
  WaitingBadge,
} from '@/components/booking-badges'
import { DeleteTestBookingDialog } from '@/components/delete-test-booking-dialog'
import { FinalBillSection, JobPhotosSection } from './job-records'
import { CopyButton } from '@/components/copy-button'
import { Meta } from '@/components/meta'
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
import { CancelBookingDialog, NoShowDialog, PickupStepDialog } from './booking-actions'
import { BOOKING_TYPE_LABELS } from '@repo/core/booking-types'
import { MAX_CODE_ATTEMPTS } from '@repo/core/pickup'
import type { BookingType } from '@repo/core/types'
import { NotesSection } from './notes-section'
import { RefundSection } from './refund-section'

/** A labelled value on this page, a size up from the lists' — see Meta. */
function Field({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <Meta label={label} size="md">
      {children}
    </Meta>
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
 * What happened to the booking, in order. Each step shows when it happened
 * where that was recorded; jobs from before accept/start/complete times were
 * kept show those steps with no time rather than a made-up one.
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
      at: b.acceptedAt,
      detail: b.acceptedByName ? `by ${b.acceptedByName}` : null,
    })
  }
  // Pickup & drop's handover, in its place around the work; a step Detlio
  // confirmed without the customer's code says who.
  const pickup = b.pickup
  if (pickup?.pickedUpAt) {
    steps.push({
      label: 'Picked up from the customer',
      at: pickup.pickedUpAt,
      detail: pickup.pickupOverrideBy
        ? `confirmed by ${pickup.pickupOverrideBy} without the code`
        : 'with the customer’s code',
    })
  }
  if (pickup?.atGarageAt) steps.push({ label: 'At the garage', at: pickup.atGarageAt })
  if (b.startedAt || b.status === 'in_progress' || b.status === 'completed') {
    steps.push({ label: 'Started', at: b.startedAt })
  }
  if (pickup?.outForDeliveryAt) {
    steps.push({ label: 'Out for delivery', at: pickup.outForDeliveryAt })
  }
  if (pickup?.deliveredAt) {
    steps.push({
      label: 'Delivered to the customer',
      at: pickup.deliveredAt,
      detail: pickup.deliveryOverrideBy
        ? `confirmed by ${pickup.deliveryOverrideBy} without the code`
        : 'with the customer’s code',
    })
  }
  if (b.completedAt || b.status === 'completed') {
    steps.push({
      label: 'Completed',
      at: b.completedAt,
      detail: b.completedByName ? `by ${b.completedByName}` : null,
    })
  }
  if (b.finalBill?.status === 'paid' && b.finalBill.paidAt) {
    steps.push({ label: 'Final bill paid in the app', at: b.finalBill.paidAt })
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

  // Each refund recorded, at the latest time it was recorded. Part refunds
  // before it are in the notes.
  for (const refund of b.refunds ?? []) {
    if (!refund.refundedAt || Number(refund.amountRefunded) <= 0) continue
    steps.push({
      label: (
        <>
          Refunded{' '}
          <span className="font-numeric">{formatRupees(refund.amountRefunded)}</span>
          {refund.kind === 'bill' ? ' of a final bill payment' : ''}
        </>
      ),
      at: refund.refundedAt,
      detail: refund.refundedBy ? `recorded by ${refund.refundedBy}` : null,
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

/**
 * The "Test" mark, and deleting a marked booking while Start pilot clean is
 * switched on. The mark only takes the booking out of the pilot numbers;
 * slots, refunds and receipts never read it.
 */
function TestBookingSection({
  booking: b,
  onDelete,
}: {
  booking: AdminBookingDetail
  onDelete: () => void
}) {
  const setMark = useSetAdminBookingTestMark()
  const { data: resetConfig } = useDataResetConfig()
  const marked = Boolean(b.markedTest)

  const change = (next: boolean) =>
    setMark.mutate(
      { id: b.id, marked: next },
      {
        onSuccess: () =>
          toast.success(next ? `#${b.reference} marked as a test booking` : 'Test mark removed'),
        onError: (err) => toast.error(errorMessage(err, "Couldn't change the test mark")),
      }
    )

  return (
    <ScSection title="Test booking">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0 text-[13px]">
          <p className="text-text-primary">Mark as test</p>
          <p className="text-[12px] text-text-secondary">
            {marked
              ? `Left out of the pilot numbers${b.markedTest?.by ? `. Marked by ${b.markedTest.by}` : ''}.`
              : 'Turn on for a booking the team made to try things out. It is then left out of the pilot numbers.'}
          </p>
        </div>
        <ScSwitch
          label="Mark as test"
          checked={marked}
          disabled={setMark.isPending}
          onChange={change}
        />
      </div>
      {marked && resetConfig?.enabled && (
        <ScButton variant="secondary" onClick={onDelete} className="min-h-11">
          Delete test booking…
        </ScButton>
      )}
    </ScSection>
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
  const [dialog, setDialog] = useState<
    'cancel' | 'no-show' | 'delete-test' | 'picked_up' | 'delivered' | null
  >(null)
  const router = useRouter()

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
  // The pickup step Detlio can confirm now, for a customer without the code:
  // the same order the garage follows (lib/pickup.ts on the server).
  const pickupOverride: 'picked_up' | 'delivered' | null =
    b.pickup && b.status === 'confirmed' && !b.pickup.pickedUpAt
      ? 'picked_up'
      : b.pickup && b.status === 'in_progress' && b.pickup.outForDeliveryAt && !b.pickup.deliveredAt
        ? 'delivered'
        : null
  const directions =
    b.bookingType === 'doorstep' || b.bookingType === 'pickup'
      ? directionsHref({
          lat: b.lat,
          lng: b.lng,
          address: b.address ?? undefined,
        })
      : null
  const discount = Number(b.discountAmount)

  return (
    <>
      <PageHeader
        backHref={backHref}
        title={`Booking #${b.reference}`}
        actions={<ScBadge variant={badge.variant}>{badge.label}</ScBadge>}
      />

      {staleSince !== null && (
        <p role="status" className="text-[12px] text-error">
          Couldn&apos;t refresh. Showing the booking as of{' '}
          <span className="font-numeric">{formatClock(staleSince)}</span>.
        </p>
      )}

      <div className="grid gap-4 md:grid-cols-[3fr_2fr] md:items-start">
        <div className="flex flex-col gap-4">
          <ScCard className="flex flex-col gap-2 px-4 py-4">
            <div className="flex flex-wrap items-center gap-1.5 empty:hidden">
              {b.markedTest && <TestBadge />}
              {(b.payment?.gatewayMode === 'test' || b.payment?.gatewayMode === 'fake') && (
                <TestModePaymentBadge />
              )}
              {b.waitingMins !== null && <WaitingBadge mins={b.waitingMins} />}
              {b.noShow && <NoShowBadge party={b.noShow} />}
              {b.billDue && <BillDueBadge amount={b.billDue} />}
              {b.refundOwed ? (
                <RefundOwedBadge amount={b.refundOwed} />
              ) : (
                b.refunded && <RefundedBadge />
              )}
            </div>
            <p className="font-numeric text-[20px] font-bold tracking-tight text-text-primary">
              {formatWhen(b.scheduledAt)}
            </p>
            <p className="text-[13px] text-text-secondary">
              {BOOKING_TYPE_LABELS[b.bookingType as BookingType] ?? 'At garage'} ·{' '}
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
              {(b.bookingType === 'doorstep' || b.bookingType === 'pickup') && (
                <Field label={b.bookingType === 'pickup' ? 'Pickup & return address' : 'Doorstep address'}>
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

          <RefundSection booking={b} now={now} />

          <FinalBillSection booking={b} />

          <ScSection title="Timeline">
            <Timeline booking={b} />
          </ScSection>

          <JobPhotosSection booking={b} />
        </div>

        <div className="flex flex-col gap-4">
          {(showCancel || showNoShow || pickupOverride) && (
            <ScSection title="Actions">
              <div className="flex flex-col gap-2">
                {pickupOverride && (
                  <ScButton
                    variant="secondary"
                    onClick={() => setDialog(pickupOverride)}
                    className="min-h-11"
                  >
                    {pickupOverride === 'picked_up' ? 'Confirm picked up…' : 'Confirm delivered…'}
                  </ScButton>
                )}
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
              {pickupOverride && (
                <p className="text-[12px] text-text-muted">
                  For a customer who can’t give the{' '}
                  {pickupOverride === 'picked_up' ? 'pickup' : 'delivery'} code.
                  {b.pickup &&
                    ` ${
                      pickupOverride === 'picked_up'
                        ? b.pickup.pickupCodeTriesLeft
                        : b.pickup.deliveryCodeTriesLeft
                    } of ${MAX_CODE_ATTEMPTS} garage tries left.`}
                </p>
              )}
              {!showNoShow &&
                (b.status === 'confirmed' || b.status === 'in_progress') && (
                  <p className="text-[12px] text-text-muted">
                    A no-show can be marked once the start time has passed.
                  </p>
                )}
            </ScSection>
          )}

          <TestBookingSection booking={b} onDelete={() => setDialog('delete-test')} />

          <NotesSection bookingId={b.id} notes={b.notes} />
        </div>
      </div>

      {dialog === 'delete-test' && (
        <DeleteTestBookingDialog
          booking={b}
          open
          onClose={() => setDialog(null)}
          onDeleted={() => {
            toast.success(`Test booking #${b.reference} deleted`)
            router.replace('/bookings')
          }}
        />
      )}

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
      {pickupOverride && (
        <PickupStepDialog
          booking={b}
          step={pickupOverride}
          open={dialog === pickupOverride}
          onClose={() => setDialog(null)}
        />
      )}
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
        <PageHeader backHref={backHref} title="Booking" />
        {isPending ? (
          <SkeletonList count={3} itemClassName="h-36" />
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
