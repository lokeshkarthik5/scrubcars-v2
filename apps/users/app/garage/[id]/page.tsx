'use client'

import { use, useEffect, useMemo, useState } from 'react'
import Image from 'next/image'
import { useRouter, useSearchParams } from 'next/navigation'
import {
  IconArrowLeft,
  IconBuildingStore,
  IconCheck,
  IconClock,
  IconHeart,
  IconHeartFilled,
  IconHome,
  IconMapPin,
  IconPlus,
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
import {
  BOOKING_TYPE_LABELS,
  bookingTypeParam,
  parseBookingType,
  resolveBookingType,
} from '@repo/core/booking-types'
import { useAuthStore } from '@repo/core/stores/auth-store'
import { coarse, useLocationStore } from '@repo/core/stores/location-store'
import { toMinutes, useTravelTime } from '@repo/core/api/hooks/use-travel-time'
import { useVendorWorkingHours } from '@repo/core/api/hooks/use-slots'
import type {
  BookingType,
  Review,
  Service,
  ServicePackage,
  Vendor,
} from '@repo/core/types'
import { formatServicePrice, tierPriceFor } from '@repo/core/pricing'
import { Figures } from '@repo/ui/sc/figures'
import { VEHICLE_TIERS } from '@repo/core/vehicles'
import { cn, formatDuration } from '@repo/core/utils'
import { OpenStatus } from '@/components/open-status'

type Tab = 'services' | 'photos' | 'reviews'

// A package is a Service plus its contents, so the details popup takes either
// and only the bundle-specific block below depends on the difference.
const isPackage = (item: Service | ServicePackage): item is ServicePackage =>
  'items' in item

/**
 * The body of a service or package card, which is the card's details control.
 *
 * Its ::after is stretched over the whole card (ScCard is `relative`), so a tap
 * anywhere on the card opens the details — the separate "Details" button that
 * used to sit beside Add did exactly the same thing and is gone. The overlay
 * also carries the hover/press tint and the keyboard focus ring, so focus
 * outlines the card the customer is on rather than a sliver of text. The
 * radius is inherited through the button so it follows ScCard's.
 */
const CARD_DETAILS_TRIGGER = cn(
  'w-full cursor-pointer rounded-[inherit] text-left focus-visible:outline-none',
  "after:absolute after:-inset-px after:rounded-[inherit] after:content-['']",
  'after:transition-colors after:duration-150 after:ease-[cubic-bezier(0.2,0,0,1)]',
  'hover:after:bg-text-primary/[0.03] active:after:bg-text-primary/[0.06]',
  'focus-visible:after:ring-2 focus-visible:after:ring-text-primary/70'
)

/**
 * The Add / Added toggle on a service or package card.
 *
 * 44px tall, the comfortable thumb size, and the same width in both states so
 * nothing shifts on tap. Red only while it invites an add; once added it
 * settles to a graphite outline with a check, so a page with several picks is
 * not a column of bright pills competing with Book Now. `relative z-10` lifts
 * it above the card's stretched details layer, keeping it a separate target.
 */
function AddToBookingButton({
  name,
  added,
  onToggle,
}: {
  name: string
  added: boolean
  onToggle: () => void
}) {
  return (
    <button
      type="button"
      // Five identical "Add" buttons on a page are five identical
      // announcements; the name has to say what is being added.
      aria-label={added ? `Remove ${name} from booking` : `Add ${name} to booking`}
      aria-pressed={added}
      onClick={onToggle}
      className={cn(
        'press relative z-10 inline-flex h-11 min-w-[104px] shrink-0 cursor-pointer items-center justify-center gap-1.5 rounded-[8px] border px-4 text-[14px] font-semibold',
        'transition-colors duration-150 ease-[cubic-bezier(0.2,0,0,1)]',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-text-primary/70 focus-visible:ring-offset-2 focus-visible:ring-offset-surface',
        added
          ? 'border-text-primary/40 bg-surface-elevated text-text-primary hover:border-text-primary/60'
          : 'border-transparent bg-brand-red text-white hover:bg-brand-red-hover active:bg-brand-red-hover'
      )}
    >
      {added ? (
        <IconCheck size={16} stroke={2.5} aria-hidden="true" />
      ) : (
        <IconPlus size={16} stroke={2.5} aria-hidden="true" />
      )}
      {added ? 'Added' : 'Add'}
    </button>
  )
}

export default function GaragePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = use(params)
  // From the live URL, not the page's searchParams prop: changeMode writes
  // the choice into the URL with replaceState, and on Back from checkout the
  // prop still holds the payload cached before that write, while the router's
  // URL — what this reads — has the choice.
  const modeParam = useSearchParams().get('mode')
  const router = useRouter()
  const user = useAuthStore((s) => s.user)
  // Named to avoid shadowing the DOM's global `location`.
  const activeLocation = useLocationStore((s) => s.location)

  const [vendor, setVendor] = useState<Vendor | null>(null)
  const [services, setServices] = useState<Service[]>([])
  const [packages, setPackages] = useState<ServicePackage[]>([])
  const [reviews, setReviews] = useState<Review[]>([])
  const [tab, setTab] = useState<Tab>('services')
  // The At garage / Doorstep choice, as made on home or here. Null until one
  // is made; `mode` below is what the garage can actually do with it.
  const [chosenMode, setChosenMode] = useState<BookingType | null>(() =>
    parseBookingType(modeParam)
  )
  const [query, setQuery] = useState('')
  const [favourite, setFavourite] = useState(false)
  // Several services can go into one booking. Order matters: it is the order
  // they were added, and it is what the summary, the receipt and the vendor's
  // job list all show.
  const [selected, setSelected] = useState<string[]>([])
  // The service or package whose details popup is open, if any.
  const [details, setDetails] = useState<Service | ServicePackage | null>(null)

  useEffect(() => {
    getVendor(id).then((v) => setVendor(v ?? null))
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

  // Derived rather than set when the garage loads: a garage that only travels
  // is Doorstep whatever was chosen, and one that does both honours the
  // choice, with no render in between where the toggle shows the wrong one.
  const mode = resolveBookingType(chosenMode, vendor)

  const changeMode = (next: BookingType) => {
    setChosenMode(next)
    // Mirrored into the URL so Back from checkout lands on the same choice.
    // replaceState rather than router.replace: nothing needs re-rendering,
    // and Next keeps its router in step with the native history call.
    const url = new URLSearchParams(window.location.search)
    const param = bookingTypeParam(next)
    if (param) url.set('mode', param)
    else url.delete('mode')
    const search = url.toString()
    window.history.replaceState(
      null,
      '',
      search ? `?${search}` : window.location.pathname
    )
  }

  const handleBook = () => {
    if (selected.length === 0) return
    // The mode rides along so checkout opens on it. Without it checkout reset
    // to At garage, and a Doorstep customer had to choose a third time.
    const modeQuery = bookingTypeParam(mode)
    const bookPath = `/book/${id}?service=${selected.join(',')}${
      modeQuery ? `&mode=${modeQuery}` : ''
    }`
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

  // The same query checkout's slot picker uses to grey out closed days, so
  // the hours read here are already cached by the time Book Now is tapped.
  const workingHours = useVendorWorkingHours(id)

  if (!vendor) {
    return (
      <AppShell className="items-center justify-center py-4">
        <p className="text-[13px] text-text-secondary">Loading…</p>
      </AppShell>
    )
  }

  // A garage with no reviews yet shows none of the rating furniture — a
  // "0.0 (0 reviews)" line reads as a bad score, not as a new listing.
  const reviewCount = reviews.length || vendor.reviewCount
  const hasReviews = reviewCount > 0
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
            // White when saved: a state, not a thing to press, and red on
            // this page belongs to Add and Book Now.
            <IconHeartFilled size={20} className="text-brand-white" />
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
        <div className="flex flex-col gap-1">
          <h1 className="text-[22px] font-bold tracking-tight text-text-primary">{vendor.name}</h1>
          {/* From the garage's hours, read in IST — never from the account
              status, which is "active" at 2 AM too. Absent until the hours
              arrive, and for good if the garage has not set any. */}
          <OpenStatus hours={workingHours.data} />
        </div>

        {/* Score, distance and drive time are figures, in the brand's numeric
            face; the words between them stay Inter. */}
        <div className="flex items-center gap-1.5 text-[13px] text-text-secondary">
          {hasReviews ? (
            <>
              <IconStarFilled size={13} className="text-warning" />
              <span className="font-numeric font-bold text-text-primary">{avgRating.toFixed(1)}</span>
              <span>
                ({reviewCount} {reviewCount === 1 ? 'review' : 'reviews'})
              </span>
            </>
          ) : (
            <span className="font-medium text-text-primary">New on Detlio</span>
          )}
          {hasDistance && (
            <>
              <span>·</span>
              <span className="font-numeric font-medium">{vendor.distance}</span>
            </>
          )}
          {/* Straight-line distance above, driving time here — kept as two
              separate facts on purpose. "2.1 km away" across a river is honest;
              calling it an 8-minute drive would not be. */}
          {travel.data && (
            <>
              <span>·</span>
              <span>
                <span className="font-numeric font-medium">
                  {formatDuration(toMinutes(travel.data.durationS))}
                </span>{' '}
                drive
              </span>
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
            onChange={changeMode}
            options={[
              {
                value: 'dropin',
                label: BOOKING_TYPE_LABELS.dropin,
                icon: <IconBuildingStore size={15} />,
              },
              {
                value: 'doorstep',
                label: BOOKING_TYPE_LABELS.doorstep,
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
        )
          .filter((t) => t.key !== 'reviews' || hasReviews)
          .map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={tab === t.key}
            onClick={() => setTab(t.key)}
            // White, not red: with an Add button on every card and Book Now
            // below, a red tab as well pushed this page past the brand's
            // 5–8% budget for red.
            className={cn(
              'flex-1 border-b-2 py-2.5 text-[13px] font-medium transition-colors',
              tab === t.key
                ? 'border-text-primary text-text-primary'
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
            <label className="flex items-center gap-2.5 rounded-[12px] border border-border bg-surface px-3.5 py-3 focus-within:border-text-secondary">
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
                        'relative transition-colors',
                        added && 'border-text-primary/30'
                      )}
                    >
                      {/* Same affordance as a service card: the whole card
                          opens the details popup, the Add button stays
                          separate. */}
                      <button
                        type="button"
                        onClick={() => openDetails(pkg)}
                        aria-label={`View details for ${pkg.name}`}
                        className={CARD_DETAILS_TRIGGER}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <p className="min-w-0 flex-1 text-[14px] font-semibold text-text-primary">
                            {pkg.name}
                          </p>
                          <div className="shrink-0 text-right">
                            <span className="text-[14px] font-bold text-text-primary">
                              <Figures text={formatServicePrice(pkg)} />
                            </span>
                            {/* The struck-through total only lines up with a
                                single price. A per-vehicle bundle shows a range,
                                so one "before" figure would be comparing against
                                the wrong vehicle. */}
                            {pkg.tierBreakdown === null && pkg.savings !== null && (
                              <p className="font-numeric text-[11px] font-medium text-text-secondary line-through">
                                ₹{pkg.itemsTotal}
                              </p>
                            )}
                          </div>
                        </div>

                        {/* A graphite tag with white text. It was red, which
                            made a saving read like a button — on a card whose
                            only button is the red Add below it. */}
                        {pkg.savings !== null && (
                          <span className="mt-1.5 inline-block rounded-[4px] bg-surface-elevated px-2 py-0.5 text-[11px] font-semibold text-text-primary">
                            Save{' '}
                            <span className="font-numeric font-bold">
                              ₹{pkg.savings}
                              {pkg.tierBreakdown ? '+' : ''}
                            </span>
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
                              <IconCheck size={13} className="shrink-0 text-text-secondary" />
                              {item.name}
                            </li>
                          ))}
                        </ul>
                      </button>

                      <div className="mt-3 flex items-center justify-between">
                        <span className="flex items-center gap-1.5 text-[12px] text-text-secondary">
                          <IconClock size={13} />
                          <span className="font-numeric font-medium">
                            {formatDuration(pkg.durationMins)}
                          </span>
                        </span>
                        <AddToBookingButton
                          name={pkg.name}
                          added={added}
                          onToggle={() => toggle(pkg.id)}
                        />
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
                    className={cn(
                      'relative transition-colors',
                      added && 'border-text-primary/30'
                    )}
                  >
                    {/* Tapping anywhere on the card opens the details popup;
                        the Add button below stays a separate action. */}
                    <button
                      type="button"
                      onClick={() => openDetails(svc)}
                      aria-label={`View details for ${svc.name}`}
                      className={CARD_DETAILS_TRIGGER}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <p className="min-w-0 flex-1 text-[14px] font-semibold text-text-primary">
                          {svc.name}
                        </p>
                        <span className="shrink-0 text-[14px] font-bold text-text-primary">
                          <Figures text={formatServicePrice(svc)} />
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
                        <span className="font-numeric font-medium">
                          {formatDuration(svc.durationMins)}
                        </span>
                      </span>
                      <AddToBookingButton
                        name={svc.name}
                        added={added}
                        onToggle={() => toggle(svc.id)}
                      />
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
              <span className="font-numeric text-3xl font-bold text-text-primary">
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
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-surface-elevated text-[11px] font-semibold text-text-primary">
                    {review.userName.slice(0, 2).toUpperCase()}
                  </div>
                  <div className="flex-1">
                    <p className="text-[13px] font-medium text-text-primary">{review.userName}</p>
                    <p className="font-numeric text-[10px] font-medium text-text-muted">{review.date}</p>
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
              {selectedServices.length === 1 ? (
                selectedServices[0].name
              ) : (
                <>
                  {selectedServices.length} services ·{' '}
                  <span className="font-numeric font-medium">
                    {formatDuration(selectedDuration)}
                  </span>
                </>
              )}
            </p>
            <p className="truncate text-[15px] font-bold text-text-primary">
              <Figures
                text={
                  selectedServices.length === 1
                    ? formatServicePrice(selectedServices[0])
                    : // "from" because a per-vehicle line is only priced once
                      // the car is known, one screen along.
                      `${hasPerVehiclePricing ? 'from ' : ''}₹${selectedTotal.toLocaleString('en-IN')}`
                }
              />
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
                <span className="font-numeric font-medium">
                  {formatDuration(details.durationMins)}
                </span>
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
                      <IconCheck size={13} className="shrink-0 text-text-secondary" />
                      {item.name}
                    </li>
                  ))}
                </ul>
                {/* A per-vehicle bundle's saving differs per vehicle, so it is
                    shown on the tier rows below instead of as one figure. */}
                {details.tierBreakdown === null && details.savings !== null && (
                  <p className="mt-2 text-[12px] font-semibold text-text-primary">
                    Save <span className="font-numeric font-bold">₹{details.savings}</span> vs{' '}
                    <span className="font-numeric font-bold">₹{details.itemsTotal}</span> separately
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
                              <span className="text-[11px] font-medium text-text-secondary">
                                save{' '}
                                <span className="font-numeric">₹{tierSavings}</span>
                              </span>
                            )}
                            <span className="font-numeric text-[13px] font-bold text-text-primary">
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
                  <span className="font-numeric text-[15px] font-bold text-text-primary">
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

            {/* Red only while it adds: removing is the quieter action, the
                same way the card's Added state is. */}
            <ScButton
              className="mt-5"
              variant={selected.includes(details.id) ? 'secondary' : 'primary'}
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
