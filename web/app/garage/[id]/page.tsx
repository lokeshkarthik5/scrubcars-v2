'use client'

import { use, useEffect, useState } from 'react'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { IconHeart } from '@tabler/icons-react'
import { AppShell } from '@/components/sc/app-shell'
import { ScBadge } from '@/components/sc/badge'
import { ScButton } from '@/components/sc/button'
import { ScCard } from '@/components/sc/card'
import { Stars } from '@/components/sc/stars'
import { TopBar } from '@/components/sc/top-bar'
import { CATEGORY_LABELS } from '@/lib/mock/data'
import { getVendorReviews } from '@/lib/api/reviews'
import { getVendorServices } from '@/lib/api/services'
import { getVendor } from '@/lib/api/vendors'
import { useAuthStore } from '@/lib/stores/auth-store'
import type { Review, Service, Vendor } from '@/lib/types'
import { formatServicePrice } from '@/lib/pricing'
import { cn } from '@/lib/utils'

type Tab = 'services' | 'photos' | 'reviews'

export default function GaragePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = use(params)
  const router = useRouter()
  const user = useAuthStore((s) => s.user)
  const [vendor, setVendor] = useState<Vendor | null>(null)
  const [services, setServices] = useState<Service[]>([])
  const [reviews, setReviews] = useState<Review[]>([])
  const [tab, setTab] = useState<Tab>('services')
  const [selectedService, setSelectedService] = useState<string | null>(null)

  const handleBook = () => {
    const bookPath = `/book/${id}${selectedService ? `?service=${selectedService}` : ''}`
    if (!user) {
      router.push(`/login?next=${encodeURIComponent(bookPath)}`)
    } else {
      router.push(bookPath)
    }
  }

  useEffect(() => {
    getVendor(id).then((v) => setVendor(v ?? null))
    getVendorServices(id).then(setServices)
    getVendorReviews(id).then(setReviews)
  }, [id])

  if (!vendor) {
    return (
      <AppShell className="py-4">
        <TopBar showBack title="Loading..." />
      </AppShell>
    )
  }

  const tabs: { key: Tab; label: string }[] = [
    { key: 'services', label: 'Services' },
    { key: 'photos', label: 'Photos' },
    { key: 'reviews', label: 'Reviews' },
  ]

  const avgRating =
    reviews.length > 0
      ? reviews.reduce((s, r) => s + r.rating, 0) / reviews.length
      : vendor.rating

  return (
    <AppShell className="pb-24">
      <div className="sticky top-0 z-10 bg-brand-black px-4 pt-4">
        <TopBar
          showBack
          title={vendor.name}
          right={
            <button className="text-text-secondary">
              <IconHeart size={22} stroke={1.5} />
            </button>
          }
        />
      </div>

      <div className="flex gap-2 overflow-x-auto px-4 pb-4">
        {vendor.photos.length > 0 ? (
          vendor.photos.map((url, i) => (
            <Image
              key={url}
              src={url}
              alt={`${vendor.name} ${i + 1}`}
              width={112}
              height={80}
              className="h-20 w-28 shrink-0 rounded-[10px] object-cover"
            />
          ))
        ) : (
          [1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="h-20 w-28 shrink-0 rounded-[10px] bg-surface"
            />
          ))
        )}
      </div>

      <div className="flex border-b border-border px-4">
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={cn(
              'flex-1 border-b-2 py-2.5 text-[13px] font-medium transition-colors',
              tab === t.key
                ? 'border-brand-red text-brand-red'
                : 'border-transparent text-text-secondary'
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="flex flex-col gap-2 px-4 py-4">
        {tab === 'services' &&
          services.map((svc) => (
            <button
              key={svc.id}
              type="button"
              onClick={() => setSelectedService(svc.id)}
            >
              <ScCard
                className={cn(
                  'text-left transition-colors',
                  selectedService === svc.id && 'border-brand-red'
                )}
              >
                <div className="flex items-start justify-between">
                  <p className="text-[13px] font-semibold text-text-primary">{svc.name}</p>
                  <span className="text-[13px] font-semibold text-text-primary">{formatServicePrice(svc)}</span>
                </div>
                <div className="mt-1 flex items-center gap-2">
                  <ScBadge variant="muted">{CATEGORY_LABELS[svc.category]}</ScBadge>
                  <span className="text-[11px] text-text-secondary">{svc.durationMins} min</span>
                </div>
              </ScCard>
            </button>
          ))}

        {tab === 'photos' && (
          <div className="grid grid-cols-2 gap-2">
            {vendor.photos.length > 0
              ? vendor.photos.map((url, i) => (
                  <div key={url} className="relative aspect-square overflow-hidden rounded-[10px] bg-surface">
                    <Image
                      src={url}
                      alt={`${vendor.name} ${i + 1}`}
                      fill
                      sizes="(max-width: 428px) 50vw, 200px"
                      className="object-cover"
                    />
                  </div>
                ))
              : [1, 2, 3, 4].map((i) => (
                  <div key={i} className="aspect-square rounded-[10px] bg-surface" />
                ))}
          </div>
        )}

        {tab === 'reviews' && (
          <>
            <div className="mb-2 flex items-center gap-3">
              <span className="text-3xl font-semibold text-text-primary">{avgRating.toFixed(1)}</span>
              <div>
                <Stars rating={avgRating} size={16} />
                <p className="text-[11px] text-text-secondary">{reviews.length} reviews</p>
              </div>
            </div>
            {reviews.map((review) => (
              <ScCard key={review.id}>
                <div className="flex items-center gap-2">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-accent-muted text-[11px] font-semibold text-brand-red">
                    {review.userName.slice(0, 2).toUpperCase()}
                  </div>
                  <div className="flex-1">
                    <p className="text-[13px] font-medium text-text-primary">{review.userName}</p>
                    <p className="text-[10px] text-text-muted">{review.date}</p>
                  </div>
                  <Stars rating={review.rating} size={12} />
                </div>
                <p className="mt-2 text-[13px] text-text-secondary">{review.comment}</p>
              </ScCard>
            ))}
          </>
        )}
      </div>

      <div className="fixed bottom-0 left-1/2 z-40 w-full max-w-[428px] -translate-x-1/2 border-t border-border bg-brand-black px-4 py-3">
        <ScButton onClick={handleBook}>Book now</ScButton>
      </div>
    </AppShell>
  )
}
