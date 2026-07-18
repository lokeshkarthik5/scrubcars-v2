'use client'

import { use, useEffect, useState } from 'react'
import { AppShell } from '@/components/sc/app-shell'
import { ScButton } from '@/components/sc/button'
import { ScCard } from '@/components/sc/card'
import { ScInput } from '@/components/sc/input'
import { StatusStepper } from '@/components/sc/status-stepper'
import { Stars } from '@/components/sc/stars'
import { TopBar } from '@/components/sc/top-bar'
import { getBooking } from '@/lib/api/bookings'
import { createPaymentOrder, verifyPayment } from '@/lib/api/payments'
import { submitReview } from '@/lib/api/reviews'
import { toast } from 'react-toastify'
import { openRazorpayCheckout } from '@/lib/razorpay'
import { useBookingsStore } from '@/lib/stores/bookings-store'
import { useUserStore } from '@/lib/stores/user-store'
import type { Booking, Review } from '@/lib/types'

export default function BookingDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = use(params)
  const profile = useUserStore((s) => s.profile)
  const fetchProfile = useUserStore((s) => s.fetchProfile)
  const cancelBooking = useBookingsStore((s) => s.cancelBooking)
  const [booking, setBooking] = useState<Booking | null>(null)
  const [loadError, setLoadError] = useState(false)
  const [rating, setRating] = useState(0)
  const [comment, setComment] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [paying, setPaying] = useState(false)
  const [cancelling, setCancelling] = useState(false)
  const [showCancelConfirm, setShowCancelConfirm] = useState(false)
  const [submittedReview, setSubmittedReview] = useState<Review | null>(null)

  useEffect(() => {
    getBooking(id).then((b) => {
      if (b) {
        setBooking(b)
      } else {
        setLoadError(true)
      }
    })
  }, [id])

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
      const updated = await cancelBooking(booking.id)
      setBooking(updated)
      setShowCancelConfirm(false)
      toast.success('Booking cancelled')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to cancel booking')
    } finally {
      setCancelling(false)
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

  return (
    <AppShell showNav className="gap-5 py-4">
      <TopBar showBack title={booking.id} />

      <ScCard>
        <p className="text-[13px] font-semibold text-text-primary">{booking.serviceName}</p>
        <p className="text-[11px] text-text-secondary">{booking.vendorName}</p>
        <div className="mt-2 flex items-center justify-between">
          <span className="text-[11px] text-text-secondary">{booking.scheduledAt}</span>
        </div>
      </ScCard>

      <section>
        <h2 className="mb-3 text-sm font-semibold text-text-primary">Status</h2>
        <StatusStepper status={booking.status} />
      </section>

      <ScCard>
        <h2 className="mb-2 text-sm font-semibold text-text-primary">Payment</h2>
        <div className="flex justify-between text-[13px]">
          <span className="text-text-secondary">
            {booking.paymentMethod === 'online' ? 'Online' : 'Cash'}
          </span>
          <span className="font-semibold">₹{booking.servicePrice}</span>
        </div>
        <p className="mt-1 text-[11px] capitalize text-text-muted">{booking.paymentStatus}</p>
        {booking.paymentMethod === 'online' &&
          booking.paymentStatus === 'pending' &&
          booking.status !== 'cancelled' && (
            <div className="mt-3">
              <ScButton disabled={paying} onClick={handlePayNow}>
                {paying ? 'Opening payment...' : 'Pay now'}
              </ScButton>
            </div>
          )}
      </ScCard>

      {['pending', 'confirmed'].includes(booking.status) && (
        <ScCard>
          <h2 className="mb-2 text-sm font-semibold text-text-primary">Cancel booking</h2>
          {showCancelConfirm ? (
            <div className="flex flex-col gap-3">
              <p className="text-[13px] text-text-secondary">
                Cancel this booking? This cannot be undone.
              </p>
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
            <ScButton variant="ghost" onClick={() => setShowCancelConfirm(true)}>
              Cancel booking
            </ScButton>
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
    </AppShell>
  )
}
