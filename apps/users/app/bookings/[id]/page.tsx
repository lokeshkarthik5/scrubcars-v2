'use client'

import { use, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { IconCreditCard, IconHome, IconMapPin } from '@tabler/icons-react'
import { AppShell } from '@repo/ui/sc/app-shell'
import { ScBadge, customerBookingStatusBadge } from '@repo/ui/sc/badge'
import { ScButton } from '@repo/ui/sc/button'
import { ScCard } from '@repo/ui/sc/card'
import { ScInput } from '@repo/ui/sc/input'
import { SlotPicker } from '@repo/ui/sc/slot-picker'
import { ScSheet } from '@repo/ui/sc/modal'
import { SuccessBurst } from '@repo/ui/sc/success-burst'
import { StatusStepper } from '@repo/ui/sc/status-stepper'
import { Stars } from '@repo/ui/sc/stars'
import { TopBar } from '@repo/ui/sc/top-bar'
import { getBooking } from '@repo/core/api/bookings'
import { createPaymentOrder, verifyPayment } from '@repo/core/api/payments'
import { submitReview } from '@repo/core/api/reviews'
import { toast } from 'react-toastify'
import { openRazorpayCheckout, RazorpayReportedError } from '@repo/core/razorpay'
import { formatBookingAmount } from '@repo/core/pricing'
import { BOOKING_TYPE_LABELS } from '@repo/core/booking-types'
import { useBookingsStore } from '@repo/core/stores/bookings-store'
import { useUserStore } from '@repo/core/stores/user-store'
import type { Booking, Review } from '@repo/core/types'

export default function BookingDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = use(params)
  const router = useRouter()
  const profile = useUserStore((s) => s.profile)
  const fetchProfile = useUserStore((s) => s.fetchProfile)
  const cancelBooking = useBookingsStore((s) => s.cancelBooking)
  const rescheduleBooking = useBookingsStore((s) => s.rescheduleBooking)
  const [booking, setBooking] = useState<Booking | null>(null)
  const [loadError, setLoadError] = useState(false)
  const [rating, setRating] = useState(0)
  const [comment, setComment] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [paying, setPaying] = useState(false)
  const [cancelling, setCancelling] = useState(false)
  const [showCancelConfirm, setShowCancelConfirm] = useState(false)
  const [cancelReason, setCancelReason] = useState('')
  const [showReschedule, setShowReschedule] = useState(false)
  const [rescheduleSlot, setRescheduleSlot] = useState<string | null>(null)
  const [rescheduling, setRescheduling] = useState(false)
  const [submittedReview, setSubmittedReview] = useState<Review | null>(null)
  // The booking flow lands here with ?celebrate=1 straight after payment.
  // Read once into state rather than watching the URL, so the burst plays a
  // single time and a refresh doesn't replay it (the param is stripped below).
  const [celebrating, setCelebrating] = useState(
    () =>
      typeof window !== 'undefined' &&
      new URLSearchParams(window.location.search).get('celebrate') === '1'
  )

  useEffect(() => {
    getBooking(id).then((b) => {
      if (b) {
        setBooking(b)
        // Seed from the booking that came back, not just from a submission
        // made in this session. Without this, revisiting a job you have
        // already reviewed shows the empty rating form again and invites a
        // second review that reviews.booking_id (unique) will refuse.
        if (b.review) {
          setSubmittedReview(b.review)
        }
      } else {
        setLoadError(true)
      }
    })
  }, [id])

  // Poll for live status updates (e.g. vendor accepts/rejects) every 5s.
  // Stop once the booking reaches a terminal state.
  const bookingStatus = booking?.status
  useEffect(() => {
    if (!bookingStatus) return
    if (
      bookingStatus === 'completed' ||
      bookingStatus === 'cancelled' ||
      bookingStatus === 'rescheduled'
    )
      return

    const interval = setInterval(async () => {
      const fresh = await getBooking(id)
      if (fresh) setBooking(fresh)
    }, 5000)

    return () => clearInterval(interval)
  }, [id, bookingStatus])

  const handlePayNow = async () => {
    if (!booking || paying) return
    setPaying(true)
    try {
      if (!profile) await fetchProfile()
      const order = await createPaymentOrder(booking.id)
      await openRazorpayCheckout({
        order,
        description: `${booking.serviceSummary} at ${booking.vendorName}`,
        customer: {
          name: profile?.name,
          phone: profile?.phone,
        },
        onSuccess: async (response) => {
          await verifyPayment({
            bookingId: booking.id,
            razorpayOrderId: response.razorpay_order_id,
            razorpayPaymentId: response.razorpay_payment_id,
            razorpaySignature: response.razorpay_signature,
          })
          const updated = await getBooking(booking.id)
          setBooking(updated ?? null)
          toast.success('Payment successful')
        },
        onDismiss: () => {
          toast.info('Payment cancelled. You can pay anytime from booking details.')
        },
        onFailure: (message) => {
          toast.error(message)
        },
      })
    } catch (error) {
      if (!(error instanceof RazorpayReportedError) && error instanceof Error) {
        toast.error(error.message)
      }
    } finally {
      setPaying(false)
    }
  }

  const handleCancelBooking = async () => {
    if (!booking || cancelling) return
    setCancelling(true)
    try {
      const updated = await cancelBooking(booking.id, cancelReason.trim() || undefined)
      setBooking(updated)
      setShowCancelConfirm(false)
      setCancelReason('')
      toast.success('Booking cancelled')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to cancel booking')
    } finally {
      setCancelling(false)
    }
  }

  const handleReschedule = async () => {
    if (!booking || rescheduling || !rescheduleSlot) return
    setRescheduling(true)
    try {
      // Reschedule creates a NEW booking; navigate to it.
      const created = await rescheduleBooking(booking.id, rescheduleSlot)
      setShowReschedule(false)
      setRescheduleSlot(null)
      toast.success('Booking rescheduled')
      router.push(`/bookings/${created.id}`)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to reschedule booking')
    } finally {
      setRescheduling(false)
    }
  }

  const handleSubmitReview = async () => {
    if (!rating) return
    setSubmitting(true)
    try {
      const review = await submitReview({ bookingId: id, rating, comment })
      setSubmittedReview(review)
      toast.success('Review submitted. Thanks!')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to submit review')
    } finally {
      setSubmitting(false)
    }
  }

  if (loadError) {
    return (
      <AppShell showNav className="py-4">
        <TopBar showBack title="Booking" />
        <p className="px-4 pt-4 text-[13px] text-text-secondary">
          Could not load this booking. It may have been removed or you may not have access.
        </p>
      </AppShell>
    )
  }

  if (!booking) {
    return (
      <AppShell showNav className="py-4">
        <TopBar showBack title="Loading..." />
      </AppShell>
    )
  }

  const statusBadge = customerBookingStatusBadge(booking.status)
  // Paying sends a request; only the garage's accept confirms it. Celebrating
  // a "confirmed" booking that the garage then declines teaches customers not
  // to believe this screen, so the moment says exactly what happened.
  const awaitingGarage = booking.status === 'pending'

  return (
    <AppShell showNav className="gap-4 py-4">
      {celebrating && (
        <SuccessBurst
          title={awaitingGarage ? 'Booking requested' : 'Booking confirmed'}
          subtitle={
            awaitingGarage
              ? `Waiting for ${booking.vendorName} to accept your ${booking.scheduledAt} slot.`
              : `${booking.serviceSummary} at ${booking.vendorName} · ${booking.scheduledAt}`
          }
          onDone={() => {
            setCelebrating(false)
            // Drop the flag so a refresh or back-navigation doesn't replay it.
            window.history.replaceState(null, '', `/bookings/${booking.id}`)
          }}
        />
      )}

      <TopBar showBack center title="Booking Status" />

      <div className="flex items-center justify-between gap-3">
        {/* Short, human-quotable reference derived from the booking UUID. */}
        <span className="text-[13px] text-text-secondary">
          Booking #{booking.id.slice(0, 8).toUpperCase()}
        </span>
        <ScBadge variant={statusBadge.variant} className="uppercase tracking-wide">
          {statusBadge.label}
        </ScBadge>
      </div>

      <ScCard className="px-4 py-4">
        <h2 className="text-[20px] font-bold tracking-tight text-text-primary">
          {booking.vendorName}
        </h2>
        <p className="mt-1 font-numeric text-[13px] font-medium text-text-secondary">
          {booking.scheduledAt}
        </p>

        <div className="mt-3 flex items-center gap-2 text-[13px]">
          {booking.bookingType === 'doorstep' ? (
            <IconHome size={15} className="text-text-primary" />
          ) : (
            <IconMapPin size={15} className="text-text-primary" />
          )}
          {/* The same name the customer chose it by on home and at checkout. */}
          <span className="font-medium text-text-primary">
            {BOOKING_TYPE_LABELS[booking.bookingType]}
          </span>
        </div>

        {/* A booking that is cancelled (including one cancelled by a
            reschedule) has no progress to show, and the stepper reads a
            status it doesn't know as an open request. The panel below
            explains the state instead. */}
        {booking.status !== 'rescheduled' && booking.status !== 'cancelled' && (
          <>
            <div className="my-4 h-px bg-border" />
            <StatusStepper status={booking.status} />
          </>
        )}

        <div className="my-4 h-px bg-border" />
        <p className="text-[11px] font-medium uppercase tracking-wide text-text-secondary">
          Services
        </p>
        {/* One chip per service, each with the price it was sold at. The
            chips sum to the subtotal below — the discount applies to the
            order, not to any one line. */}
        <div className="mt-2 flex flex-wrap gap-2">
          {booking.items.map((item) => (
            <span
              key={item.id}
              className="rounded-lg bg-surface-elevated px-2.5 py-1.5 text-[12px] text-text-primary"
            >
              {item.name}{' '}
              <span className="font-numeric font-medium">
                ({formatBookingAmount(item.amount)})
              </span>
            </span>
          ))}
        </div>

        {/* Only a discounted booking gets a breakdown; everything else keeps
            the single total it has always shown. */}
        {booking.discountAmount > 0 && (
          <div className="mt-3 flex flex-col gap-1 border-t border-border pt-3 text-[12px]">
            <div className="flex items-center justify-between text-text-secondary">
              <span>Subtotal</span>
              <span className="font-numeric font-medium">
                {formatBookingAmount(booking.subtotalPrice)}
              </span>
            </div>
            <div className="flex items-center justify-between text-success">
              <span>
                Discount{booking.discountCode ? ` (${booking.discountCode})` : ''}
              </span>
              <span className="font-numeric font-medium">
                −{formatBookingAmount(booking.discountAmount)}
              </span>
            </div>
          </div>
        )}

        <div className="my-4 h-px bg-border" />
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-1.5 text-[12px] text-text-secondary">
            <IconCreditCard size={14} />
            {booking.paymentStatus === 'paid'
              ? 'Paid online'
              : booking.paymentMethod === 'online'
                ? `Online · ${booking.paymentStatus}`
                : `Cash · ${booking.paymentStatus}`}
          </span>
          <span className="font-numeric text-[15px] font-bold text-text-primary">
            {formatBookingAmount(booking.servicePrice)}
          </span>
        </div>
      </ScCard>

      {booking.status === 'rescheduled' && (
        <ScCard>
          <h2 className="mb-1 text-sm font-semibold text-text-primary">Rescheduled</h2>
          <p className="text-[13px] text-text-secondary">
            This booking was moved to a new time. Check your bookings for the updated slot.
          </p>
        </ScCard>
      )}

      {booking.status === 'cancelled' && (
        <ScCard>
          <h2 className="mb-1 text-sm font-semibold text-text-primary">
            {booking.cancelledBy === 'vendor'
              ? 'Rejected by vendor'
              : booking.cancelledBy === 'user'
                ? 'Cancelled by you'
                : 'Booking cancelled'}
          </h2>
          <p className="text-[13px] text-text-secondary">
            {booking.cancellationReason
              ? booking.cancellationReason
              : booking.cancelledBy === 'vendor'
                ? 'The vendor could not take this booking.'
                : 'This booking was cancelled.'}
          </p>
        </ScCard>
      )}

      {/* Totals live on the status card above; this is just the outstanding-payment CTA. */}
      {booking.paymentMethod === 'online' &&
        booking.paymentStatus === 'pending' &&
        booking.status !== 'cancelled' && (
          <ScButton disabled={paying} onClick={handlePayNow} className="rounded-full py-4 text-[15px]">
            {paying ? (
              'Opening payment...'
            ) : (
              <>
                Pay Now (
                <span className="font-numeric font-bold">
                  {formatBookingAmount(booking.servicePrice)}
                </span>
                )
              </>
            )}
          </ScButton>
        )}

      {['pending', 'confirmed'].includes(booking.status) && (
        <ScCard>
          <h2 className="mb-1 text-sm font-semibold text-text-primary">Reschedule booking</h2>
          <p className="mb-3 text-[12px] text-text-secondary">
            You can reschedule a booking only twice · {booking.remainingReschedules} of 2 left.
          </p>
          <ScButton
            variant="secondary"
            disabled={booking.remainingReschedules <= 0}
            onClick={() => {
              setRescheduleSlot(null)
              setShowReschedule(true)
            }}
          >
            {booking.remainingReschedules > 0 ? 'Reschedule' : 'No reschedules left'}
          </ScButton>
        </ScCard>
      )}

      {['pending', 'confirmed'].includes(booking.status) && (
        <ScCard>
          <h2 className="mb-2 text-sm font-semibold text-text-primary">Cancel booking</h2>
          {showCancelConfirm ? (
            <div className="rise-in flex flex-col gap-3">
              <p className="text-[13px] text-text-secondary">
                Cancel this booking? This cannot be undone.
              </p>
              <ScInput
                placeholder="Reason (optional)"
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
              />
              {booking.paymentMethod === 'online' && booking.paymentStatus === 'paid' && (
                <p className="text-[12px] text-text-muted">
                  Refunds for paid online bookings are not automatic yet.
                </p>
              )}
              <div className="flex gap-2">
                <ScButton
                  variant="secondary"
                  disabled={cancelling}
                  onClick={() => setShowCancelConfirm(false)}
                >
                  Keep booking
                </ScButton>
                <ScButton
                  disabled={cancelling}
                  onClick={handleCancelBooking}
                >
                  {cancelling ? 'Cancelling...' : 'Confirm cancel'}
                </ScButton>
              </div>
            </div>
          ) : (
            // A plain underlined link: cancelling is not what this screen
            // wants pressed, and red is the colour that says "press me".
            <button
              type="button"
              onClick={() => setShowCancelConfirm(true)}
              className="w-full text-center text-[14px] font-semibold text-text-primary underline"
            >
              Cancel Booking
            </button>
          )}
        </ScCard>
      )}

      {booking.status === 'completed' && (
        <ScCard>
          <h2 className="mb-3 text-sm font-semibold text-text-primary">Rate your experience</h2>
          {submittedReview ? (
            <div className="flex flex-col gap-2">
              <Stars rating={submittedReview.rating} size={18} />
              <p className="text-[13px] text-text-secondary">
                Thanks for your review.
              </p>
              {submittedReview.comment && (
                <p className="text-[13px] text-text-primary">{submittedReview.comment}</p>
              )}
            </div>
          ) : (
            <>
              <Stars rating={rating} interactive value={rating} onChange={setRating} size={24} />
              <div className="mt-3">
                <ScInput
                  placeholder="Tell us about your experience"
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                />
              </div>
              <ScButton
                className="mt-3"
                disabled={!rating || submitting}
                onClick={handleSubmitReview}
              >
                {submitting ? 'Submitting...' : 'Submit review'}
              </ScButton>
            </>
          )}
        </ScCard>
      )}

      {/* dismissible=false while the reschedule is in flight, so a stray tap on
          the backdrop can't close the sheet mid-request. */}
      <ScSheet
        open={showReschedule}
        onClose={() => setShowReschedule(false)}
        dismissible={!rescheduling}
        aria-label="Reschedule booking"
        className="px-4 pt-1"
      >
          <div>
            <h2 className="text-base font-semibold text-text-primary">Reschedule booking</h2>
            <p className="mb-4 mt-1 text-[12px] text-text-secondary">
              You can reschedule only twice · {booking.remainingReschedules} of 2 left. Pick a new slot below.
            </p>
            <SlotPicker
              vendorId={booking.vendorId}
              // Every service on the booking: a move has to fit the whole job,
              // not just its first line.
              serviceIds={booking.items.map((item) => item.serviceId)}
              value={rescheduleSlot}
              onChange={setRescheduleSlot}
            />
            <div className="mt-5 flex gap-2">
              <ScButton
                variant="secondary"
                disabled={rescheduling}
                onClick={() => setShowReschedule(false)}
              >
                Cancel
              </ScButton>
              <ScButton
                disabled={!rescheduleSlot || rescheduling}
                onClick={handleReschedule}
              >
                {rescheduling ? 'Rescheduling...' : 'Confirm reschedule'}
              </ScButton>
            </div>
          </div>
      </ScSheet>
    </AppShell>
  )
}
