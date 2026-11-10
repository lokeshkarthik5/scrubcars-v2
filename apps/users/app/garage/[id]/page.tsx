'use client'

import { use, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import {
  IconArrowLeft,
  IconArrowUpRight,
  IconCheck,
  IconClock,
  IconMapPin,
  IconSearch,
  IconStarFilled,
} from '@tabler/icons-react'
import { ScButton } from '@repo/ui/sc/button'
import { ErrorState } from '@repo/ui/sc/empty-state'
import { ScSheet } from '@repo/ui/sc/modal'
import { Notice } from '@repo/ui/sc/notice'
import { Reveal } from '@repo/ui/sc/reveal'
import { Stars } from '@repo/ui/sc/stars'
import { TierSeal } from '@repo/ui/features/tier-medal'
import { OutsideCityLine, useGarageTownLine } from '@repo/ui/features/outside-city'
import { GarageMonogram } from '@repo/ui/features/garage-cover'
import { Odometer } from '@repo/ui/finish/odometer'
import { usePrefersReducedMotion } from '@repo/ui/finish/motion'
import { useGarage, useVendorReviews } from '@repo/core/api/hooks/use-vendors'
import { SkeletonList } from '@repo/ui/sc/skeleton'
import { GarageAddOns } from '@/components/garage/garage-add-ons'
import { GarageHero } from '@/components/garage/garage-hero'
import { RedLightAdd } from '@/components/garage/red-light-add'
import { GarageRoad } from '@/components/moments/road'
import { NextFreeRow } from '@/components/garages/next-free-row'
import type { AddOn } from '@repo/core/api/add-ons'
import { browseCategory } from '@repo/core/analytics-events'
import { track } from '@repo/core/analytics'
import {
  useSavedGarages,
  useToggleSavedGarage,
} from '@repo/core/api/hooks/use-favourites'
import { anywhereInCityLine } from '@repo/core/reach'
import { outsideCityLine } from '@repo/core/service-city'
import {
  bookingTypeParam,
  offeredBookingTypes,
  parseBookingType,
  resolveBookingType,
} from '@repo/core/booking-types'
import { useAuthStore } from '@repo/core/stores/auth-store'
import {
  coarse,
  isApproximate,
  isCitywide,
  useLocationStore,
} from '@repo/core/stores/location-store'
import { distanceAndDrive, distanceLabel } from '@repo/core/drive-time'
import { straightLineKm } from '@repo/core/map'
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
import { resolveServiceAmount, tierPriceFor } from '@repo/core/pricing'
import { useUserStore } from '@repo/core/stores/user-store'
import { money } from '@/lib/money'
import { pricedForCar, servicePriceText } from '@/lib/price'
import { useBookingCar } from '@/lib/use-booking-car'
import { Figures } from '@repo/ui/sc/figures'
import { VEHICLE_TIERS } from '@repo/core/vehicles'
import { knownDurationTotal } from '@repo/core/service-duration'
import { cn, formatDuration } from '@repo/core/utils'
import { OpenStatus } from '@/components/open-status'
import { MainAction } from '@/components/main-action'
import { ModeSwitch } from '@/components/mode-switch'
import { ServiceSheetTop } from '@/components/service-media/service-sheet-top'
import { ServiceCardLine } from '@/components/service-media/service-points'
import { ServiceThumb } from '@/components/service-media/service-thumb'
import { SaveGarageButton } from '@/components/favourites/save-garage-button'
import { ReportReviewButton } from '@/components/reviews/report-review-button'
import { NEW_GARAGE_LABEL, hasStarScore, newGarageReviewsLine } from '@repo/core/ratings'
import { SAVE_PARAM, withoutSaveFlag } from '@/lib/saved-garages'
import { GarageSlotAlerts } from '@/components/slot-alerts/garage-slot-alerts'
import {
  claimOpenedFromList,
  forgetPicks,
  keptEntryState,
  morphNavigate,
  openedFromList,
  picksForBack,
  rememberPicks,
} from '@/lib/view-transition'

type Tab = 'services' | 'photos' | 'reviews'

const TABS: ReadonlyArray<{ key: Tab; label: string }> = [
  { key: 'services', label: 'Services' },
  { key: 'photos', label: 'Photos' },
  { key: 'reviews', label: 'Reviews' },
]

// Stable empty, like the two below.
const NO_REVIEWS: Review[] = []

// Stable empties, so the memos below do not recompute on every render while
// the garage loads.
const NO_SERVICES: Service[] = []
const NO_PACKAGES: ServicePackage[] = []
const NO_ADD_ONS: AddOn[] = []

/** The fixed glass top bar's height: the tabs pin right under it. */
const TOP_BAR_PX = 60
/** How far the page scrolls before the glass bar with the name takes over. */
const SOLID_AFTER_PX = 250

// A package is a Service plus its contents, so the details popup takes either
// and only the bundle-specific block below depends on the difference.
const isPackage = (item: Service | ServicePackage): item is ServicePackage =>
  'items' in item

/**
 * The body of a service or package card, which is the card's details control.
 *
 * Its ::after is stretched over the whole card (the card is `relative`), so a
 * tap anywhere on the card opens the details — the separate "Details" button
 * that used to sit beside Add did exactly the same thing and is gone. The
 * overlay also carries the hover/press tint and the keyboard focus ring, so
 * focus outlines the card the customer is on rather than a sliver of text.
 * The radius is inherited through the button so it follows the card's.
 */
const CARD_DETAILS_TRIGGER = cn(
  'w-full cursor-pointer rounded-[inherit] text-left focus-visible:outline-none',
  "after:absolute after:-inset-px after:rounded-[inherit] after:content-['']",
  'after:transition-colors after:duration-150 after:ease-[cubic-bezier(0.2,0,0,1)]',
  'hover:after:bg-text-primary/[0.03] active:after:bg-text-primary/[0.06]',
  'focus-visible:after:ring-2 focus-visible:after:ring-text-primary/70'
)

/** A section heading of the Services tab, with its count on the right. */
function PaneHeading({ id, title, count }: { id?: string; title: string; count: string }) {
  return (
    <div className="mb-2.5 flex items-baseline justify-between gap-3">
      <h2 id={id} className="text-t2 font-semibold text-text-primary">
        {title}
      </h2>
      <span className="text-t5 font-medium text-[#8E8E98]">{count}</span>
    </div>
  )
}

/**
 * A garage's page (customer UI round, Nov 2026, §5): the tall swipeable
 * hero, the name with its hours ring, how good and how far, the area and the
 * tier seal, the road from you to the garage, the graphite mode switch, the
 * next free times, then Services / Photos / Reviews under a light line that
 * flows between them. Add is the red-light button; once something is
 * picked, the glass booking bar rises with the total and the solid red Book
 * now, which grows into the booking page.
 *
 * Opened from a list card it is the card grown into the page (the container
 * transform, lib/view-transition.ts), and Back folds it into the card again.
 * The whole page is that one shared box (layout.tsx, `data-vt-garage`).
 */
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
  const reduce = usePrefersReducedMotion()
  const user = useAuthStore((s) => s.user)
  // The car this booking is for (lib/booking-car.ts: Home's pick, else the
  // default, else the only car), so prices read "₹599 for your Creta" rather
  // than a range (F13), and checkout charges for the same car.
  const fetchVehicles = useUserStore((s) => s.fetchVehicles)
  useEffect(() => {
    if (user) void fetchVehicles()
  }, [user, fetchVehicles])
  const { car: myCar } = useBookingCar()
  const carType = myCar?.vehicleType ?? null
  // Named to avoid shadowing the DOM's global `location`.
  const activeLocation = useLocationStore((s) => s.location)

  // The garage and its catalogue arrive together or not at all (see
  // useGarage). Reviews stay a side fetch: a page without them is still a
  // page someone can book from.
  const garage = useGarage(id)
  const vendor: Vendor | null = garage.data?.vendor ?? null
  // Where the garage is, said only when it is not in the customer's city
  // (0070): "This garage is in Vellore, about 125 km from you."
  const townLine = useGarageTownLine(vendor)
  // The garage as the list or the map showed it, while its own read is on
  // the way (useGarage's placeholder): the hero, the name, the rating and the
  // distance paint at once; only the catalogue waits, as a skeleton rather
  // than "No services available yet".
  const catalogueLoading = garage.isPlaceholderData
  const services = garage.data?.services ?? NO_SERVICES
  const packages = garage.data?.packages ?? NO_PACKAGES
  const addOns = garage.data?.addOns ?? NO_ADD_ONS
  const [tab, setTab] = useState<Tab>('services')
  // Read when the Reviews tab is first opened (speed fix 8, customer UI
  // round): the count is already on the garage, so nothing before that needs
  // the list. Cached five minutes, so Back to this page shows them at once.
  const reviewsQuery = useVendorReviews(id, { enabled: tab === 'reviews' })
  const reviews = reviewsQuery.data ?? NO_REVIEWS
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
  //
  // Back from the booking page with its own Back, the services picked before
  // Book now come back, so the booking page folds into the same bar
  // (lib/view-transition.ts). Only then (a client-side Back, never a page
  // the server draws); any other arrival starts empty, as it always has.
  const [selected, setSelected] = useState<string[]>(() => picksForBack(id))
  useEffect(() => forgetPicks(), [id])
  // Opened from the list just now: this visit (its history entry) folds back
  // into the card on Back. Any other arrival, later on, is the plain Back.
  useEffect(() => claimOpenedFromList(id), [id])
  // The service or package whose details popup is open, if any.
  const [details, setDetails] = useState<Service | ServicePackage | null>(null)

  // Back from signing in to save this garage (?save=1, set by the heart):
  // save it, once, and take the flag out of the URL so a reload or Back does
  // not do it again. Already saved is left as it is.
  const wantsSave = searchParams.get(SAVE_PARAM) === '1'
  const savedGarages = useSavedGarages({ enabled: !!user })
  const toggleSaved = useToggleSavedGarage()
  const saveHandled = useRef(false)
  useEffect(() => {
    if (
      !wantsSave ||
      saveHandled.current ||
      !user ||
      !vendor ||
      !savedGarages.data
    )
      return
    saveHandled.current = true
    if (!savedGarages.data.vendors.some((v) => v.id === vendor.id)) {
      toggleSaved.mutate({ vendor, save: true })
    }
    // keptEntryState: the visit's Back-into-the-card mark stays on the entry.
    window.history.replaceState(
      keptEntryState(),
      '',
      withoutSaveFlag(window.location.pathname, window.location.search)
    )
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
    track('service_sheet_open', {
      vendorId: id,
      category: browseCategory(item.category),
    })
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
      track('service_add', {
        vendorId: id,
        category: browseCategory(item?.category),
      })
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
    (total, service) =>
      total +
      (resolveServiceAmount(service, carType ?? undefined) ?? service.price),
    0
  )
  // Null when a service has no duration set (0064): no total is shown.
  const selectedDuration = knownDurationTotal(selectedServices)
  const hasPerVehiclePricing = selectedServices.some(
    (service) =>
      service.pricingType === 'per_vehicle' && !pricedForCar(service, carType)
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
    // keptEntryState keeps this visit's Back-into-the-card mark on the entry.
    const url = new URLSearchParams(window.location.search)
    const param = bookingTypeParam(next)
    if (param) url.set('mode', param)
    else url.delete('mode')
    const search = url.toString()
    window.history.replaceState(
      keptEntryState(),
      '',
      search ? `?${search}` : window.location.pathname
    )
  }

  // The whole page is the container the card grows into (and folds back
  // into); the booking bar is the one that grows into the booking page.
  const pageRef = useRef<HTMLDivElement>(null)
  const barRef = useRef<HTMLDivElement>(null)
  const bookRef = useRef<HTMLDivElement>(null)

  const handleBook = () => {
    if (selected.length === 0) return
    // Statistics → Behaviour's "started booking", signed in or not (sign-in
    // comes next for a new customer; checkout_start only once at checkout).
    track('booking_start', {
      vendorId: id,
      mode,
      serviceCount: Math.min(20, selected.length),
    })
    // The mode rides along so checkout opens on it. Without it checkout reset
    // to At garage, and a Doorstep customer had to choose a third time.
    const modeQuery = bookingTypeParam(mode)
    const bookPath = `/book/${id}?service=${selected.join(',')}${
      modeQuery ? `&mode=${modeQuery}` : ''
    }${offerCode ? `&code=${encodeURIComponent(offerCode)}` : ''}`
    // The arrow nods once as it goes.
    const go = bookRef.current
    if (go && !reduce) {
      go.removeAttribute('data-go')
      void go.offsetWidth
      go.setAttribute('data-go', '')
    }
    // For the booking page's Back, which folds into this bar again.
    rememberPicks(id, selected)
    // Signed in or not (0062): a guest chooses everything at checkout and
    // signs in there, at "Confirm". The bar grows into the booking page.
    morphNavigate({
      name: 'vt-booking',
      direction: 'open',
      from: barRef.current,
      to: () => document.querySelector<HTMLElement>('[data-vt-booking]'),
      navigate: () => router.push(bookPath),
    })
  }

  // Back folds the page into the card it grew from, when it came from the
  // list; otherwise it is the plain Back it always was.
  const goBack = () => {
    if (!openedFromList(id)) {
      router.back()
      return
    }
    morphNavigate({
      name: 'vt-garage',
      direction: 'back',
      // The box around the page (layout.tsx), the one the card grew into.
      from: pageRef.current?.closest<HTMLElement>('[data-vt-garage]') ?? null,
      to: () => document.querySelector<HTMLElement>(`[data-vt-card="${id}"]`),
      navigate: () => router.back(),
    })
  }

  // The booking page's code starts loading once the bar is up, so Book now
  // grows straight into it.
  const anyPicked = selected.length > 0
  useEffect(() => {
    if (anyPicked) router.prefetch(`/book/${id}`)
  }, [anyPicked, id, router])

  // Routing is the one geo call whose volume tracks browsing rather than saves,
  // so it fires for this one garage only, never for a list. Declared above the
  // loading early-return with the other hooks — the query is disabled until
  // both endpoints are known, so it costs nothing while the vendor loads.
  const travel = useTravelTime(
    activeLocation?.source === 'gps' ? coarse(activeLocation) : null,
    vendor ? { lat: vendor.lat, lng: vendor.lng } : null
  )

  // The same query checkout's slot picker uses to grey out closed days, so
  // the hours read here are already cached by the time Book now is tapped.
  const workingHours = useVendorWorkingHours(id)
  // Likewise its holidays: "Closed today" here, greyed days at checkout.
  const closures = useVendorClosures(id)

  // As the page scrolls: the hero drifts slowly (--hy), the glass top bar
  // with the name takes over past the hero, and the tabs turn to glass once
  // they pin under it. One listener, read once a frame.
  const tabsRef = useRef<HTMLDivElement>(null)
  const [solid, setSolid] = useState(false)
  const [stuck, setStuck] = useState(false)
  useEffect(() => {
    let frame = 0
    const read = () => {
      frame = 0
      const y = window.scrollY
      if (!reduce) pageRef.current?.style.setProperty('--hy', `${(y * 0.4).toFixed(1)}px`)
      setSolid(y > SOLID_AFTER_PX)
      const tabs = tabsRef.current
      if (tabs) setStuck(tabs.getBoundingClientRect().top <= TOP_BAR_PX + 1)
    }
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(read)
    }
    read()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      window.removeEventListener('scroll', onScroll)
      if (frame) cancelAnimationFrame(frame)
    }
  }, [reduce, vendor])

  // The tabs' light line flows to the chosen tab: it stretches across both
  // places, then settles, by transform alone (a 100px line, scaled).
  const tabListRef = useRef<HTMLDivElement>(null)
  const lineRef = useRef<HTMLSpanElement>(null)
  const linePlaced = useRef<{ left: number; width: number } | null>(null)
  const reviewCountKnown = vendor ? vendor.reviewCount || reviews.length : 0
  useLayoutEffect(() => {
    const list = tabListRef.current
    const line = lineRef.current
    const button = list?.querySelector<HTMLElement>(`#garage-tab-${tab}`)
    if (!list || !line || !button) return
    const to = { left: button.offsetLeft + 4, width: Math.max(8, button.offsetWidth - 8) }
    const from = linePlaced.current
    const place = (p: { left: number; width: number }, squash = 1) =>
      `translateX(${p.left}px) scaleX(${(p.width / 100) * squash})`
    if (from && !reduce && (from.left !== to.left || from.width !== to.width)) {
      const left = Math.min(from.left, to.left)
      const right = Math.max(from.left + from.width, to.left + to.width)
      line.animate(
        [
          { transform: place(from) },
          { transform: place({ left, width: right - left }), offset: 0.42 },
          { transform: place(to) },
        ],
        { duration: 440, easing: 'cubic-bezier(.3,.85,.25,1)' }
      )
    }
    line.style.transform = place(to)
    linePlaced.current = to
  }, [tab, reduce, vendor, reviewCountKnown])

  if (!vendor) {
    return (
      <div className="mx-auto flex min-h-dvh w-full max-w-[428px] flex-col bg-brand-black">
        <main className="flex flex-1 flex-col items-center justify-center px-4 py-4">
          {garage.isError && !garage.isFetching ? (
            // A failed load said "Loading…" for ever. This one can be retried.
            <ErrorState
              message="Couldn't load this garage. Check your connection."
              onRetry={() => void garage.refetch()}
            />
          ) : garage.data === null ? (
            // 404: the garage is not listed (unverified, archived, or never was).
            <div className="flex flex-col items-center gap-3 py-12 text-center">
              <p className="text-t4 text-text-secondary">
                This garage isn&apos;t taking bookings on Detlio.
              </p>
              <Link
                href="/garages"
                className="flex min-h-11 items-center px-3 text-t4 font-semibold text-text-primary underline"
              >
                Find another garage
              </Link>
            </div>
          ) : (
            <p className="text-t4 text-text-secondary">Loading…</p>
          )}
        </main>
      </div>
    )
  }

  // The score is the API's (0065, lib/ratings.ts on the server): counted
  // reviews only (no Test booking's, none hidden), and none for a new garage
  // (fewer than 3), which reads "New on Detlio" so one review can't rank it.
  // A garage with no reviews yet shows none of the rating furniture — a
  // "0.0 (0 reviews)" line reads as a bad score, not as a new listing.
  const reviewCount = vendor.reviewCount || reviews.length
  const hasReviews = reviewCount > 0
  const showStars = hasStarScore({ reviewCount, isNew: vendor.isNew })
  const visibleTabs = TABS.filter((t) => t.key !== 'reviews' || hasReviews)
  const avgRating = vendor.rating
  const soFar = newGarageReviewsLine(reviewCount)
  // How far, from the customer's location (an area's centre reads "~"):
  // the straight line to the garage's pin, as every card measures it, with
  // the estimated drive (0062). A GPS customer gets the real road time below
  // instead of the estimate, when routing answers (useTravelTime).
  const fromHere =
    activeLocation && !isCitywide(activeLocation) && vendor.lat != null && vendor.lng != null
      ? straightLineKm(coarse(activeLocation), { lat: vendor.lat, lng: vendor.lng })
      : null
  const approximate = isApproximate(activeLocation)
  // The switch only when there is a choice to make: two or three modes.
  const modes = offeredBookingTypes(vendor)
  const anywhere = anywhereInCityLine(vendor, mode)
  // A paused garage's page still loads — someone may have it saved, or be
  // checking on it — but nothing on it can be added to a booking, and the bar
  // where Book now would be says why.
  const paused = vendor.bookingsPaused
  const barUp = !paused && selectedServices.length > 0
  const barTotal =
    selectedServices.length === 1
      ? servicePriceText(selectedServices[0], carType)
      : // "from" while a per-vehicle line is only priced once the car is
        // known, one screen along.
        `${hasPerVehiclePricing ? 'from ' : ''}${money(selectedTotal)}`

  return (
    <div
      ref={pageRef}
      className="mx-auto flex min-h-dvh w-full max-w-[428px] flex-col bg-brand-black"
    >
      {/* Back and the heart float on the photo, on glass; past the hero a
          glass bar with the garage's name takes over. The name there is not
          a heading: the page's one heading is the name below the photo. */}
      <div
        data-solid={solid ? '' : undefined}
        className="gp-top fixed inset-x-0 top-[var(--consent-bar,0px)] z-40 mx-auto flex h-[60px] w-full max-w-[428px] items-center gap-3 px-3"
      >
        {/* 44px, like the heart beside it: the disc is the whole target. */}
        <button
          type="button"
          onClick={goBack}
          aria-label="Go back"
          className="fx-glass flex size-11 shrink-0 items-center justify-center rounded-[12px] text-brand-white"
        >
          <IconArrowLeft size={20} aria-hidden="true" />
        </button>
        <span aria-hidden="true" className="gp-top__name min-w-0 flex-1 truncate text-t3 font-semibold text-text-primary">
          {vendor.name}
        </span>
        <SaveGarageButton vendor={vendor} className="fx-glass bg-[rgb(18_18_22/0.5)]" />
      </div>

      <main className="flex flex-1 flex-col" style={{ paddingBottom: barUp || paused ? 120 : 24 }}>
        <GarageHero vendor={vendor} />

        <div className="gp-body flex flex-col px-4">
          <section className="gp-sec flex flex-col" style={{ '--i': 0 } as React.CSSProperties}>
            <div className="flex items-center gap-3.5">
              {vendor.logoUrl ? (
                <div className="relative size-14 shrink-0 overflow-hidden rounded-[16px] border-[1.5px] border-white/75 bg-surface shadow-[0_6px_14px_rgb(0_0_0/0.5)]">
                  <Image
                    src={vendor.logoUrl}
                    alt={`${vendor.name} logo`}
                    fill
                    sizes="56px"
                    className="object-cover"
                  />
                </div>
              ) : (
                <GarageMonogram
                  vendor={vendor}
                  className="size-14 shrink-0 rounded-[16px] text-[17px] shadow-[0_6px_14px_rgb(0_0_0/0.5)]"
                />
              )}
              <div className="min-w-0">
                <h1 className="text-title font-semibold text-text-primary">{vendor.name}</h1>
                {/* From the garage's hours, read in IST — never from the
                    account status, which is "active" at 2 AM too. Absent
                    until the hours arrive, and for good if the garage has not
                    set any. The ring is the share of today's hours left. */}
                <OpenStatus
                  variant="ring"
                  hours={workingHours.data}
                  closures={closures.data}
                  className="mt-[5px]"
                />
              </div>
            </div>

            {/* Score, distance and drive time are figures, in the brand's
                numeric face; the words between them stay Inter. */}
            <div className="mt-3.5 flex flex-wrap items-center gap-x-3.5 gap-y-1.5 text-t4 font-medium text-[#8E8E98]">
              {showStars ? (
                <span className="inline-flex items-center gap-[5px]">
                  <IconStarFilled size={13} aria-hidden className="text-warning" />
                  <span className="font-numeric font-semibold text-text-primary">
                    {avgRating.toFixed(1)}
                  </span>
                  <span>
                    ({reviewCount} {reviewCount === 1 ? 'review' : 'reviews'})
                  </span>
                </span>
              ) : (
                <span className="font-semibold text-text-primary">{NEW_GARAGE_LABEL}</span>
              )}
              {fromHere !== null && (
                <span className="inline-flex items-center gap-[5px]">
                  <span className="font-numeric font-semibold text-text-primary" data-distance="">
                    {travel.data
                      ? distanceLabel(fromHere, approximate)
                      : distanceAndDrive(fromHere, approximate)}
                  </span>
                  {/* A GPS customer's real road time, when routing answers,
                      in place of the estimate. */}
                  {travel.data && (
                    <span>
                      ·{' '}
                      <span className="font-numeric font-semibold text-text-primary">
                        {formatDuration(toMinutes(travel.data.durationS))}
                      </span>{' '}
                      drive
                    </span>
                  )}
                </span>
              )}
            </div>

            <div className="mt-3 flex flex-wrap items-start gap-2">
              {vendor.area && (
                <span className="fx-raised inline-flex h-8 items-center gap-1.5 rounded-[12px] pl-2.5 pr-3 text-t4 font-medium text-[#E8E8EC]">
                  <IconMapPin size={14} aria-hidden className="text-[#A8A8B2]" />
                  {vendor.area}
                </span>
              )}
              {/* The tier medal (0063): Bronze, Silver or Gold, the highest
                  one Detlio shows for this garage, with "What this means" in
                  plain words. Only which tier, never its numbers. */}
              {vendor.tier && <TierSeal tier={vendor.tier} />}
            </div>

            {/* Garages in other towns are part of the pilot; this says
                plainly where one is before anything is picked, so nobody
                books it thinking it is round the corner. Nothing for a
                garage in the customer's city. Information, not a warning. */}
            {townLine && <OutsideCityLine text={townLine} className="mt-3" />}

            {/* You → the garage, while the page knows where you are. */}
            {fromHere !== null && <GarageRoad to={vendor.name} className="mt-[18px]" />}
          </section>

          {modes.length > 1 && (
            <section className="gp-sec pt-5" style={{ '--i': 1 } as React.CSSProperties}>
              <ModeSwitch modes={modes} value={mode} onChange={changeMode} />
            </section>
          )}

          {/* "Comes anywhere in Chennai" (0069): the garage covers its whole
              city for the way of booking chosen. Quiet, like the line below. */}
          {anywhere && (
            <p className="mt-2.5 text-t5 font-medium leading-relaxed text-[#8E8E98]">{anywhere}</p>
          )}

          {/* What the choice means, before any service is added: the garage
              comes for the car and brings it back. Free for now (owner
              decision); checkout shows a fee line if one is ever set. */}
          {mode === 'pickup' && (
            <p className="mt-2.5 text-t5 font-medium leading-relaxed text-[#8E8E98]">
              Free pickup &amp; drop: {vendor.name} collects your car from your
              address, works on it at the garage and brings it back.
            </p>
          )}

          {servicesWithdrawn && (
            <Notice
              role="status"
              tone="neutral"
              className="mt-4"
              title="The services you picked are no longer offered here."
            >
              Choose from what this garage offers now.
            </Notice>
          )}

          {/* The days the customer is waiting on here (0047), with Stop
              waiting. Nothing while signed out or when there are none. */}
          <div className="empty:hidden [&>*]:mt-4">
            <GarageSlotAlerts vendorId={vendor.id} />
          </div>

          {/* The next free times, for the mode on the switch; a time opens
              the booking on it, with whatever is picked so far. */}
          {!paused && (
            <section className="gp-sec pt-5" style={{ '--i': 2 } as React.CSSProperties}>
              <NextFreeRow
                vendor={vendor}
                mode={mode}
                visible
                serviceIds={selected}
                className="px-0 pb-0 pt-0"
              />
            </section>
          )}
        </div>

        <div
          ref={tabsRef}
          data-stuck={stuck ? '' : undefined}
          className="gp-tabs sticky top-[calc(var(--consent-bar,0px)+60px)] z-30 mt-6"
        >
          <div
            ref={tabListRef}
            className="relative flex h-[46px] gap-1 px-3"
            role="tablist"
            aria-label="Garage sections"
            // Tabs move with the arrow keys, and only the open one is a Tab
            // stop (the WAI-ARIA tabs pattern).
            onKeyDown={(event) => {
              const forward = event.key === 'ArrowRight'
              if (!forward && event.key !== 'ArrowLeft') return
              event.preventDefault()
              const keys = visibleTabs.map((t) => t.key)
              const next =
                keys[
                  (keys.indexOf(tab) + (forward ? 1 : -1) + keys.length) %
                    keys.length
                ]
              setTab(next)
              document.getElementById(`garage-tab-${next}`)?.focus()
            }}
          >
            {visibleTabs.map((t) => (
              <button
                key={t.key}
                id={`garage-tab-${t.key}`}
                type="button"
                role="tab"
                aria-selected={tab === t.key}
                aria-controls="garage-tab-panel"
                tabIndex={tab === t.key ? 0 : -1}
                onClick={() => setTab(t.key)}
                className={cn(
                  'inline-flex min-h-11 items-center gap-1.5 px-3 text-[14px] font-semibold transition-colors duration-200',
                  tab === t.key ? 'text-text-primary' : 'text-[#8E8E98]'
                )}
              >
                {t.label}
                {t.key === 'reviews' && (
                  <span className="font-numeric text-t5 font-semibold text-[#8E8E98]">
                    <span className="sr-only">, </span>
                    {reviewCount}
                  </span>
                )}
              </button>
            ))}
            {/* The light under the open tab: the red light, as a line. */}
            <span ref={lineRef} aria-hidden="true" className="gp-tabs__line" />
          </div>
        </div>

        <div
          key={tab}
          id="garage-tab-panel"
          role="tabpanel"
          aria-labelledby={`garage-tab-${tab}`}
          className="gp-pane flex flex-col gap-2 px-4 pt-4"
        >
          {tab === 'services' && (
            <>
              <label className="fx-recessed flex h-12 items-center gap-2.5 rounded-[16px] px-3.5">
                <IconSearch
                  size={17}
                  aria-hidden="true"
                  className="text-[#8E8E98]"
                />
                <input
                  // The placeholder is no name once something is typed.
                  aria-label="Search services"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search services..."
                  className="w-full bg-transparent text-t3 font-medium text-text-primary outline-none placeholder:text-[#8E8E98]"
                />
              </label>

              {filteredPackages.length > 0 && (
                <div className="pt-4">
                  <PaneHeading
                    title="Packages"
                    count={`${filteredPackages.length} ${filteredPackages.length === 1 ? 'package' : 'packages'}`}
                  />
                  <div className="flex flex-col gap-2">
                    {filteredPackages.map((pkg, i) => {
                      const added = selected.includes(pkg.id)
                      return (
                        <Reveal key={pkg.id} index={i}>
                          <div
                            data-picked={added ? '' : undefined}
                            className="gp-card relative rounded-[18px] p-4"
                          >
                            {/* Same affordance as a service card: the whole
                                card opens the details popup, the Add button
                                stays separate. */}
                            <button
                              type="button"
                              onClick={() => openDetails(pkg)}
                              aria-label={`View details for ${pkg.name}`}
                              className={CARD_DETAILS_TRIGGER}
                            >
                              <span className="flex items-center justify-between gap-2.5">
                                <span className="min-w-0 text-[16px] font-semibold text-text-primary">
                                  {pkg.name}
                                </span>
                                {/* Silver, never red: a saving is a fact,
                                    not a button. */}
                                {pkg.savings !== null && (
                                  <span className="gp-save shrink-0 rounded-[8px] px-2 py-[5px] font-numeric text-t5 font-semibold leading-none">
                                    Save {money(pkg.savings)}
                                    {pkg.tierBreakdown ? '+' : ''}
                                  </span>
                                )}
                              </span>
                              <ServiceCardLine
                                description={pkg.description}
                                className="mt-1 block text-t4 font-medium text-[#8E8E98]"
                              />
                              <ul className="mt-3 flex flex-col gap-1.5">
                                {pkg.items.map((item) => (
                                  <li
                                    key={item.serviceId}
                                    className="flex items-center gap-2 text-t4 font-medium text-[#D8D8DE]"
                                  >
                                    <IconCheck
                                      size={14}
                                      aria-hidden
                                      className="shrink-0 text-success"
                                    />
                                    {item.name}
                                  </li>
                                ))}
                              </ul>
                            </button>

                            <div className="mt-3.5 flex items-end justify-between gap-3 border-t border-white/[0.07] pt-3">
                              <span className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-1">
                                <span className="font-numeric text-[20px] font-semibold leading-none text-text-primary">
                                  <Figures text={servicePriceText(pkg, carType)} />
                                </span>
                                {/* The struck-through total only lines up
                                    with a single price. A per-vehicle bundle
                                    shows a range, so one "before" figure
                                    would be comparing against the wrong
                                    vehicle. */}
                                {pkg.tierBreakdown === null && pkg.savings !== null && (
                                  <s className="font-numeric text-t4 font-medium text-[#8E8E98]">
                                    {money(pkg.itemsTotal)}
                                  </s>
                                )}
                                {pkg.durationMins != null && (
                                  <span className="flex w-full items-center gap-1 text-t5 font-medium text-[#A8A8B2]">
                                    <IconClock size={12} aria-hidden />
                                    <span className="font-numeric">
                                      {formatDuration(pkg.durationMins)}
                                    </span>
                                  </span>
                                )}
                              </span>
                              {!paused && (
                                <RedLightAdd
                                  name={pkg.name}
                                  added={added}
                                  onToggle={() => toggle(pkg.id)}
                                />
                              )}
                            </div>
                          </div>
                        </Reveal>
                      )
                    })}
                  </div>
                </div>
              )}

              <div className="pt-4">
                <PaneHeading
                  title="Services"
                  count={`${filtered.length} ${filtered.length === 1 ? 'service' : 'services'}`}
                />
                {catalogueLoading ? (
                  <SkeletonList count={3} itemClassName="h-24 rounded-[18px]" />
                ) : filtered.length === 0 ? (
                  <p className="py-6 text-center text-t4 text-text-secondary">
                    {services.length === 0
                      ? 'No services available yet.'
                      : 'No services match that search.'}
                  </p>
                ) : (
                  <div className="flex flex-col gap-2">
                    {filtered.map((svc, i) => {
                      const added = selected.includes(svc.id)
                      return (
                        <Reveal key={svc.id} index={i}>
                          <div
                            data-picked={added ? '' : undefined}
                            className="gp-card relative grid grid-cols-[minmax(0,1fr)_auto] gap-3 rounded-[18px] p-3"
                          >
                            {/* Tapping anywhere on the card opens the details
                                popup; Add stays a separate action. */}
                            <button
                              type="button"
                              onClick={() => openDetails(svc)}
                              aria-label={`View details for ${svc.name}`}
                              className={cn(CARD_DETAILS_TRIGGER, 'flex min-w-0 items-start gap-3')}
                            >
                              {/* The video's poster, the first photo, or the
                                  category icon, so a customer can see the
                                  work at a glance. */}
                              <ServiceThumb service={svc} />
                              <span className="flex min-w-0 flex-col gap-[3px]">
                                <span className="text-t3 font-semibold leading-snug text-text-primary">
                                  {svc.name}
                                </span>
                                {/* Its first points ("Foam wash · Vacuum
                                    +2"), or the description held to two
                                    lines. */}
                                <ServiceCardLine
                                  description={svc.description}
                                  className="line-clamp-2 text-t5 font-medium leading-[1.35] text-[#8E8E98]"
                                />
                                {svc.durationMins != null && (
                                  <span className="mt-0.5 flex items-center gap-1 text-t5 font-medium text-[#A8A8B2]">
                                    <IconClock size={12} aria-hidden />
                                    <span className="font-numeric">
                                      {formatDuration(svc.durationMins)}
                                    </span>
                                  </span>
                                )}
                              </span>
                            </button>
                            <div className="flex flex-col items-end gap-0.5">
                              {/* The price for the customer's own car (F13). */}
                              <span className="font-numeric text-t3 font-semibold text-text-primary">
                                <Figures text={servicePriceText(svc, carType)} />
                              </span>
                              {pricedForCar(svc, carType) && myCar && (
                                <span className="text-over font-medium normal-case tracking-normal text-[#8E8E98]">
                                  for your {myCar.model}
                                </span>
                              )}
                              {!paused && (
                                <RedLightAdd
                                  name={svc.name}
                                  added={added}
                                  onToggle={() => toggle(svc.id)}
                                  className="mt-auto"
                                />
                              )}
                            </div>
                          </div>
                        </Reveal>
                      )
                    })}
                  </div>
                )}
              </div>
            </>
          )}

          {tab === 'services' && addOns.length > 0 && (
            <GarageAddOns addOns={addOns} carType={carType} />
          )}

          {tab === 'photos' && (
            <div className="grid grid-cols-2 gap-2">
              {vendor.photos.length > 0 ? (
                vendor.photos.map((url, i) => (
                  <Reveal
                    key={url}
                    index={i}
                    className="relative aspect-square overflow-hidden rounded-[16px] bg-[#141418]"
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
                <p className="col-span-2 py-6 text-center text-t4 text-text-secondary">
                  No photos yet.
                </p>
              )}
            </div>
          )}

          {tab === 'reviews' && (
            <>
              {showStars ? (
                <div className="flex items-center gap-3.5 pb-2 pt-1">
                  <span className="font-numeric text-[40px] font-semibold leading-none tracking-[-0.02em] text-text-primary">
                    {avgRating.toFixed(1)}
                  </span>
                  <div className="flex flex-col gap-1">
                    <Stars rating={avgRating} size={16} />
                    <p className="text-t5 font-medium text-[#8E8E98]">
                      {reviewCount} {reviewCount === 1 ? 'review' : 'reviews'}
                    </p>
                  </div>
                </div>
              ) : (
                <div className="pb-2 pt-1">
                  <p className="text-t3 font-semibold text-text-primary">{NEW_GARAGE_LABEL}</p>
                  {soFar && (
                    <p className="text-t5 text-text-secondary">{soFar}</p>
                  )}
                </div>
              )}
              {reviewsQuery.isPending ? (
                <p className="py-4 text-center text-t4 text-text-secondary">
                  Loading reviews…
                </p>
              ) : (
                reviews.length === 0 && (
                  <p className="py-4 text-center text-t4 text-text-secondary">
                    No reviews yet.
                  </p>
                )
              )}
              {reviews.map((review, i) => (
                <Reveal key={review.id} index={i}>
                  <div className="border-t border-white/[0.07] py-3.5">
                    <div className="flex items-center gap-2.5">
                      <div className="flex size-[34px] shrink-0 items-center justify-center rounded-full bg-[#22222A] text-t5 font-semibold text-text-primary">
                        {review.userName.slice(0, 2).toUpperCase()}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-t4 font-semibold text-text-primary">
                          {review.userName}
                        </p>
                        <p className="font-numeric text-t5 font-medium text-[#8E8E98]">
                          {review.date}
                        </p>
                      </div>
                      <Stars rating={review.rating} size={12} />
                    </div>
                    <p className="mt-2 text-t4 font-medium leading-normal text-[#D8D8DE]">
                      {review.comment}
                    </p>
                    {/* The garage's one public reply (0065). */}
                    {review.reply && (
                      <div className="mt-2.5 rounded-[12px] border-l-2 border-[rgb(228_0_43/0.7)] bg-[#141418] px-3 py-2.5">
                        <p className="text-t5 font-semibold text-[#8E8E98]">
                          Reply from {vendor.name}
                        </p>
                        <p className="mt-0.5 text-t4 text-[#C8C8D0]">
                          {review.reply.text}
                        </p>
                      </div>
                    )}
                    <div className="mt-1 flex justify-end">
                      <ReportReviewButton
                        reviewId={review.id}
                        reviewerName={review.userName}
                        garagePath={`/garage/${vendor.id}`}
                      />
                    </div>
                  </div>
                </Reveal>
              ))}
            </>
          )}
        </div>
      </main>

      {/* The bar where Book now would be. */}
      {paused ? (
        // Plain and specific: the garage has stopped taking bookings for
        // now, in its own words when it gave any — not "unavailable", which
        // reads like our fault, and no promise of when.
        <div className="fixed inset-x-0 bottom-0 z-40 mx-auto w-full max-w-[428px] px-3 pb-[calc(14px+env(safe-area-inset-bottom))]">
          <div role="status" className="gp-bar rounded-[22px] px-[18px] py-3.5">
            <p className="text-t3 font-semibold text-text-primary">
              Not taking bookings right now
            </p>
            <p className="mt-0.5 text-t4 text-text-secondary">
              {vendor.bookingsPausedReason
                ? vendor.bookingsPausedReason
                : 'This garage has paused new bookings. Check back later, or pick another garage.'}
            </p>
          </div>
        </div>
      ) : (
        // The glass booking bar rises once something is picked. With several
        // services it carries the count and the combined time, because the
        // time is what decides whether the booking will fit a slot at all;
        // the total rolls like an odometer as services come and go.
        barUp && (
          <div className="fixed inset-x-0 bottom-0 z-40 mx-auto w-full max-w-[428px] px-3 pb-[calc(14px+env(safe-area-inset-bottom))]">
            <div
              ref={barRef}
              data-fly-target=""
              className="gp-bar flex h-[68px] items-center gap-3 rounded-[22px] pl-[18px] pr-2.5"
            >
              <div className="flex min-w-0 flex-1 flex-col gap-[3px]">
                <p className="truncate text-t5 font-medium text-[#A8A8B2]">
                  {selectedServices.length === 1 ? (
                    selectedServices[0].name
                  ) : (
                    <>
                      {selectedServices.length} services
                      {selectedDuration !== null && (
                        <>
                          {' '}
                          ·{' '}
                          <span className="font-numeric">
                            {formatDuration(selectedDuration)}
                          </span>
                        </>
                      )}
                    </>
                  )}
                </p>
                <p className="truncate text-[20px] font-semibold leading-[1.1] text-text-primary">
                  {/^[₹\d]/.test(barTotal) ? (
                    <Odometer value={barTotal} numeric={selectedTotal} />
                  ) : (
                    <Figures text={barTotal} />
                  )}
                </p>
              </div>
              {/* The page's one main action, solid red, with the ↗ that
                  nods as it goes. */}
              <div ref={bookRef} className="gp-book shrink-0">
                <MainAction
                  fullWidth={false}
                  className="px-6"
                  heroClassName="h-12 shrink-0 gap-1.5 rounded-[15px] px-5 text-t3 font-semibold"
                  heroIcon={<IconArrowUpRight size={16} stroke={1.8} aria-hidden />}
                  onClick={handleBook}
                >
                  Book now
                </MainAction>
              </div>
            </div>
          </div>
        )
      )}

      {/* A sheet rather than a centred dialog: this is a one-handed phone app,
          so the panel rises from the thumb rather than floating mid-screen,
          and it can grow as tall as its content needs without the cramped
          max-width a centred box imposes. Glass, like every sheet. */}
      <ScSheet
        open={detailsOpen}
        onClose={() => setDetailsOpen(false)}
        aria-label={details ? `${details.name} details` : 'Service details'}
        className="px-[18px] pt-1"
      >
        {details && (
          <>
            {/* No close button: the sheet's own handle, backdrop tap and
                Escape all dismiss it, and the primary action sits at the
                bottom within thumb reach. The garage's own media come
                first, as in the approved design; without any, no picture
                area at all, the category icon beside the name. Then the
                description and "What's included". */}
            <ServiceSheetTop
              key={details.id}
              service={details}
              garageName={vendor.name}
              isPackage={isPackage(details)}
            />

            {/* What the bundle contains, priced against the members' current
                prices — the same numbers the card badges. Named apart from
                "What's included" (the description's points) above. */}
            {isPackage(details) && (
              <div className="mt-4">
                <p className="mb-2 text-over font-semibold uppercase text-[#8E8E98]">
                  Services in this package
                </p>
                <ul className="flex flex-col gap-[7px]">
                  {details.items.map((item) => (
                    <li
                      key={item.serviceId}
                      className="flex items-center gap-2 text-t4 font-medium text-[#D8D8DE]"
                    >
                      <IconCheck
                        size={14}
                        aria-hidden
                        className="shrink-0 text-success"
                      />
                      {item.name}
                    </li>
                  ))}
                </ul>
                {/* A per-vehicle bundle's saving differs per vehicle, so it
                    is shown on the tier rows below instead of as one figure. */}
                {details.tierBreakdown === null && details.savings !== null && (
                  <p className="mt-2 text-t5 font-semibold text-text-primary">
                    Save{' '}
                    <span className="font-numeric font-bold">
                      {money(details.savings)}
                    </span>{' '}
                    vs{' '}
                    <span className="font-numeric font-bold">
                      {money(details.itemsTotal)}
                    </span>{' '}
                    separately
                  </p>
                )}
              </div>
            )}

            {/* Per-vehicle services price by tier, so show the breakdown
                rather than cramming it into one line as the card does. */}
            <div className="mt-4">
              {details.pricingType === 'per_vehicle' ? (
                <>
                  <p className="mb-1 text-over font-semibold uppercase text-[#8E8E98]">
                    Price by vehicle
                  </p>
                  {VEHICLE_TIERS.map(({ value: type, label }) => {
                    const price = tierPriceFor(details, type)
                    // A bundle's per-vehicle saving, when this is a package.
                    const tierSavings = isPackage(details)
                      ? (details.tierBreakdown?.[type].savings ?? null)
                      : null
                    return (
                      <div
                        key={type}
                        className="flex items-center justify-between border-t border-white/[0.07] py-2.5"
                      >
                        <span className="text-t4 font-medium text-text-secondary">
                          {label}
                        </span>
                        {price == null ? (
                          // Only reachable on services created before every
                          // tier became mandatory. Say so plainly rather than
                          // showing another vehicle's price — booking would
                          // be refused.
                          <span className="text-t5 text-text-muted">
                            Price on request
                          </span>
                        ) : (
                          <span className="flex items-center gap-2">
                            {tierSavings !== null && (
                              <span className="text-t5 font-medium text-text-secondary">
                                save{' '}
                                <span className="font-numeric">
                                  {money(tierSavings)}
                                </span>
                              </span>
                            )}
                            <span className="font-numeric text-t3 font-semibold text-text-primary">
                              {money(price)}
                            </span>
                          </span>
                        )}
                      </div>
                    )
                  })}
                </>
              ) : (
                <div className="flex items-center justify-between border-t border-white/[0.07] py-2.5">
                  <span className="text-t4 font-medium text-text-secondary">
                    {details.pricingType === 'on_inspection'
                      ? 'Inspection fee'
                      : 'Price'}
                  </span>
                  <span className="font-numeric text-t3 font-semibold text-text-primary">
                    {money(details.price)}
                  </span>
                </div>
              )}
              {details.pricingType === 'on_inspection' && (
                <p className="mt-1.5 text-t5 text-text-muted">
                  You pay the inspection fee when you book. If the work costs
                  more, the garage sends the final bill in the app and you pay
                  the rest there.
                </p>
              )}
            </div>

            {/* Solid red only while it adds: removing is the quieter action,
                the same way the card's Added state is. Absent while the
                garage is paused, like the card's own Add. */}
            {!paused && (
              <ScButton
                className="mt-5 h-[50px] rounded-[16px]"
                variant={selected.includes(details.id) ? 'secondary' : 'hero'}
                onClick={() => {
                  toggle(details.id)
                  setDetailsOpen(false)
                }}
              >
                <span>
                  {selected.includes(details.id)
                    ? 'Remove from booking'
                    : 'Add to booking'}
                </span>
              </ScButton>
            )}
          </>
        )}
      </ScSheet>
    </div>
  )
}
