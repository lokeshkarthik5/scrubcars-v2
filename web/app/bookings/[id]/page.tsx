'use client'

import { use, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { IconCreditCard, IconHome, IconMapPin } from '@tabler/icons-react'
import { AppShell } from '@/components/sc/app-shell'
import { ScBadge, bookingStatusBadge } from '@/components/sc/badge'
import { ScButton } from '@/components/sc/button'
import { ScCard } from '@/components/sc/card'
import { ScInput } from '@/components/sc/input'
import { SlotPicker } from '@/components/sc/slot-picker'
import { ScSheet } from '@/components/sc/modal'
import { SuccessBurst } from '@/components/sc/success-burst'
import { StatusStepper } from '@/components/sc/status-stepper'
import { Stars } from '@/components/sc/stars'
import { TopBar } from '@/components/sc/top-bar'
import { getBooking } from '@/lib/api/bookings'
import { createPaymentOrder, verifyPayment } from '@/lib/api/payments'
import { submitReview } from '@/lib/api/reviews'
import { toast } from 'react-toastify'
import { openRazorpayCheckout } from '@/lib/razorpay'
import { formatBookingAmount } from '@/lib/pricing'
import { useBookingsStore } from '@/lib/stores/bookings-store'
import { useUserStore } from '@/lib/stores/user-store'
import type { Booking, Review } from '@/lib/types'

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
        description: `${booking.serviceName} at ${booking.vendorName}`,
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
      if (error instanceof Error && error.message !== 'Payment cancelled') {
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

  const statusBadge = bookingStatusBadge(
    // Before the vendor accepts, the design calls this state "Waiting".
    booking.status === 'pending' ? 'waiting' : booking.status
  )

  return (
    <AppShell showNav className="gap-4 py-4">
      {celebrating && (
        <SuccessBurst
          title="Booking confirmed"
          subtitle={`${booking.serviceName} at ${booking.vendorName} · ${booking.scheduledAt}`}
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
        <p className="mt-1 text-[13px] text-text-secondary">{booking.scheduledAt}</p>

        <div className="mt-3 flex items-center gap-2 text-[13px]">
          {booking.bookingType === 'doorstep' ? (
            <IconHome size={15} className="text-text-primary" />
          ) : (
            <IconMapPin size={15} className="text-text-primary" />
          )}
          <span className="font-medium text-text-primary">
            {booking.bookingType === 'doorstep' ? 'Doorstep Mode' : 'At Garage Mode'}
          </span>
        </div>

        {/* A booking that is cancelled (including one cancelled by a
            reschedule) has no progress to show, and the stepper falls back to
            "Confirmed" for statuses it doesn't know. The panel below explains
            the state instead. */}
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
        <div className="mt-2 flex flex-wrap gap-2">
          <span className="rounded-lg bg-surface-elevated px-2.5 py-1.5 text-[12px] text-text-primary">
            {booking.serviceName} ({formatBookingAmount(booking.servicePrice)})
          </span>
        </div>

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
          <span className="text-[15px] font-semibold text-text-primary">
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
            {paying
              ? 'Opening payment...'
              : `Pay Now (${formatBookingAmount(booking.servicePrice)})`}
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
            <button
              type="button"
              onClick={() => setShowCancelConfirm(true)}
              className="w-full text-center text-[14px] font-semibold text-brand-red underline"
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
              serviceId={booking.serviceId}
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
