'use client'

import { use, useEffect, useMemo, useRef, useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import {
  IconArrowLeft,
  IconArrowUpRight,
  IconBuildingStore,
  IconCheck,
  IconClock,
  IconMapPin,
  IconPlus,
  IconSearch,
  IconStarFilled,
} from '@tabler/icons-react'
import { AppShell } from '@repo/ui/sc/app-shell'
import { ScBadge } from '@repo/ui/sc/badge'
import { ScButton } from '@repo/ui/sc/button'
import { ScCard } from '@repo/ui/sc/card'
import { ErrorState } from '@repo/ui/sc/empty-state'
import { ScSheet } from '@repo/ui/sc/modal'
import { Notice } from '@repo/ui/sc/notice'
import { Reveal } from '@repo/ui/sc/reveal'
import { Stars } from '@repo/ui/sc/stars'
import { getVendorReviews } from '@repo/core/api/reviews'
import { useGarage } from '@repo/core/api/hooks/use-vendors'
import { browseCategory } from '@repo/core/analytics-events'
import { track } from '@repo/core/analytics'
import { useSavedGarages, useToggleSavedGarage } from '@repo/core/api/hooks/use-favourites'
import { categoryLabel } from '@repo/core/categories'
import {
  bookingTypeParam,
  offeredBookingTypes,
  parseBookingType,
  resolveBookingType,
} from '@repo/core/booking-types'
import { useAuthStore } from '@repo/core/stores/auth-store'
import { coarse, useLocationStore } from '@repo/core/stores/location-store'
import { toMinutes, useTravelTime } from '@repo/core/api/hooks/use-travel-time'
import {
  useVendorClosures,
  useVendorWorkingHours,
} from '@repo/core/api/hooks/use-slots'
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
import { MainAction } from '@/components/main-action'
import { ModeSwitch } from '@/components/mode-switch'
import { isHomeHubEnabled } from '@/lib/home-hub'
import { ServiceMediaArea } from '@/components/service-media/service-media-area'
import { ServiceThumb } from '@/components/service-media/service-thumb'
import { ClampedText } from '@/components/service-media/clamped-text'
import { SaveGarageButton } from '@/components/favourites/save-garage-button'
import { SAVE_PARAM, withoutSaveFlag } from '@/lib/saved-garages'

type Tab = 'services' | 'photos' | 'reviews'

// Stable empties, so the memos below do not recompute on every render while
// the garage loads.
const NO_SERVICES: Service[] = []
const NO_PACKAGES: ServicePackage[] = []

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
 *
 * Behind the Home hub flag Add is never red: Book Now is the hub's gradient
 * pill there, and flat #EF3240 pills beside it would be two reds and several
 * red controls on one screen, where the brand allows one. Add is then a
 * graphite outline on the canvas and Added the same outline filled, told
 * apart by their icon and word as well as the fill. Off, today's red exactly.
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
          : isHomeHubEnabled()
            ? 'border-text-primary/40 bg-transparent text-text-primary hover:border-text-primary/60 hover:bg-surface-elevated'
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
  const searchParams = useSearchParams()
  const modeParam = searchParams.get('mode')
  // Set by checkout when it was sent here because every service on the link
  // (Book again on an old booking, usually) has been withdrawn. Said on the
  // page, so it is still there once the page has loaded.
  const servicesWithdrawn = searchParams.get('withdrawn') === '1'
  // An offer code from Home (this garage's own offer). Passed on to checkout,
  // which applies it once the services and the car are chosen.
  const offerCode = searchParams.get('code')?.trim() || null
  const router = useRouter()
  const user = useAuthStore((s) => s.user)
  // Named to avoid shadowing the DOM's global `location`.
  const activeLocation = useLocationStore((s) => s.location)

  // The garage and its catalogue arrive together or not at all (see
  // useGarage). Reviews stay a side fetch: a page without them is still a
  // page someone can book from.
  const garage = useGarage(id)
  const vendor: Vendor | null = garage.data?.vendor ?? null
  const services = garage.data?.services ?? NO_SERVICES
  const packages = garage.data?.packages ?? NO_PACKAGES
  const [reviews, setReviews] = useState<Review[]>([])
  const [tab, setTab] = useState<Tab>('services')
  // The At garage / Doorstep / Pickup & drop choice, as made on home or here.
  // Null until one is made; `mode` below is what the garage can actually do
  // with it (Pickup & drop only where the garage offers it).
  const [chosenMode, setChosenMode] = useState<BookingType | null>(() =>
    parseBookingType(modeParam)
  )
  const [query, setQuery] = useState('')
  // Several services can go into one booking. Order matters: it is the order
  // they were added, and it is what the summary, the receipt and the vendor's
  // job list all show.
  const [selected, setSelected] = useState<string[]>([])
  // The service or package whose details popup is open, if any.
  const [details, setDetails] = useState<Service | ServicePackage | null>(null)

  useEffect(() => {
    getVendorReviews(id)
      .then(setReviews)
      .catch(() => undefined)
  }, [id])

  // Back from signing in to save this garage (?save=1, set by the heart):
  // save it, once, and take the flag out of the URL so a reload or Back does
  // not do it again. Already saved is left as it is.
  const wantsSave = searchParams.get(SAVE_PARAM) === '1'
  const savedGarages = useSavedGarages({ enabled: !!user })
  const toggleSaved = useToggleSavedGarage()
  const saveHandled = useRef(false)
  useEffect(() => {
    if (!wantsSave || saveHandled.current || !user || !vendor || !savedGarages.data) return
    saveHandled.current = true
    if (!savedGarages.data.vendors.some((v) => v.id === vendor.id)) {
      toggleSaved.mutate({ vendor, save: true })
    }
    window.history.replaceState(null, '', withoutSaveFlag(window.location.pathname, window.location.search))
  }, [wantsSave, user, vendor, savedGarages.data, toggleSaved])

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

  const toggle = (serviceId: string) => {
    if (!selected.includes(serviceId)) {
      const item = [...services, ...packages].find((s) => s.id === serviceId)
      track('service_add', { vendorId: id, category: browseCategory(item?.category) })
    }
    setSelected((current) =>
      current.includes(serviceId)
        ? current.filter((id) => id !== serviceId)
        : [...current, serviceId]
    )
  }

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

  // Once per garage opened, with the booking type it opened on.
  const viewedRef = useRef<string | null>(null)
  useEffect(() => {
    if (!vendor || viewedRef.current === vendor.id) return
    viewedRef.current = vendor.id
    track('garage_view', { vendorId: vendor.id, mode })
  }, [vendor, mode])

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
    }${offerCode ? `&code=${encodeURIComponent(offerCode)}` : ''}`
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
  // Likewise its holidays: "Closed today" here, greyed days at checkout.
  const closures = useVendorClosures(id)

  if (!vendor) {
    return (
      <AppShell className="items-center justify-center py-4">
        {garage.isError && !garage.isFetching ? (
          // A failed load said "Loading…" for ever. This one can be retried.
          <ErrorState
            message="Couldn't load this garage. Check your connection."
            onRetry={() => void garage.refetch()}
          />
        ) : garage.data === null ? (
          // 404: the garage is not listed (unverified, archived, or never was).
          <div className="flex flex-col items-center gap-3 py-12 text-center">
            <p className="text-[13px] text-text-secondary">
              This garage isn&apos;t taking bookings on Detlio.
            </p>
            <Link
              href="/garages"
              className="flex min-h-11 items-center px-3 text-[13px] font-semibold text-text-primary underline"
            >
              Find another garage
            </Link>
          </div>
        ) : (
          <p className="text-[13px] text-text-secondary">Loading…</p>
        )}
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
  // The switch only when there is a choice to make: two or three modes.
  const modes = offeredBookingTypes(vendor)
  // A paused garage's page still loads — someone may have it saved, or be
  // checking on it — but nothing on it can be added to a booking, and the bar
  // where Book Now would be says why.
  const paused = vendor.bookingsPaused

  return (
    <AppShell
      className={cn('px-0', selected.length > 0 || paused ? 'pb-28' : 'pb-6')}
    >
      {/* Hero — full-bleed cover with the back control and the heart floated
          on top. The heart is saved on the account (Profile → Saved garages). */}
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
        <SaveGarageButton vendor={vendor} className="absolute right-4 top-4" />
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
          <OpenStatus hours={workingHours.data} closures={closures.data} />
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

        {modes.length > 1 && (
          <ModeSwitch modes={modes} className="mt-1" value={mode} onChange={changeMode} />
        )}

        {/* What the choice means, before any service is added: the garage
            comes for the car and brings it back. Free for now (owner
            decision); checkout shows a fee line if one is ever set. */}
        {mode === 'pickup' && (
          <p className="text-[12px] leading-relaxed text-text-secondary">
            Free pickup &amp; drop: {vendor.name} collects your car from your address, works on it
            at the garage and brings it back.
          </p>
        )}

        {servicesWithdrawn && (
          <Notice
            role="status"
            tone="neutral"
            className="mt-1"
            title="The services you picked are no longer offered here."
          >
            Choose from what this garage offers now.
          </Notice>
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
                        {!paused && (
                          <AddToBookingButton
                            name={pkg.name}
                            added={added}
                            onToggle={() => toggle(pkg.id)}
                          />
                        )}
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
                      className={cn(CARD_DETAILS_TRIGGER, 'flex items-start gap-3')}
                    >
                      {/* The video's poster, the first photo, or the drawn
                          sample, so a customer can see the work at a glance. */}
                      <ServiceThumb service={svc} />
                      <div className="min-w-0 flex-1">
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
                      </div>
                    </button>
                    <div className="mt-3 flex items-center justify-between pl-[76px]">
                      <span className="flex items-center gap-1.5 text-[12px] text-text-secondary">
                        <IconClock size={13} />
                        <span className="font-numeric font-medium">
                          {formatDuration(svc.durationMins)}
                        </span>
                      </span>
                      {!paused && (
                        <AddToBookingButton
                          name={svc.name}
                          added={added}
                          onToggle={() => toggle(svc.id)}
                        />
                      )}
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
      {paused ? (
        // Where Book Now would be. Plain and specific: the garage has stopped
        // taking bookings for now, in its own words when it gave any — not
        // "unavailable", which reads like our fault, and no promise of when.
        <div
          role="status"
          className="fixed bottom-0 left-1/2 z-40 w-full max-w-[428px] -translate-x-1/2 border-t border-border bg-brand-black px-4 py-3"
        >
          <p className="text-[15px] font-semibold text-text-primary">
            Not taking bookings right now
          </p>
          <p className="mt-0.5 text-[13px] text-text-secondary">
            {vendor.bookingsPausedReason
              ? vendor.bookingsPausedReason
              : 'This garage has paused new bookings. Check back later, or pick another garage.'}
          </p>
        </div>
      ) : selectedServices.length > 0 && (
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
          {/* The page's one main action. Behind the Home hub flag it is the
              red pill with its shine; off, today's button exactly. The Add
              buttons above stay as they are: a redesign of the cards is a
              later PR. */}
          <MainAction
            fullWidth={false}
            className="px-8"
            heroClassName="shrink-0 px-6"
            heroIcon={<IconArrowUpRight size={17} stroke={1.5} aria-hidden />}
            onClick={handleBook}
          >
            Book Now
          </MainAction>
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
                bottom within thumb reach. The media come first, as in the
                approved design: the video (or first photo) at 16:9, then
                the photos; a drawn sample when the garage has added none. */}
            <ServiceMediaArea service={details} garageName={vendor.name} />

            <h2 className="mt-4 text-[17px] font-semibold text-text-primary">
              {details.name}
            </h2>

            <div className="mt-2 flex flex-wrap items-center gap-2">
              <ScBadge variant="muted">{categoryLabel(details.category)}</ScBadge>
              <span className="flex items-center gap-1.5 text-[11px] text-text-secondary">
                <IconClock size={12} />
                <span className="font-numeric font-medium">
                  {formatDuration(details.durationMins)}
                </span>
              </span>
            </div>

            <ClampedText
              key={details.id}
              className="mt-3 text-[13px] text-text-secondary"
              text={
                details.description ||
                (isPackage(details)
                  ? 'No description available for this package.'
                  : 'No description available for this service.')
              }
            />

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
                  You pay the inspection fee when you book. If the work costs more,
                  the garage sends the final bill in the app and you pay the rest there.
                </p>
              )}
            </div>

            {/* Red only while it adds: removing is the quieter action, the
                same way the card's Added state is. Absent while the garage
                is paused, like the card's own Add. */}
            {!paused && (
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
            )}
          </>
        )}
      </ScSheet>
    </AppShell>
  )
}
