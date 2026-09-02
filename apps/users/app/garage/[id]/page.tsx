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
} from '@tabler/icons-react'
import { AppShell } from '@repo/ui/sc/app-shell'
import { ScBadge } from '@repo/ui/sc/badge'
import { ScButton } from '@repo/ui/sc/button'
import { ScCard } from '@repo/ui/sc/card'
import { ScSegmented } from '@repo/ui/sc/segmented'
import { ScSheet } from '@repo/ui/sc/modal'
import { Reveal } from '@repo/ui/sc/reveal'
import { Stars } from '@repo/ui/sc/stars'
import { getVendorReviews } from '@repo/core/api/reviews'
import { getVendorServices } from '@repo/core/api/services'
import { getVendorPackages } from '@repo/core/api/packages'
import { getVendor } from '@repo/core/api/vendors'
import { categoryLabel } from '@repo/core/categories'
import { useAuthStore } from '@repo/core/stores/auth-store'
import { coarse, useLocationStore } from '@repo/core/stores/location-store'
import { toMinutes, useTravelTime } from '@repo/core/api/hooks/use-travel-time'
import type { Review, Service, ServicePackage, Vendor } from '@repo/core/types'
import { formatServicePrice, tierPriceFor } from '@repo/core/pricing'
import { VEHICLE_TIERS } from '@repo/core/vehicles'
import { cn, formatDuration } from '@repo/core/utils'

type Tab = 'services' | 'photos' | 'reviews'
type Mode = 'dropin' | 'doorstep'

// A package is a Service plus its contents, so the details popup takes either
// and only the bundle-specific block below depends on the difference.
const isPackage = (item: Service | ServicePackage): item is ServicePackage =>
  'items' in item

export default function GaragePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()
  const user = useAuthStore((s) => s.user)
  // Named to avoid shadowing the DOM's global `location`.
  const activeLocation = useLocationStore((s) => s.location)

  const [vendor, setVendor] = useState<Vendor | null>(null)
  const [services, setServices] = useState<Service[]>([])
  const [packages, setPackages] = useState<ServicePackage[]>([])
  const [reviews, setReviews] = useState<Review[]>([])
  const [tab, setTab] = useState<Tab>('services')
  const [mode, setMode] = useState<Mode>('dropin')
  const [query, setQuery] = useState('')
  const [favourite, setFavourite] = useState(false)
  // Several services can go into one booking. Order matters: it is the order
  // they were added, and it is what the summary, the receipt and the vendor's
  // job list all show.
  const [selected, setSelected] = useState<string[]>([])
  // The service or package whose details popup is open, if any.
  const [details, setDetails] = useState<Service | ServicePackage | null>(null)

  useEffect(() => {
    getVendor(id).then((v) => {
      setVendor(v ?? null)
      if (v && !v.dropinEnabled && v.doorstepEnabled) setMode('doorstep')
    })
    getVendorServices(id).then(setServices)
    getVendorPackages(id).then(setPackages)
    getVendorReviews(id).then(setReviews)
  }, [id])

  // Open/closed is tracked separately from *what* is shown: the popup animates
  // out, so it has to keep rendering its contents after being dismissed.
  // Closing therefore only flips this flag and leaves `details` in place, where
  // it stays until the next service replaces it.
  // (Escape and the scroll lock live in ScSheet.)
  const [detailsOpen, setDetailsOpen] = useState(false)

  const openDetails = (item: Service | ServicePackage) => {
    setDetails(item)
    setDetailsOpen(true)
  }

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
  // lookup and books through the same flow — no separate booking path. A
  // package still counts as one line: it is priced and sold as a bundle, and
  // expanding it into its members here would double-charge.
  const selectedServices = useMemo(() => {
    const catalogue = [...services, ...packages]
    return selected
      .map((serviceId) => catalogue.find((s) => s.id === serviceId))
      .filter((s): s is Service | ServicePackage => s != null)
  }, [selected, services, packages])

  const toggle = (serviceId: string) =>
    setSelected((current) =>
      current.includes(serviceId)
        ? current.filter((id) => id !== serviceId)
        : [...current, serviceId]
    )

  // The running total is the sum of the list prices. For a per-vehicle service
  // that is the "from" price — the car is not known until the next screen, so
  // this is deliberately the same figure the cards show, and the checkout
  // summary is where the real per-vehicle amount appears.
  const selectedTotal = selectedServices.reduce(
    (total, service) => total + service.price,
    0
  )
  const selectedDuration = selectedServices.reduce(
    (total, service) => total + service.durationMins,
    0
  )
  const hasPerVehiclePricing = selectedServices.some(
    (service) => service.pricingType === 'per_vehicle'
  )

  const handleBook = () => {
    if (selected.length === 0) return
    const bookPath = `/book/${id}?service=${selected.join(',')}`
    router.push(user ? bookPath : `/login?next=${encodeURIComponent(bookPath)}`)
  }

  // Routing is the one geo call whose volume tracks browsing rather than saves,
  // so it fires for this one garage only, never for a list. Declared above the
  // loading early-return with the other hooks — the query is disabled until
  // both endpoints are known, so it costs nothing while the vendor loads.
  const travel = useTravelTime(
    activeLocation ? coarse(activeLocation) : null,
    vendor ? { lat: vendor.lat, lng: vendor.lng } : null
  )

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
  // Gallery-only hero — the logo gets its own badge below, so using it as the
  // hero too would repeat the same image.
  const hero = vendor.photos[0] ?? null
  const hasDistance = /\d/.test(vendor.distance)
  const bothModes = vendor.dropinEnabled && vendor.doorstepEnabled

  return (
    <AppShell className={cn('px-0', selected.length > 0 ? 'pb-28' : 'pb-6')}>
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
        {vendor.logoUrl && (
          <div className="absolute bottom-3 left-4 h-14 w-14 overflow-hidden rounded-[14px] border border-white/70 bg-surface shadow-md">
            <Image
              src={vendor.logoUrl}
              alt={`${vendor.name} logo`}
              fill
              sizes="56px"
              className="object-cover"
            />
          </div>
        )}
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
          {/* Straight-line distance above, driving time here — kept as two
              separate facts on purpose. "2.1 km away" across a river is honest;
              calling it an 8-minute drive would not be. */}
          {travel.data && (
            <>
              <span>·</span>
              <span>{formatDuration(toMinutes(travel.data.durationS))} drive</span>
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
          <ScSegmented
            aria-label="Service mode"
            className="mt-1"
            value={mode}
            onChange={setMode}
            options={[
              {
                value: 'dropin',
                label: 'At Garage',
                icon: <IconBuildingStore size={15} />,
              },
              {
                value: 'doorstep',
                label: 'Doorstep',
                icon: <IconHome size={15} />,
              },
            ]}
          />
        )}
      </div>

      <div className="mt-4 flex border-b border-border px-4" role="tablist" aria-label="Garage sections">
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
            role="tab"
            aria-selected={tab === t.key}
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

                {filteredPackages.map((pkg, i) => {
                  const added = selected.includes(pkg.id)
                  return (
                    <Reveal key={pkg.id} index={i}>
                    <ScCard
                      className={cn(
                        'transition-colors',
                        added && 'border-brand-red/50'
                      )}
                    >
                      {/* Same affordance as a service card: the body opens the
                          details popup, the Add button stays separate. */}
                      <button
                        type="button"
                        onClick={() => openDetails(pkg)}
                        aria-label={`View details for ${pkg.name}`}
                        className="w-full text-left"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <p className="min-w-0 flex-1 text-[14px] font-semibold text-text-primary">
                            {pkg.name}
                          </p>
                          <div className="shrink-0 text-right">
                            <span className="text-[14px] font-semibold text-text-primary">
                              {formatServicePrice(pkg)}
                            </span>
                            {/* The struck-through total only lines up with a
                                single price. A per-vehicle bundle shows a range,
                                so one "before" figure would be comparing against
                                the wrong vehicle. */}
                            {pkg.tierBreakdown === null && pkg.savings !== null && (
                              <p className="text-[11px] text-text-secondary line-through">
                                ₹{pkg.itemsTotal}
                              </p>
                            )}
                          </div>
                        </div>

                        {/* Inset on the page colour rather than a red tint: a
                            10% tint lifted the chip to #2b1819 and left this
                            red label at 4.16:1, under AA. On #0A0A0A it is
                            4.9:1 and still reads as a chip. */}
                        {pkg.savings !== null && (
                          <span className="mt-1.5 inline-block rounded-[6px] bg-brand-black px-2 py-0.5 text-[11px] font-semibold text-brand-red">
                            {pkg.tierBreakdown
                              ? `Save ₹${pkg.savings}+`
                              : `Save ₹${pkg.savings}`}
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
                      </button>

                      <div className="mt-3 flex items-center justify-between">
                        <span className="flex items-center gap-1.5 text-[12px] text-text-secondary">
                          <IconClock size={13} />
                          {formatDuration(pkg.durationMins)}
                        </span>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => openDetails(pkg)}
                            className="rounded-[9px] px-2 py-1.5 text-[12px] font-medium text-text-secondary transition-colors hover:text-text-primary"
                          >
                            Details
                          </button>
                          <button
                            type="button"
                            // Five identical "Add" buttons on a page are five
                            // identical announcements; the name has to say what
                            // is being added.
                            aria-label={
                              added
                                ? `Remove ${pkg.name} from booking`
                                : `Add ${pkg.name} to booking`
                            }
                            aria-pressed={added}
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
                      </div>
                    </ScCard>
                    </Reveal>
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
              filtered.map((svc, i) => {
                const added = selected.includes(svc.id)
                return (
                  <Reveal key={svc.id} index={i}>
                  <ScCard
                    className={cn('transition-colors', added && 'border-brand-red/50')}
                  >
                    {/* Tapping the card body opens the details popup; the Add
                        button below stays a separate action. */}
                    <button
                      type="button"
                      onClick={() => openDetails(svc)}
                      aria-label={`View details for ${svc.name}`}
                      className="w-full text-left"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <p className="min-w-0 flex-1 text-[14px] font-semibold text-text-primary">
                          {svc.name}
                        </p>
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
                          onClick={() => openDetails(svc)}
                          className="rounded-[9px] px-2 py-1.5 text-[12px] font-medium text-text-secondary transition-colors hover:text-text-primary"
                        >
                          Details
                        </button>
                        <button
                          type="button"
                          aria-label={
                            added
                              ? `Remove ${svc.name} from booking`
                              : `Add ${svc.name} to booking`
                          }
                          aria-pressed={added}
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
                  </Reveal>
                )
              })
            )}
          </>
        )}

        {tab === 'photos' && (
          <div className="grid grid-cols-2 gap-2">
            {vendor.photos.length > 0 ? (
              vendor.photos.map((url, i) => (
                <Reveal
                  key={url}
                  index={i}
                  className="relative aspect-square overflow-hidden rounded-[10px] bg-surface"
                >
                  <Image
                    src={url}
                    alt={`${vendor.name} ${i + 1}`}
                    fill
                    sizes="(max-width: 428px) 50vw, 200px"
                    className="object-cover"
                  />
                </Reveal>
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
            {reviews.map((review, i) => (
              <Reveal key={review.id} index={i}>
              <ScCard>
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
              </Reveal>
            ))}
          </>
        )}
      </div>

      {/* Sticky bar — appears once something is picked, per the design. With
          several services it carries the running count, total and combined
          time, because the time is what decides whether the booking will fit
          a slot at all. */}
      {selectedServices.length > 0 && (
        <div className="fixed bottom-0 left-1/2 z-40 flex w-full max-w-[428px] -translate-x-1/2 items-center gap-3 border-t border-border bg-brand-black px-4 py-3">
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13px] text-text-secondary">
              {selectedServices.length === 1
                ? selectedServices[0].name
                : `${selectedServices.length} services · ${formatDuration(selectedDuration)}`}
            </p>
            <p className="truncate text-[15px] font-semibold text-text-primary">
              {selectedServices.length === 1
                ? formatServicePrice(selectedServices[0])
                : // "from" because a per-vehicle line is only priced once the
                  // car is known, one screen along.
                  `${hasPerVehiclePricing ? 'from ' : ''}₹${selectedTotal.toLocaleString('en-IN')}`}
            </p>
          </div>
          <ScButton fullWidth={false} className="px-8" onClick={handleBook}>
            Book Now
          </ScButton>
        </div>
      )}

      {/* A sheet rather than a centred dialog: this is a one-handed phone app,
          so the panel rises from the thumb rather than floating mid-screen,
          and it can grow as tall as its content needs without the cramped
          max-width a centred box imposes. */}
      <ScSheet
        open={detailsOpen}
        onClose={() => setDetailsOpen(false)}
        aria-label={details ? `${details.name} details` : 'Service details'}
        className="px-4 pt-1"
      >
        {details && (
          <>
            {/* No close button: the sheet's own handle, backdrop tap and
                Escape all dismiss it, and the primary action sits at the
                bottom within thumb reach. */}
            <h2 className="text-[17px] font-semibold text-text-primary">
              {details.name}
            </h2>

            {/* Up to three service photos, capped server-side. One fills the
                width; two or three share a row so the popup stays short. */}
            {details.images.length > 0 && (
              <div
                className={cn(
                  'mt-3 grid gap-1.5',
                  details.images.length === 1 ? 'grid-cols-1' : 'grid-cols-3'
                )}
              >
                {details.images.map((image, i) => (
                  <div
                    key={image.id}
                    className={cn(
                      'relative overflow-hidden rounded-[10px] bg-surface',
                      details.images.length === 1 ? 'aspect-[16/10]' : 'aspect-square'
                    )}
                  >
                    <Image
                      src={image.url}
                      alt={`${details.name} ${i + 1}`}
                      fill
                      sizes="(max-width: 428px) 33vw, 120px"
                      className="object-cover"
                    />
                  </div>
                ))}
              </div>
            )}

            <div className="mt-2 flex flex-wrap items-center gap-2">
              <ScBadge variant="muted">{categoryLabel(details.category)}</ScBadge>
              <span className="flex items-center gap-1.5 text-[11px] text-text-secondary">
                <IconClock size={12} />
                {formatDuration(details.durationMins)}
              </span>
            </div>

            <p className="mt-3 whitespace-pre-line text-[13px] text-text-secondary">
              {details.description ||
                (isPackage(details)
                  ? 'No description available for this package.'
                  : 'No description available for this service.')}
            </p>

            {/* What the bundle contains, priced against the members' current
                prices — the same numbers the card badges. */}
            {isPackage(details) && (
              <div className="mt-3">
                <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-text-secondary">
                  Included
                </p>
                <ul className="flex flex-col gap-1">
                  {details.items.map((item) => (
                    <li
                      key={item.serviceId}
                      className="flex items-center gap-1.5 text-[13px] text-text-secondary"
                    >
                      <IconCheck size={13} className="shrink-0 text-brand-red" />
                      {item.name}
                    </li>
                  ))}
                </ul>
                {/* A per-vehicle bundle's saving differs per vehicle, so it is
                    shown on the tier rows below instead of as one figure. */}
                {details.tierBreakdown === null && details.savings !== null && (
                  <p className="mt-2 text-[12px] font-semibold text-brand-red">
                    Save ₹{details.savings} vs ₹{details.itemsTotal} separately
                  </p>
                )}
              </div>
            )}

            {/* Per-vehicle services price by tier, so show the breakdown rather
                than cramming it into one line as the card does. */}
            <div className="mt-4 border-t border-border pt-3">
              {details.pricingType === 'per_vehicle' ? (
                <>
                  <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-text-secondary">
                    Price by vehicle
                  </p>
                  {VEHICLE_TIERS.map(({ value: type, label }) => {
                    const price = tierPriceFor(details, type)
                    // A bundle's per-vehicle saving, when this is a package.
                    const tierSavings = isPackage(details)
                      ? (details.tierBreakdown?.[type].savings ?? null)
                      : null
                    return (
                      <div key={type} className="flex items-center justify-between py-0.5">
                        <span className="text-[13px] text-text-secondary">{label}</span>
                        {price == null ? (
                          // Only reachable on services created before every tier
                          // became mandatory. Say so plainly rather than showing
                          // another vehicle's price — booking would be refused.
                          <span className="text-[12px] text-text-muted">
                            Price on request
                          </span>
                        ) : (
                          <span className="flex items-center gap-2">
                            {tierSavings !== null && (
                              <span className="text-[11px] font-medium text-brand-red">
                                save ₹{tierSavings}
                              </span>
                            )}
                            <span className="text-[13px] font-semibold text-text-primary">
                              ₹{price}
                            </span>
                          </span>
                        )}
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
                setDetailsOpen(false)
              }}
            >
              {selected.includes(details.id)
                ? 'Remove from booking'
                : 'Add to booking'}
            </ScButton>
          </>
        )}
      </ScSheet>
    </AppShell>
  )
}
