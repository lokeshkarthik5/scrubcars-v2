'use client'

import { useEffect, useState } from 'react'
import { AppShell } from '@repo/ui/sc/app-shell'
import { ScCard } from '@repo/ui/sc/card'
import { Stars } from '@repo/ui/sc/stars'
import { TopBar } from '@repo/ui/sc/top-bar'
import { getVendorReviews } from '@repo/core/api/reviews'
import { useAuthStore } from '@repo/core/stores/auth-store'
import type { Review } from '@repo/core/types'

export default function VendorReviewsPage() {
  const [reviews, setReviews] = useState<Review[]>([])
  const vendor = useAuthStore((s) => s.vendor)

  useEffect(() => {
    if (!vendor?.id) return
    getVendorReviews(vendor.id).then(setReviews)
  }, [vendor?.id])

  const avgRating =
    reviews.length > 0
      ? reviews.reduce((s, r) => s + r.rating, 0) / reviews.length
      : 0

  return (
    <AppShell showNav navType="vendor" className="gap-5 py-4">
      <TopBar showBack title="Reviews" />

      <div className="flex items-center gap-3">
        <span className="text-4xl font-semibold text-text-primary">{avgRating.toFixed(1)}</span>
        <div>
          <Stars rating={avgRating} size={18} />
          <p className="text-[11px] text-text-secondary">{reviews.length} reviews</p>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        {reviews.length === 0 ? (
          <p className="py-8 text-center text-[13px] text-text-secondary">
            Reviews will appear after your first completed job
          </p>
        ) : (
          reviews.map((review) => (
            <ScCard key={review.id}>
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-accent-muted text-[11px] font-semibold text-brand-red">
                  {review.userName.slice(0, 2).toUpperCase()}
                </div>
                <div className="flex-1">
                  <p className="text-[13px] font-medium">{review.userName}</p>
                  <p className="text-[10px] text-text-muted">{review.date}</p>
                </div>
                <Stars rating={review.rating} size={12} />
              </div>
              <p className="mt-2 text-[13px] text-text-secondary">{review.comment}</p>
              {review.bookingContext && (
                <p className="mt-1 text-[10px] text-text-muted">{review.bookingContext}</p>
              )}
            </ScCard>
          ))
        )}
      </div>
    </AppShell>
  )
}
