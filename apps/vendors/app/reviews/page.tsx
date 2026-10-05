'use client'

import { useEffect, useState } from 'react'
import { IconStar } from '@tabler/icons-react'
import { AppShell } from '@repo/ui/sc/app-shell'
import { ScCard } from '@repo/ui/sc/card'
import { EmptyState } from '@repo/ui/sc/empty-state'
import { Reveal } from '@repo/ui/sc/reveal'
import { Skeleton, SkeletonList } from '@repo/ui/sc/skeleton'
import { Stars } from '@repo/ui/sc/stars'
import { TopBar } from '@repo/ui/sc/top-bar'
import { getVendorReviews } from '@repo/core/api/reviews'
import { useAuthStore } from '@repo/core/stores/auth-store'
import type { Review } from '@repo/core/types'
import { formatRating } from '@repo/core/vendor-stats'

export default function VendorReviewsPage() {
  const [reviews, setReviews] = useState<Review[]>([])
  // Placeholders until the reviews arrive, rather than "no reviews" for a
  // moment on a garage that has plenty.
  const [loaded, setLoaded] = useState(false)
  const vendor = useAuthStore((s) => s.vendor)

  useEffect(() => {
    if (!vendor?.id) return
    getVendorReviews(vendor.id)
      .then(setReviews)
      .finally(() => setLoaded(true))
  }, [vendor?.id])

  const avgRating =
    reviews.length > 0
      ? reviews.reduce((s, r) => s + r.rating, 0) / reviews.length
      : 0

  return (
    <AppShell showNav navType="vendor" className="gap-5 py-4">
      <TopBar showBack title="Reviews" />

      {/* The summary waits for the list too: a 0 and five empty stars for a
          moment, on a garage with plenty of reviews, reads as a bad score. */}
      {!loaded ? (
        // Decorative: the list's placeholders below announce the loading.
        <Skeleton className="h-[72px] w-full" />
      ) : reviews.length > 0 ? (
        <ScCard className="flex items-center gap-4 px-4 py-4">
          <span className="font-numeric text-[40px] font-bold leading-none tracking-tight text-text-primary">
            {formatRating(avgRating)}
          </span>
          <div className="flex flex-col gap-1">
            <Stars rating={avgRating} size={18} />
            <p className="text-[12px] text-text-secondary">
              <span className="font-numeric">{reviews.length}</span>{' '}
              {reviews.length === 1 ? 'review' : 'reviews'}
            </p>
          </div>
        </ScCard>
      ) : null}

      {/* With no reviews there is no summary card at all: no rating has been
          given, and the empty state below already says so. */}
      {!loaded ? (
        <SkeletonList count={3} itemClassName="h-[92px]" />
      ) : reviews.length === 0 ? (
        <EmptyState
          icon={<IconStar size={28} stroke={1.5} />}
          title="No reviews yet"
          subtitle="Reviews will appear after your first completed job"
        />
      ) : (
        <div className="flex flex-col gap-2">
          {reviews.map((review, i) => (
            <Reveal key={review.id} index={i}>
              <ScCard>
                <div className="flex items-center gap-2.5">
                  {/* Graphite and white, as the customer app's avatars are;
                      red is kept for what to press. */}
                  <div
                    aria-hidden="true"
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-surface-elevated text-[11px] font-semibold text-text-primary"
                  >
                    {review.userName.slice(0, 2).toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-medium text-text-primary">
                      {review.userName}
                    </p>
                    <p className="font-numeric text-[11px] text-text-muted">{review.date}</p>
                  </div>
                  <Stars rating={review.rating} size={12} />
                </div>
                {review.comment && (
                  <p className="mt-2 text-[13px] text-text-secondary">{review.comment}</p>
                )}
                {review.bookingContext && (
                  <p className="mt-1 text-[11px] text-text-muted">{review.bookingContext}</p>
                )}
              </ScCard>
            </Reveal>
          ))}
        </div>
      )}
    </AppShell>
  )
}
