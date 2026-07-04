'use client'

import { use, useEffect, useState } from 'react'
import { AppShell } from '@/components/sc/app-shell'
import { ScBadge } from '@/components/sc/badge'
import { ScButton } from '@/components/sc/button'
import { ScCard } from '@/components/sc/card'
import { ScInput } from '@/components/sc/input'
import { StatusStepper } from '@/components/sc/status-stepper'
import { Stars } from '@/components/sc/stars'
import { TopBar } from '@/components/sc/top-bar'
import { getBooking } from '@/lib/api/bookings'
import { submitReview } from '@/lib/api/reviews'
import type { Booking, Review } from '@/lib/types'

export default function BookingDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = use(params)
  const [booking, setBooking] = useState<Booking | null>(null)
  const [rating, setRating] = useState(0)
  const [comment, setComment] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submittedReview, setSubmittedReview] = useState<Review | null>(null)
  const [reviewError, setReviewError] = useState<string | null>(null)

  useEffect(() => {
    getBooking(id).then((b) => setBooking(b ?? null))
  }, [id])

  const handleSubmitReview = async () => {
    if (!rating) return
    setSubmitting(true)
    setReviewError(null)
    try {
      const review = await submitReview({ bookingId: id, rating, comment })
      setSubmittedReview(review)
    } catch (error) {
      setReviewError(error instanceof Error ? error.message : 'Failed to submit review')
    } finally {
      setSubmitting(false)
    }
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
          <ScBadge variant="muted">
            {booking.bookingType === 'doorstep' ? 'Doorstep' : 'Drop-in'}
          </ScBadge>
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
      </ScCard>

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
              {reviewError && (
                <p className="mt-2 text-[12px] text-brand-red">{reviewError}</p>
              )}
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
