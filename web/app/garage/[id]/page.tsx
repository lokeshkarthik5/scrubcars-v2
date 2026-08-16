'use client'

import { use, useEffect, useMemo, useState } from 'react'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import {
  IconArrowLeft,
  IconBuildingStore,
  IconCheck,
  IconClock,
  IconHeart,
  IconHeartFilled,
  IconHome,
  IconMapPin,
  IconSearch,
  IconStarFilled,
  IconX,
} from '@tabler/icons-react'
import { AppShell } from '@/components/sc/app-shell'
import { ScBadge } from '@/components/sc/badge'
import { ScButton } from '@/components/sc/button'
import { ScCard } from '@/components/sc/card'
import { Stars } from '@/components/sc/stars'
import { getVendorReviews } from '@/lib/api/reviews'
import { getVendorServices } from '@/lib/api/services'
import { getVendorPackages } from '@/lib/api/packages'
import { getVendor } from '@/lib/api/vendors'
import { categoryLabel } from '@/lib/categories'
import { useAuthStore } from '@/lib/stores/auth-store'
import type {
  Review,
  Service,
  ServicePackage,
  Vendor,
  VehicleType,
} from '@/lib/types'
import { formatServicePrice, tierPriceFor } from '@/lib/pricing'
import { cn, formatDuration } from '@/lib/utils'

type Tab = 'services' | 'photos' | 'reviews'
type Mode = 'dropin' | 'doorstep'

const VEHICLE_TIERS: Array<{ type: VehicleType; label: string }> = [
  { type: 'hatchback', label: 'Hatchback' },
  { type: 'sedan', label: 'Sedan' },
  { type: 'suv', label: 'SUV' },
]

export default function GaragePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()
  const user = useAuthStore((s) => s.user)

  const [vendor, setVendor] = useState<Vendor | null>(null)
  const [services, setServices] = useState<Service[]>([])
  const [packages, setPackages] = useState<ServicePackage[]>([])
  const [reviews, setReviews] = useState<Review[]>([])
  const [tab, setTab] = useState<Tab>('services')
  const [mode, setMode] = useState<Mode>('dropin')
  const [query, setQuery] = useState('')
  const [favourite, setFavourite] = useState(false)
  // One service per booking — matches createBookingSchema on the server.
  const [selected, setSelected] = useState<string | null>(null)
  // The service whose details popup is open, if any.
  const [details, setDetails] = useState<Service | null>(null)

  useEffect(() => {
    getVendor(id).then((v) => {
      setVendor(v ?? null)
      if (v && !v.dropinEnabled && v.doorstepEnabled) setMode('doorstep')
    })
    getVendorServices(id).then(setServices)
    getVendorPackages(id).then(setPackages)
    getVendorReviews(id).then(setReviews)
  }, [id])

  // Escape closes the details popup, matching the click-outside affordance.
  useEffect(() => {
    if (!details) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setDetails(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [details])

  const matchesQuery = (s: Service, q: string) =>
    s.name.toLowerCase().includes(q) ||
    (s.description ?? '').toLowerCase().includes(q)

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return services
    return services.filter((s) => matchesQuery(s, q))
  }, [services, query])

  // A package also matches on the names of the services it contains, so
  // searching "coating" surfaces the bundle that includes it.
  const filteredPackages = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return packages
    return packages.filter(
      (p) =>
        matchesQuery(p, q) ||
        p.items.some((item) => item.name.toLowerCase().includes(q))
    )
  }, [packages, query])

  // Packages are services, so a selected package resolves through the same
  // lookup and books through the same flow — no separate booking path.
  const selectedService =
    [...services, ...packages].find((s) => s.id === selected) ?? null

  const toggle = (serviceId: string) =>
    setSelected((current) => (current === serviceId ? null : serviceId))

  const handleBook = () => {
    if (!selected) return
    const bookPath = `/book/${id}?service=${selected}`
    router.push(user ? bookPath : `/login?next=${encodeURIComponent(bookPath)}`)
  }

  if (!vendor) {
    return (
      <AppShell className="items-center justify-center py-4">
        <p className="text-[13px] text-text-secondary">Loading…</p>
      </AppShell>
    )
  }

  const avgRating =
    reviews.length > 0
      ? reviews.reduce((s, r) => s + r.rating, 0) / reviews.length
      : vendor.rating
  const hero = vendor.photos[0] ?? vendor.logoUrl
  const hasDistance = /\d/.test(vendor.distance)
  const bothModes = vendor.dropinEnabled && vendor.doorstepEnabled

  return (
    <AppShell className={cn('px-0', selected ? 'pb-28' : 'pb-6')}>
      {/* Hero — full-bleed cover with the back/favourite controls floated on top. */}
      <div className="relative h-[210px] w-full shrink-0 bg-surface-elevated">
        {hero ? (
          <Image
            src={hero}
            alt={vendor.name}
            fill
            priority
            sizes="428px"
            className="object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-surface-elevated to-surface">
            <IconBuildingStore size={40} className="text-text-muted" />
          </div>
        )}
        <div className="absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-black/60 to-transparent" />
        <button
          type="button"
          onClick={() => router.back()}
          aria-label="Go back"
          className="absolute left-4 top-4 flex h-9 w-9 items-center justify-center rounded-full bg-black/45 text-brand-white backdrop-blur-sm"
        >
          <IconArrowLeft size={20} />
        </button>
        <button
          type="button"
          onClick={() => setFavourite((f) => !f)}
          aria-label={favourite ? 'Remove from favourites' : 'Save to favourites'}
          className="absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-full bg-black/45 backdrop-blur-sm"
        >
          {favourite ? (
            <IconHeartFilled size={20} className="text-brand-red" />
          ) : (
            <IconHeart size={20} className="text-brand-white" />
          )}
        </button>
      </div>

      <div className="flex flex-col gap-3 px-4 pt-4">
        <div className="flex items-start justify-between gap-3">
          <h1 className="text-[22px] font-bold tracking-tight text-text-primary">{vendor.name}</h1>
          {vendor.status === 'open' && (
            <ScBadge variant="success" className="mt-1.5 shrink-0 uppercase tracking-wide">
              Open
            </ScBadge>
          )}
        </div>

        <div className="flex items-center gap-1.5 text-[13px] text-text-secondary">
          <IconStarFilled size={13} className="text-warning" />
          <span className="font-semibold text-text-primary">{avgRating.toFixed(1)}</span>
          <span>({reviews.length} reviews)</span>
          {hasDistance && (
            <>
              <span>·</span>
              <span>{vendor.distance}</span>
            </>
          )}
        </div>

        {vendor.area && (
          <div className="flex">
            <span className="flex items-center gap-1.5 rounded-full bg-surface px-3 py-1.5 text-[12px] text-text-secondary">
              <IconMapPin size={13} />
              {vendor.area}
            </span>
          </div>
        )}

        {bothModes && (
          <div className="mt-1 flex rounded-[12px] bg-surface p-1">
            {(
              [
                { value: 'dropin', label: 'At Garage', icon: IconBuildingStore },
                { value: 'doorstep', label: 'Doorstep', icon: IconHome },
              ] as const
            ).map(({ value, label, icon: Icon }) => (
              <button
                key={value}
                type="button"
                onClick={() => setMode(value)}
                className={cn(
                  'flex flex-1 items-center justify-center gap-1.5 rounded-[9px] py-2.5 text-[13px] font-medium transition-colors',
                  mode === value
                    ? 'bg-surface-elevated text-text-primary ring-1 ring-border'
                    : 'text-text-secondary'
                )}
              >
                <Icon size={15} />
                {label}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="mt-4 flex border-b border-border px-4">
        {(
          [
            { key: 'services', label: 'Services' },
            { key: 'photos', label: 'Photos' },
            { key: 'reviews', label: 'Reviews' },
          ] as const
        ).map((t) => (
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

      <div className="flex flex-col gap-3 px-4 py-4">
        {tab === 'services' && (
          <>
            <label className="flex items-center gap-2.5 rounded-[12px] border border-border bg-surface px-3.5 py-3 focus-within:border-brand-red">
              <IconSearch size={17} className="text-text-secondary" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search services..."
                className="w-full bg-transparent text-[13px] text-text-primary outline-none"
              />
            </label>

            {filteredPackages.length > 0 && (
              <>
                <div className="flex items-center justify-between">
                  <h2 className="text-[15px] font-semibold text-text-primary">
                    Packages
                  </h2>
                  <span className="text-[12px] text-text-secondary">
                    {filteredPackages.length}{' '}
                    {filteredPackages.length === 1 ? 'package' : 'packages'}
                  </span>
                </div>

                {filteredPackages.map((pkg) => {
                  const added = selected === pkg.id
                  return (
                    <ScCard
                      key={pkg.id}
                      className={cn(
                        'transition-colors',
                        added && 'border-brand-red/50'
                      )}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <p className="text-[14px] font-semibold text-text-primary">
                          {pkg.name}
                        </p>
                        <div className="shrink-0 text-right">
                          <span className="text-[14px] font-semibold text-text-primary">
                            {formatServicePrice(pkg)}
                          </span>
                          {pkg.savings !== null && (
                            <p className="text-[11px] text-text-secondary line-through">
                              ₹{pkg.itemsTotal}
                            </p>
                          )}
                        </div>
                      </div>

                      {pkg.savings !== null && (
                        <span className="mt-1.5 inline-block rounded-[6px] bg-brand-red/10 px-2 py-0.5 text-[11px] font-semibold text-brand-red">
                          Save ₹{pkg.savings}
                        </span>
                      )}

                      {pkg.description && (
                        <p className="mt-1 text-[12px] text-text-secondary">
                          {pkg.description}
                        </p>
                      )}

                      <ul className="mt-2 flex flex-col gap-1">
                        {pkg.items.map((item) => (
                          <li
                            key={item.serviceId}
                            className="flex items-center gap-1.5 text-[12px] text-text-secondary"
                          >
                            <IconCheck size={13} className="shrink-0 text-brand-red" />
                            {item.name}
                          </li>
                        ))}
                      </ul>

                      <div className="mt-3 flex items-center justify-between">
                        <span className="flex items-center gap-1.5 text-[12px] text-text-secondary">
                          <IconClock size={13} />
                          {formatDuration(pkg.durationMins)}
                        </span>
                        <button
                          type="button"
                          onClick={() => toggle(pkg.id)}
                          className={cn(
                            'flex items-center gap-1 rounded-[9px] px-4 py-1.5 text-[12px] font-semibold transition-colors',
                            added
                              ? 'bg-brand-white text-brand-black'
                              : 'bg-surface-elevated text-text-primary ring-1 ring-border'
                          )}
                        >
                          {added && <IconCheck size={13} />}
                          {added ? 'Added' : 'Add'}
                        </button>
                      </div>
                    </ScCard>
                  )
                })}
              </>
            )}

            <div className="flex items-center justify-between">
              <h2 className="text-[15px] font-semibold text-text-primary">Services Available</h2>
              <span className="text-[12px] text-text-secondary">
                {filtered.length} {filtered.length === 1 ? 'service' : 'services'}
              </span>
            </div>

            {filtered.length === 0 ? (
              <p className="py-6 text-center text-[13px] text-text-secondary">
                {services.length === 0
                  ? 'No services available yet.'
                  : 'No services match that search.'}
              </p>
            ) : (
              filtered.map((svc) => {
                const added = selected === svc.id
                return (
                  <ScCard
                    key={svc.id}
                    className={cn('transition-colors', added && 'border-brand-red/50')}
                  >
                    {/* Tapping the card body opens the details popup; the Add
                        button below stays a separate action. */}
                    <button
                      type="button"
                      onClick={() => setDetails(svc)}
                      aria-label={`View details for ${svc.name}`}
                      className="w-full text-left"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <p className="text-[14px] font-semibold text-text-primary">{svc.name}</p>
                        <span className="shrink-0 text-[14px] font-semibold text-text-primary">
                          {formatServicePrice(svc)}
                        </span>
                      </div>
                      {svc.description && (
                        <p className="mt-1 line-clamp-2 text-[12px] text-text-secondary">
                          {svc.description}
                        </p>
                      )}
                    </button>
                    <div className="mt-3 flex items-center justify-between">
                      <span className="flex items-center gap-1.5 text-[12px] text-text-secondary">
                        <IconClock size={13} />
                        {formatDuration(svc.durationMins)}
                      </span>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setDetails(svc)}
                          className="rounded-[9px] px-2 py-1.5 text-[12px] font-medium text-text-secondary transition-colors hover:text-text-primary"
                        >
                          Details
                        </button>
                        <button
                          type="button"
                          onClick={() => toggle(svc.id)}
                          className={cn(
                            'flex items-center gap-1 rounded-[9px] px-4 py-1.5 text-[12px] font-semibold transition-colors',
                            added
                              ? 'bg-brand-white text-brand-black'
                              : 'bg-surface-elevated text-text-primary ring-1 ring-border'
                          )}
                        >
                          {added && <IconCheck size={13} />}
                          {added ? 'Added' : 'Add'}
                        </button>
                      </div>
                    </div>
                  </ScCard>
                )
              })
            )}
          </>
        )}

        {tab === 'photos' && (
          <div className="grid grid-cols-2 gap-2">
            {vendor.photos.length > 0 ? (
              vendor.photos.map((url, i) => (
                <div
                  key={url}
                  className="relative aspect-square overflow-hidden rounded-[10px] bg-surface"
                >
                  <Image
                    src={url}
                    alt={`${vendor.name} ${i + 1}`}
                    fill
                    sizes="(max-width: 428px) 50vw, 200px"
                    className="object-cover"
                  />
                </div>
              ))
            ) : (
              <p className="col-span-2 py-6 text-center text-[13px] text-text-secondary">
                No photos yet.
              </p>
            )}
          </div>
        )}

        {tab === 'reviews' && (
          <>
            <div className="mb-2 flex items-center gap-3">
              <span className="text-3xl font-semibold text-text-primary">
                {avgRating.toFixed(1)}
              </span>
              <div>
                <Stars rating={avgRating} size={16} />
                <p className="text-[11px] text-text-secondary">{reviews.length} reviews</p>
              </div>
            </div>
            {reviews.length === 0 && (
              <p className="py-4 text-center text-[13px] text-text-secondary">No reviews yet.</p>
            )}
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

      {/* Sticky bar — appears once a service is picked, per the design. */}
      {selectedService && (
        <div className="fixed bottom-0 left-1/2 z-40 flex w-full max-w-[428px] -translate-x-1/2 items-center gap-3 border-t border-border bg-brand-black px-4 py-3">
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13px] text-text-secondary">{selectedService.name}</p>
            <p className="text-[15px] font-semibold text-text-primary">
              {formatServicePrice(selectedService)}
            </p>
          </div>
          <ScButton fullWidth={false} className="px-8" onClick={handleBook}>
            Book Now
          </ScButton>
        </div>
      )}

      {details && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-6"
          onClick={() => setDetails(null)}
          role="dialog"
          aria-modal="true"
          aria-label={`${details.name} details`}
        >
          <div
            className="max-h-[80vh] w-full max-w-[360px] overflow-y-auto rounded-[20px] border border-border bg-brand-black px-4 pb-5 pt-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <h2 className="text-base font-semibold text-text-primary">{details.name}</h2>
              <button
                type="button"
                onClick={() => setDetails(null)}
                aria-label="Close"
                className="-mr-1 -mt-1 shrink-0 rounded-lg p-1 text-text-secondary transition-colors hover:text-text-primary"
              >
                <IconX size={18} />
              </button>
            </div>

            <div className="mt-2 flex flex-wrap items-center gap-2">
              <ScBadge variant="muted">{categoryLabel(details.category)}</ScBadge>
              <span className="flex items-center gap-1.5 text-[11px] text-text-secondary">
                <IconClock size={12} />
                {formatDuration(details.durationMins)}
              </span>
            </div>

            <p className="mt-3 whitespace-pre-line text-[13px] text-text-secondary">
              {details.description || 'No description available for this service.'}
            </p>

            {/* Per-vehicle services price by tier, so show the breakdown rather
                than cramming it into one line as the card does. */}
            <div className="mt-4 border-t border-border pt-3">
              {details.pricingType === 'per_vehicle' ? (
                <>
                  <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-text-secondary">
                    Price by vehicle
                  </p>
                  {VEHICLE_TIERS.map(({ type, label }) => {
                    const price = tierPriceFor(details, type)
                    if (price == null) return null
                    return (
                      <div key={type} className="flex items-center justify-between py-0.5">
                        <span className="text-[13px] text-text-secondary">{label}</span>
                        <span className="text-[13px] font-semibold text-text-primary">
                          ₹{price}
                        </span>
                      </div>
                    )
                  })}
                </>
              ) : (
                <div className="flex items-center justify-between">
                  <span className="text-[13px] text-text-secondary">
                    {details.pricingType === 'on_inspection' ? 'Inspection fee' : 'Price'}
                  </span>
                  <span className="text-[15px] font-semibold text-text-primary">
                    ₹{details.price}
                  </span>
                </div>
              )}
              {details.pricingType === 'on_inspection' && (
                <p className="mt-1.5 text-[11px] text-text-muted">
                  Final work is quoted after the inspection.
                </p>
              )}
            </div>

            <ScButton
              className="mt-5"
              onClick={() => {
                toggle(details.id)
                setDetails(null)
              }}
            >
              {selected === details.id ? 'Remove from booking' : 'Add to booking'}
            </ScButton>
          </div>
        </div>
      )}
    </AppShell>
  )
}
