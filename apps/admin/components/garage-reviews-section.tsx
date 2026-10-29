'use client'

import { useState } from 'react'
import Link from 'next/link'
import { IconStarFilled } from '@tabler/icons-react'
import { ScBadge } from '@repo/ui/sc/badge'
import { ScButton } from '@repo/ui/sc/button'
import { ScInput } from '@repo/ui/sc/input'
import { ScModal } from '@repo/ui/sc/modal'
import { ScSection } from '@repo/ui/sc/section'
import { SkeletonList } from '@repo/ui/sc/skeleton'
import type { AdminReview } from '@repo/core/api/admin-reviews'
import { errorMessage } from '@repo/core/api/hooks/use-discounts'
import {
  useAdminGarageReviews,
  useHideReview,
  useShowReview,
} from '@repo/core/api/hooks/use-admin-reviews'
import { NEW_GARAGE_LABEL, RATING_RULES } from '@repo/core/ratings'
import { DeleteTestBookingDialog } from '@/components/delete-test-booking-dialog'
import { SignedAs } from '@/components/signed-as'
import { formatWhen } from '@/lib/bookings'
import { reviewCountsLabel } from '@/lib/reviews'

/**
 * A garage's Reviews tab (0065, mockup frame F): every review, with whether
 * it counts. A Test booking's never counts ("Test: never counts"), with
 * Delete booking, which opens the booking's own Delete test booking; a
 * hidden one stays in the record with who, when and why, and Show again
 * undoes it; any other has Hide…, which asks why. Reports from customers
 * and the garage are listed under each review. While the garage is in the
 * Bin nothing can be changed.
 */
export function GarageReviewsSection({
  vendorId,
  readOnly,
}: {
  vendorId: string
  readOnly: boolean
}) {
  const reviews = useAdminGarageReviews(vendorId)
  const [hiding, setHiding] = useState<AdminReview | null>(null)
  const [deleting, setDeleting] = useState<AdminReview | null>(null)
  const show = useShowReview(vendorId)
  const [error, setError] = useState('')

  if (reviews.isPending) return <SkeletonList count={2} itemClassName="h-24" />
  if (reviews.error) {
    return (
      <p role="alert" className="text-[13px] text-error">
        {errorMessage(reviews.error, "Couldn't load the reviews")}
      </p>
    )
  }
  const { summary, reviews: list } = reviews.data

  return (
    <ScSection title="Reviews">
      <div className="flex flex-col gap-3">
        <p className="text-[13px] text-text-primary">
          {summary.isNew ? (
            <>
              <span className="font-semibold">{NEW_GARAGE_LABEL}</span> for
              customers:{' '}
              <span className="font-numeric">{summary.reviewCount}</span>{' '}
              counted {summary.reviewCount === 1 ? 'review' : 'reviews'} (a
              score shows from{' '}
              <span className="font-numeric">
                {RATING_RULES.minCountedReviews}
              </span>
              ).
            </>
          ) : (
            <>
              Customers see{' '}
              <span className="font-numeric font-semibold">
                {summary.rating?.toFixed(1)}
              </span>{' '}
              from <span className="font-numeric">{summary.reviewCount}</span>{' '}
              counted reviews.
            </>
          )}
          {summary.knownFor && <> Known for {summary.knownFor.label}.</>}
        </p>
        <p className="text-[12px] text-text-secondary">
          Test bookings never count: not in the stars, the garage list, tiers,
          Statistics or the garage&apos;s own screen. A hidden review leaves
          every score and stays in the record.
        </p>

        {error && (
          <p role="alert" className="text-[12px] text-error">
            {error}
          </p>
        )}

        {list.length === 0 ? (
          <p className="text-[13px] text-text-secondary">No reviews yet.</p>
        ) : (
          <ul
            aria-label="Reviews"
            className="flex flex-col divide-y divide-border"
          >
            {list.map((review) => (
              <li
                key={review.id}
                aria-label={`Review by ${review.reviewer ?? 'a customer'}`}
                className="flex flex-col gap-2 py-3 sm:flex-row sm:items-start sm:gap-4"
              >
                <div className="min-w-0 flex-1 text-[12px]">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span
                      className="flex items-center gap-0.5"
                      aria-label={`${review.rating} stars`}
                    >
                      {Array.from({ length: 5 }, (_, i) => (
                        <IconStarFilled
                          key={i}
                          size={12}
                          aria-hidden
                          className={
                            i < review.rating
                              ? 'text-warning'
                              : 'text-text-muted'
                          }
                        />
                      ))}
                    </span>
                    <span className="text-[13px] font-medium text-text-primary">
                      {review.reviewer ?? 'Customer'}
                    </span>
                  </div>
                  {review.comment && (
                    <p className="mt-0.5 text-text-secondary">
                      &ldquo;{review.comment}&rdquo;
                      {review.reply ? ' · replied' : ''}
                    </p>
                  )}
                  {review.tags.length > 0 && (
                    <p className="mt-0.5 text-text-muted">
                      {review.tags.map((tag) => tag.label).join(' · ')}
                    </p>
                  )}
                  {review.hidden && (
                    <p className="mt-0.5 text-text-secondary">
                      {review.hidden.reason} · hidden by {review.hidden.by},{' '}
                      <span className="font-numeric">
                        {formatWhen(review.hidden.at)}
                      </span>
                    </p>
                  )}
                  {review.reports.map((report) => (
                    <p key={report.id} className="mt-0.5 text-text-secondary">
                      Reported by{' '}
                      {report.reporter === 'garage'
                        ? 'the garage'
                        : 'a customer'}
                      : {report.reason}
                    </p>
                  ))}
                </div>

                <div className="text-[12px] sm:w-36">
                  {review.booking ? (
                    <>
                      <Link
                        href={`/bookings/${review.booking.id}`}
                        className="font-numeric font-medium text-text-primary underline-offset-2 hover:underline"
                      >
                        #{review.booking.reference}
                      </Link>
                      <p className="text-text-secondary">
                        {review.test
                          ? 'Test booking'
                          : review.booking.serviceNames.join(', ')}{' '}
                        ·{' '}
                        <span className="font-numeric">
                          {formatWhen(review.booking.scheduledAt)}
                        </span>
                      </p>
                    </>
                  ) : (
                    <p className="text-text-secondary">No booking</p>
                  )}
                </div>

                <div className="flex items-center gap-2 sm:w-56 sm:justify-end">
                  <ScBadge
                    variant={
                      review.counts
                        ? 'success'
                        : review.test
                          ? 'danger'
                          : 'muted'
                    }
                  >
                    {reviewCountsLabel(review)}
                  </ScBadge>
                  {!readOnly &&
                    (review.test ? (
                      review.booking && (
                        <ScButton
                          variant="secondary"
                          fullWidth={false}
                          onClick={() => setDeleting(review)}
                          className="min-h-11 px-3 text-[12px]"
                        >
                          Delete booking
                        </ScButton>
                      )
                    ) : review.hidden ? (
                      <ScButton
                        variant="secondary"
                        fullWidth={false}
                        disabled={show.isPending}
                        onClick={() => {
                          setError('')
                          show.mutate(review.id, {
                            onError: (err) =>
                              setError(
                                errorMessage(err, "Couldn't show it again")
                              ),
                          })
                        }}
                        className="min-h-11 px-3 text-[12px]"
                      >
                        Show again
                      </ScButton>
                    ) : (
                      <ScButton
                        variant="secondary"
                        fullWidth={false}
                        onClick={() => setHiding(review)}
                        aria-label={`Hide the review by ${review.reviewer ?? 'a customer'}`}
                        className="min-h-11 px-3 text-[12px]"
                      >
                        Hide…
                      </ScButton>
                    ))}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {hiding && (
        <HideReviewDialog
          vendorId={vendorId}
          review={hiding}
          onClose={() => setHiding(null)}
        />
      )}
      {deleting?.booking && (
        <DeleteTestBookingDialog
          booking={{
            id: deleting.booking.id,
            reference: deleting.booking.reference,
          }}
          open
          onClose={() => setDeleting(null)}
          onDeleted={() => {
            setDeleting(null)
            void reviews.refetch()
          }}
        />
      )}
    </ScSection>
  )
}

/** Hide…: why, signed with the session. The garage and customers stop seeing it at once. */
function HideReviewDialog({
  vendorId,
  review,
  onClose,
}: {
  vendorId: string
  review: AdminReview
  onClose: () => void
}) {
  const hide = useHideReview(vendorId)
  const [reason, setReason] = useState('')
  const [error, setError] = useState('')
  const ready = reason.trim().length >= RATING_RULES.reasonMinLength

  const submit = () => {
    if (!ready || hide.isPending) return
    setError('')
    hide.mutate(
      { reviewId: review.id, reason: reason.trim() },
      {
        onSuccess: onClose,
        onError: (err) =>
          setError(errorMessage(err, "Couldn't hide the review")),
      }
    )
  }

  return (
    <ScModal
      open
      onClose={() => !hide.isPending && onClose()}
      dismissible={!hide.isPending}
      aria-label="Hide this review"
      className="flex max-w-[440px] flex-col gap-4"
    >
      <div>
        <h2 className="text-[15px] font-semibold text-text-primary">
          Hide this review
        </h2>
        <p className="mt-1 text-[12px] text-text-secondary">
          For abusive, fake or wrong-garage reviews. It leaves the score, the
          lists and the tiers, and stays in the record. Show again undoes it.
        </p>
      </div>
      <SignedAs />
      <ScInput
        id="hide-review-reason"
        label="Why is it hidden?"
        placeholder="Abusive language"
        maxLength={RATING_RULES.hideReasonMaxLength}
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        className="min-h-11"
      />
      {error && (
        <p role="alert" className="text-[12px] text-error">
          {error}
        </p>
      )}
      <div className="flex gap-2">
        <ScButton
          variant="secondary"
          onClick={onClose}
          disabled={hide.isPending}
          className="min-h-11"
        >
          Go back
        </ScButton>
        <ScButton
          onClick={submit}
          disabled={!ready || hide.isPending}
          className="min-h-11"
        >
          {hide.isPending ? 'Hiding…' : 'Hide review'}
        </ScButton>
      </div>
    </ScModal>
  )
}
