'use client'

import { Fragment, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  IconArrowsSort,
  IconBuildingStore,
  IconCarGarage,
  IconChevronDown,
  IconChevronRight,
  IconHome,
  IconMap,
  IconSearch,
  IconX,
} from '@tabler/icons-react'
import {
  SortSheet,
  canSortByRating,
  sortLabel,
  type SortKey,
} from '@repo/ui/sc/sort-sheet'
import { ErrorState } from '@repo/ui/sc/empty-state'
import { VendorCard } from '@repo/ui/features/vendor-card'
import { SaveGarageButton } from '@/components/favourites/save-garage-button'
import { Reveal } from '@repo/ui/sc/reveal'
import { GarageSeenWatcher } from '@/components/behaviour-marks'
import { useVendorSearch } from '@repo/core/api/hooks/use-vendors'
import type { VendorListResult } from '@repo/core/api/vendors'
import { browseCategory } from '@repo/core/analytics-events'
import { track } from '@repo/core/analytics'
import { InfiniteSentinel } from '@repo/ui/sc/infinite-sentinel'
import {
  cityCentreParams,
  coarse,
  isApproximate,
  isCitywide,
  shouldOfferLocationPrompt,
  useLocationStore,
} from '@repo/core/stores/location-store'
import { useCustomerPlace } from '@repo/core/hooks/use-customer-place'
import { ScButton } from '@repo/ui/sc/button'
import { CATEGORY_LABELS } from '@repo/core/categories'
import { SILVER_KEY_LABEL, SILVER_KEY_QUIET } from '@repo/core/tiers'
import { useTierConfig } from '@repo/core/api/hooks/use-tiers'
import {
  LUXURY_APPROVED_LINE,
  LUXURY_FILTER_LABEL,
  LUXURY_MAKE_PARAM,
  LUXURY_PARAM,
  specialistRow,
  type LuxuryMake,
} from '@repo/core/luxury'
import { LuxuryIcon } from '@repo/ui/features/luxury-badge'
import { BOOKING_TYPES, BOOKING_TYPE_LABELS } from '@repo/core/booking-types'
import { atGarageReach, canCollectFrom, nextTabOffer } from '@repo/core/reach'
import { cardPickupChip } from '@repo/core/pickup-fee-customer'
import {
  detlioInLine,
  farEmptyLine,
  firstFarIndex,
  inCityHeading,
  isSmallCity,
  nearGarageCount,
  mapPeekCount,
  mapPeekWords,
} from '@repo/core/customer-city'
import type { BookingType, Vendor } from '@repo/core/types'
import { cn } from '@repo/core/utils'
import { GraphiteSwitch } from '@repo/ui/finish/graphite-switch'
import { Odometer } from '@repo/ui/finish/odometer'
import { usePrefersReducedMotion } from '@repo/ui/finish/motion'
import { SilverKey } from '@repo/ui/finish/silver-key'
import { TwoLineControl } from '@repo/ui/finish/two-line-control'
import {
  AtHomeLine,
  CanCollectChip,
  JustOutsideSection,
  PickupFeeChip,
  NextTabFooter,
  PickupExplainer,
  SkipTheDriveCard,
} from './reach-parts'
import { FreeWashPiece } from '@/components/reach/free-wash'
import { BringGarageCard } from '@/components/reach/bring-garage'
import { FilterSheet, SERVICE_FILTERS, ServiceFilterIcon, serviceFilterLabel, type ServiceFilter } from './filter-sheet'
import { MapPeek } from './map-peek'
import { QuickLook } from './quick-look'
import { RollingHint } from './rolling-hint'
import { ShowroomCard } from './showroom-card'
import { luxuryCaption, luxuryPeekWords } from '@repo/core/luxury'
import { useDefaultCarMake } from './use-default-car-make'
import { PullToRefresh } from '@/components/moments/pull-to-refresh'
import { fill, msg, useT, type Translate } from '@repo/core/i18n'

/**
 * The first page the landing page renders on the server: At garage, every
 * category, no "Silver & above" filter, no location, the default order. The list
 * starts from it only while it is asking exactly that (useVendorSearch's
 * `initialPage` must never seed another question's answer).
 */
export const LANDING_LIST_PARAMS = {
  bookingType: 'dropin' as const,
  sort: 'relevance' as const,
}

const MODE_ICONS: Record<BookingType, typeof IconHome> = {
  dropin: IconBuildingStore,
  doorstep: IconHome,
  pickup: IconCarGarage,
}

/** The mode switch's quiet second lines (§3). */
const MODE_QUIET: Record<BookingType, string> = {
  dropin: msg('Drive it in'),
  doorstep: msg('We come to you'),
  pickup: msg('We collect it'),
}

/** "5 garages", "20+ garages", "1 garage" (the last word comes through `t`). */
function garagesCount(t: Translate, count: number, more: boolean): string {
  return t(count === 1 && !more ? '{count} garage' : '{count} garages', { count: `${count}${more ? '+' : ''}` })
}

/** Whether a list card offers the service, from its tags (codes or their names). */
function offers(vendor: Vendor, filter: Exclude<ServiceFilter, 'all'>): boolean {
  const names = [filter, CATEGORY_LABELS[filter]].map((n) => n.toLowerCase())
  return vendor.serviceTags.some((tag) => names.includes(tag.toLowerCase()))
}

/**
 * The customer's garage list: search, the map peek, the graphite mode switch
 * and the filter row (pinned to the top on glass while the list scrolls),
 * sort, the garages (an infinite list of Showroom cards), and the "never
 * empty" pieces around them (customer reach, 0062: Skip the drive, Can
 * collect your car, the pickup explainer, Just outside their area, and the
 * next tab at the bottom). The approved final state of the customer UI round
 * (Nov 2026, docs/ui-round-2026-11.md §3).
 *
 * Shared by /garages (and /home while the hub is off) and the landing page,
 * which owns the mode so its area chips can name it, and renders the first
 * page on the server (`initialPage`). Reads no URL query itself: the screens
 * around it do, inside their own Suspense boundary.
 */
export function GarageList({
  mode,
  onModeChange,
  showSearch = true,
  showMapPeek = showSearch,
  initialPage,
  onAskArea,
  animateCards = true,
  cardVariant = 'showroom',
}: {
  mode: BookingType
  onModeChange: (mode: BookingType) => void
  /** The search row; the landing page leaves it out to keep the first screen short. */
  showSearch?: boolean
  /** The map peek under the search; with the search by default. */
  showMapPeek?: boolean
  /** The landing page's server-rendered first page (LANDING_LIST_PARAMS). */
  initialPage?: VendorListResult
  /**
   * Offer the customer an area once garages are on screen (/garages; the
   * landing page has its chips instead). Called once per offer, after the
   * same cooldown the location prompt always had.
   */
  onAskArea?: () => void
  /**
   * The cards' arrival wave (Reveal). Off on the landing page, whose cards
   * are in the server's HTML and must show at first paint, not after the
   * script wakes up.
   */
  animateCards?: boolean
  /**
   * The Showroom card, or the older compact one (VendorCard: no photo track,
   * no facts row), kept for a list long enough to want four garages a
   * screen. Showroom is the approved default.
   */
  cardVariant?: 'showroom' | 'compact'
}) {
  const t = useT()
  const router = useRouter()
  const reduce = usePrefersReducedMotion()
  const serviceMode = mode
  const [category, setCategory] = useState<ServiceFilter>('all')
  // "Silver & above" (0063): a filter on the server, like the category, so
  // it holds across sorting and every page. Offered only while Detlio shows
  // Silver or Gold (GET /tiers): with both off there is nothing to find, and
  // an older API that cannot say means no key either.
  const tierConfig = useTierConfig()
  const silverFilterOffered = tierConfig.data?.silverFilter === true
  const [silverChosen, setSilverChosen] = useState(false)
  const silverOnly = silverChosen && silverFilterOffered
  // "Luxury specialists" (0083): a filter on the server like "Silver & above",
  // so the list, its count, the map peek and the reach pieces all follow it,
  // with every service and mode.
  // null: off; 'all': every specialist (the chip); a make: the specialists the
  // team approved for that make ("Specialists for your <Make>"'s See all,
  // luxuryMake on the server, so its count and the list agree).
  const [luxuryFilter, setLuxuryFilter] = useState<LuxuryMake | 'all' | null>(null)
  const luxuryOn = luxuryFilter !== null
  const luxuryMake = luxuryFilter !== null && luxuryFilter !== 'all' ? luxuryFilter : undefined
  // The signed-in customer's main car, for "Specialists for your <Make>".
  const carMake = useDefaultCarMake()
  // `null` means "the customer has not chosen", which is what lets the default
  // follow whether we know where they are. Derived rather than set from an
  // effect, so a location fix cannot race a tap on the sort sheet.
  const [chosenSort, setChosenSort] = useState<SortKey | null>(null)
  const [sortOpen, setSortOpen] = useState(false)
  const [filterOpen, setFilterOpen] = useState(false)
  const [quickLook, setQuickLook] = useState<Vendor | null>(null)
  // The switch and the filter row pin to the top while the list scrolls; this
  // sits just above them and says when they have.
  const pinRef = useRef<HTMLDivElement>(null)
  const [pinned, setPinned] = useState(false)

  // Null until hydrated, so a server-rendered list (the landing page) and its
  // first client render agree; the stored place follows a moment later. The
  // customer's city (0070) comes from it: Chennai until they are elsewhere.
  const { location, city, place } = useCustomerPlace()
  const permission = useLocationStore((s) => s.permission)
  const promptDismissedAt = useLocationStore((s) => s.promptDismissedAt)
  const refreshPermission = useLocationStore((s) => s.refreshPermission)
  const selectCity = useLocationStore((s) => s.selectCity)
  // Fewer than three garages in the customer's city: no counts anywhere,
  // "In Madurai", and one quiet way to recommend a garage (mockup D).
  const small = isSmallCity(city)

  // A whole city ("All of Coimbatore") sends no origin: the list is the
  // whole city, not a distance from a downtown pin the customer never chose.
  // Its centre goes along only for the 150 km limit (cityCentreParams). A
  // phone fix is rounded to ~110 m before it leaves the device; an area is
  // its centre.
  const citywide = isCitywide(location)
  const origin = citywide || !location ? undefined : coarse(location)
  const cityParams = cityCentreParams(location, city)
  const approximate = isApproximate(location)

  // Distance is the default once we know where the customer is.
  const sort: SortKey = chosenSort ?? (origin ? 'distance' : 'relevance')
  const effectiveSort = origin ? sort : sort === 'distance' ? 'relevance' : sort
  const category_ = category === 'all' ? undefined : category

  // The server-rendered page applies only to the question it answered.
  const asksLandingQuestion = (withCategory: boolean) =>
    serviceMode === LANDING_LIST_PARAMS.bookingType &&
    (!withCategory || category_ === undefined) &&
    !silverOnly &&
    !luxuryOn &&
    !origin &&
    cityParams.cityLat === undefined &&
    effectiveSort === LANDING_LIST_PARAMS.sort

  // Sorting, filtering and paging are all the server's job: the client holds
  // one page at a time and cannot order a list it has not fully seen.
  const {
    vendors,
    reach,
    outside,
    hasMore,
    isLoading,
    isRefreshing,
    isFetchingMore,
    isError,
    retry,
    loadMore,
  } = useVendorSearch(
    {
      bookingType: serviceMode,
      category: category_,
      silverAndAbove: silverOnly || undefined,
      luxury: luxuryOn || undefined,
      luxuryMake,
      lat: origin?.lat,
      lng: origin?.lng,
      ...cityParams,
      sort: effectiveSort,
    },
    // A mode, chip or sort change keeps the current garages on screen until
    // the new ones land, instead of collapsing the page to one line of text.
    {
      keepPrevious: true,
      initialPage: asksLandingQuestion(true) ? initialPage : undefined,
    }
  )

  // The same list with every service: the map peek's dots and the filter
  // sheet's counts. With "All services" chosen it is the very query above
  // (the same key), so it costs nothing; with a service chosen it is the one
  // the list showed a moment before, already in the cache.
  const everyService = useVendorSearch(
    {
      bookingType: serviceMode,
      silverAndAbove: silverOnly || undefined,
      luxury: luxuryOn || undefined,
      luxuryMake,
      lat: origin?.lat,
      lng: origin?.lng,
      ...cityParams,
      sort: effectiveSort,
    },
    {
      keepPrevious: true,
      initialPage: asksLandingQuestion(false) ? initialPage : undefined,
    }
  )
  const counts = Object.fromEntries(
    SERVICE_FILTERS.map((filter) => {
      if (everyService.isLoading) return [filter, null]
      const n =
        filter === 'all'
          ? everyService.vendors.length
          : everyService.vendors.filter((v) => offers(v, filter)).length
      // A count the loaded garages cannot vouch for is left off, never 0;
      // and a small city counts nothing at all.
      return [filter, n > 0 && !small ? `${n}${everyService.hasMore ? '+' : ''}` : null]
    })
  ) as Record<ServiceFilter, string | null>

  // Where the located half ends. Only meaningful while an origin is known —
  // without one nothing has a distance, so there is no boundary to mark. A
  // list that is all unpinned garages starts with the boundary, so it is
  // headed by the same line rather than left unexplained.
  const firstUnlocatedIndex = origin
    ? vendors.findIndex((v) => v.distanceKm === null)
    : -1
  // Where the near garages end and the ones in other towns begin (Tirupur,
  // 387 km): listed after a line, never counted as "near you". "Near" is
  // the customer's city's own reach (0070).
  const firstFar = firstFarIndex(vendors, {
    located: !!origin,
    nearestFirst: effectiveSort === 'distance',
    city,
  })

  // The At garage tab's pieces (Skip the drive, or the small "at home" line).
  const atGarage =
    serviceMode === 'dropin' && !isRefreshing
      ? atGarageReach(reach, !!origin, { counted: !small })
      : { skipTheDrive: null, atHomeLine: false, nearestKm: null }
  // The end of the list, where the next way to have it done is offered and
  // the "just outside" garages follow.
  const listEnded = !isLoading && !isError && !hasMore && !isRefreshing
  const justOutside =
    (serviceMode === 'doorstep' || serviceMode === 'pickup') && listEnded
      ? (outside ?? [])
      : []
  const nextOffer = nextTabOffer(serviceMode, reach)
  // An empty At garage list with every service, from a place: nothing within
  // 150 km (0070), as opposed to a filter that matched nothing.
  const farEmpty =
    !silverOnly &&
    !luxuryOn &&
    serviceMode === 'dropin' &&
    category === 'all' &&
    (!!origin || cityParams.cityLat !== undefined)

  // Knowing the permission state lets the header say whether tapping it will
  // pop a browser prompt or silently do nothing because it was already refused.
  useEffect(() => {
    void refreshPermission()
  }, [refreshPermission])

  // The list as it is browsed: once on arrival and once per mode or chip.
  useEffect(() => {
    track('garage_list_view', {
      mode: serviceMode,
      category: browseCategory(category),
    })
  }, [serviceMode, category])

  // Offered only after results are on screen: the sheet argues "pick your
  // area to sort these", which needs a list to point at. Prompting before
  // anything has loaded is the cold ask this exists to avoid.
  const storedLocation = useLocationStore((s) => s.location)
  useEffect(() => {
    if (!onAskArea || isLoading || vendors.length === 0) return
    if (
      !shouldOfferLocationPrompt({
        location: storedLocation,
        permission,
        promptDismissedAt,
      })
    ) {
      return
    }
    const timer = setTimeout(onAskArea, 1200)
    return () => clearTimeout(timer)
  }, [onAskArea, isLoading, vendors.length, storedLocation, permission, promptDismissedAt])

  // Pinned once the controls have reached the top of the screen.
  useEffect(() => {
    const marker = pinRef.current
    if (!marker || typeof IntersectionObserver === 'undefined') return
    const observer = new IntersectionObserver(([entry]) => {
      setPinned(!entry.isIntersecting && entry.boundingClientRect.top < 0)
    })
    observer.observe(marker)
    return () => observer.disconnect()
  }, [])

  /** The switch: a tap to another mode is a mode_switch, wherever it is made. */
  const changeMode = (next: BookingType) => {
    // Statistics → Behaviour's "switched tab": a tap to another one.
    if (next !== serviceMode) track('mode_switch', { mode: next })
    onModeChange(next)
  }

  /** A tap that moves to another tab (never done by the list on its own). */
  const switchTo = (next: BookingType) => {
    changeMode(next)
    // To where the controls sit before they pin: the pinned bar itself is
    // already "in view" wherever the page is.
    pinRef.current?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' })
  }

  const card = (vendor: Vendor) => {
    // The pickup fee for this card's distance (0079): "Pickup ₹99" / "Free pickup".
    const pickupChip = serviceMode === 'pickup' ? cardPickupChip(vendor) : null
    const chips =
      serviceMode === 'dropin' && canCollectFrom(vendor, origin) ? (
        <CanCollectChip />
      ) : pickupChip ? (
        <PickupFeeChip label={pickupChip} />
      ) : undefined
    if (cardVariant === 'compact') {
      return (
        <VendorCard
          vendor={vendor}
          mode={serviceMode}
          action={<SaveGarageButton vendor={vendor} />}
          chips={chips}
        />
      )
    }
    return (
      <ShowroomCard
        vendor={vendor}
        mode={serviceMode}
        action={<SaveGarageButton vendor={vendor} className="fx-glass bg-[rgb(18_18_22/0.5)]" />}
        chips={chips}
        approxDistance={approximate}
        onQuickLook={setQuickLook}
      />
    )
  }

  const ending = listEnded && (
    <>
      {justOutside.length > 0 && serviceMode !== 'dropin' && (
        <JustOutsideSection items={justOutside} mode={serviceMode} />
      )}
      {/* Bring your garage (21 Nov 2026): after the last garage, in every
          area; in a small city it is the one way to tell us about another
          (it replaced the quiet "Know a great garage in <City>?" row). */}
      <BringGarageCard />
      <NextTabFooter mode={serviceMode} offer={nextOffer} onSwitch={switchTo} />
    </>
  )

  const mapHref = {
    pathname: '/map',
    query: {
      bookingType: serviceMode,
      ...(category === 'all' ? {} : { category }),
      // "Luxury specialists" (0083): the map shows what the list does.
      ...(luxuryOn ? { [LUXURY_PARAM]: '1' } : {}),
      ...(luxuryMake ? { [LUXURY_MAKE_PARAM]: luxuryMake } : {}),
    },
  }
  // Only garages within reach (or inside the customer's city, with no
  // location) are "near you": the far towns further down the list are not.
  const near = nearGarageCount(everyService.vendors, {
    located: !!origin,
    hasMore: everyService.hasMore,
    nearestFirst: effectiveSort === 'distance',
    city,
  })
  // From a place, the map peek's count depends on the mode (owner, 22 Nov 2026):
  // At garage, garages within ~30 min's drive (in Chennai every garage is inside the
  // city's reach of every area, so "near you" never changed); Doorstep and Pickup &
  // drop, every garage that reaches the customer ("can come to you"), since they don't
  // drive. With nothing to count it falls back to the near-you count above; with the
  // luxury filter on, the specialists count keeps its own words.
  const drive = origin && !luxuryOn
    ? mapPeekCount(serviceMode, everyService.vendors, { hasMore: everyService.hasMore, nearestFirst: effectiveSort === 'distance' })
    : null
  // "Specialists for your BMW" (0083): the specialists among the garages
  // listed, above Nearby garages, for a customer whose main car is a luxury
  // make; not with the filter on, nor with fewer than two.
  const specialists = isLoading || isError ? null : specialistRow(carMake, vendors, luxuryOn)
  const turnLuxuryOn = (make: LuxuryMake) => {
    setLuxuryFilter(make)
    pinRef.current?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' })
  }

  const listCount = isLoading || small ? null : garagesCount(t, vendors.length, hasMore)
  // The same count, rolling like an odometer as the mode or the service changes.
  const listCountRolling =
    isLoading || small
      ? null
      : fill(t(vendors.length === 1 && !hasMore ? '{count} garage' : '{count} garages'), {
          count: <Odometer value={`${vendors.length}${hasMore ? '+' : ''}`} numeric={vendors.length} />,
        })

  return (
    <>
      {showSearch && (
        <button
          type="button"
          onClick={() => router.push('/search')}
          aria-label={t('Search garages or services')}
          className="fx-recessed flex h-[50px] items-center gap-2.5 rounded-[16px] px-4 text-left"
        >
          <IconSearch size={18} aria-hidden className="shrink-0 text-[#A0A0AA]" />
          <span aria-hidden="true" className="flex min-w-0 items-center gap-[0.3em] text-t3 text-[#9A9AA3]">
            {t('Search')}
            <RollingHint
              hints={[
                t('garages or services'),
                t('foam wash'),
                t('ceramic coating'),
                t('interior cleaning'),
                t('scratch removal'),
              ]}
            />
          </span>
        </button>
      )}

      {/* After the list's own first answer, so it never stands between the
          customer and the first garage; its streets load later still. */}
      {showMapPeek && !everyService.isLoading && !everyService.isError && (
        <MapPeek
          vendors={everyService.vendors}
          origin={origin}
          centre={origin ?? city.centre}
          mode={serviceMode}
          category={category_}
          luxury={luxuryOn}
          luxuryMake={luxuryMake}
          countLabel={
            small
              ? { count: null, words: detlioInLine(city) }
              : drive
                ? {
                    count: `${drive.count}${drive.more ? '+' : ''}`,
                    words: mapPeekWords(drive, t),
                  }
                : {
                  count: `${near.count}${near.more ? '+' : ''}`,
                  words: luxuryOn
                    ? luxuryPeekWords(near.count, near.more, !!origin, city.name, t)
                    : near.count === 1 && !near.more
                      ? origin
                        ? t('garage near you')
                        : t('garage in {city}', { city: city.name })
                      : origin
                        ? t('garages near you')
                        : t('garages in {city}', { city: city.name }),
                }
          }
        />
      )}

      <div ref={pinRef} aria-hidden="true" className="-mb-4 h-0" />
      <div
        className={cn(
          'sticky top-0 z-20 -mx-4 px-4 pb-2.5 pt-2.5 transition-[background-color,box-shadow,border-color] duration-200',
          'border-b border-transparent',
          pinned &&
            'border-white/9 bg-[rgb(12_12_14/0.72)] shadow-[0_12px_24px_rgb(0_0_0/0.35)] backdrop-blur-[22px] backdrop-saturate-[1.6]'
        )}
      >
        <GraphiteSwitch
          aria-label={t('Service mode')}
          value={serviceMode}
          onChange={changeMode}
          pinned={pinned}
          options={BOOKING_TYPES.map((value) => {
            const Icon = MODE_ICONS[value]
            return {
              value,
              label: t(BOOKING_TYPE_LABELS[value]),
              quiet: t(MODE_QUIET[value]),
              icon: <Icon aria-hidden />,
            }
          })}
        />
        <div className="mt-2 flex gap-2">
          <TwoLineControl
            onClick={() => setFilterOpen(true)}
            aria-haspopup="dialog"
            aria-label={
              listCount
                ? t('Service: {service}, {count}. Change', { service: serviceFilterLabel(category), count: listCount })
                : t('Service: {service}. Change', { service: serviceFilterLabel(category) })
            }
            pinned={pinned}
            className="flex-1"
            tile={<ServiceFilterIcon filter={category} />}
            main={serviceFilterLabel(category)}
            quiet={small ? undefined : (listCountRolling ?? t('Finding garages…'))}
            trailing={<IconChevronDown size={16} aria-hidden />}
          />
          {/* Not there at all while Detlio shows neither Silver nor Gold. */}
          {silverFilterOffered && (
            <SilverKey
              on={silverOnly}
              onToggle={() => setSilverChosen((on) => !on)}
              label={t(SILVER_KEY_LABEL)}
              quiet={t(SILVER_KEY_QUIET)}
              pinned={pinned}
            />
          )}
        </div>
        {/* "Luxury specialists" (0083): its own short line, since the row
            above has no room for a third button on a phone. Plain until
            chosen; then pearl, the Service sheet's "chosen" look, with an ×. */}
        <div className="mt-2 flex">
          <button
            type="button"
            aria-pressed={luxuryOn}
            onClick={() => setLuxuryFilter(luxuryOn ? null : 'all')}
            className={cn(
              'fx-press inline-flex h-[34px] items-center gap-1.5 rounded-pill px-3 text-t4',
              luxuryOn ? 'fx-pearl font-semibold' : 'fx-raised font-medium text-[#D4D4DA]'
            )}
          >
            <LuxuryIcon size={15} className={luxuryOn ? undefined : 'text-[#A8A8B2]'} />
            {t(LUXURY_FILTER_LABEL)}
            {luxuryOn && <IconX size={14} aria-hidden="true" />}
          </button>
        </div>
      </div>

      {/* Pickup & drop, explained before its garages: who has the car, and
          how it comes back. */}
      {serviceMode === 'pickup' && <PickupExplainer />}

      {/* At garage, nearest garage 10 km or more: what can be done without
          driving, with real counts. Each row switches tab on a tap. */}
      {atGarage.skipTheDrive && (
        <SkipTheDriveCard
          rows={atGarage.skipTheDrive}
          nearestKm={atGarage.nearestKm}
          onSwitch={switchTo}
        />
      )}

      {/* Their area has no garage yet (0062): the free wash for the day we
          arrive, under Skip the drive or at the top. Pickup & drop offers it
          at the bottom instead, so a screen shows it once. */}
      {serviceMode !== 'pickup' && <FreeWashPiece placement="top" />}

      {specialists && (
        <section className="flex flex-col gap-3" aria-label={t('Specialists for your {make}', { make: specialists.make })}>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="text-t2 font-semibold text-text-primary">
                {t('Specialists for your {make}', { make: specialists.make })}
              </h2>
              <p className="mt-0.5 text-t5 font-medium text-[#9A9AA3]">{t(LUXURY_APPROVED_LINE)}</p>
            </div>
            <button
              type="button"
              onClick={() => turnLuxuryOn(specialists.make)}
              className="fx-raised fx-press flex h-10 shrink-0 items-center gap-1 rounded-[12px] px-3.5 text-t4 font-medium text-[#C8C8D0]"
            >
              {t('See all {count}', { count: `${specialists.garages.length}${hasMore ? '+' : ''}` })}
              <IconChevronRight size={15} aria-hidden="true" className="text-[#8E8E98]" />
            </button>
          </div>
          {/* Sideways, the same cards as the list: the next one peeks in. */}
          <div className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto scroll-px-4 px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {specialists.garages.map((vendor) => (
              <div key={vendor.id} data-garage-card="" className="w-[86%] max-w-[420px] shrink-0 snap-start">
                {card(vendor)}
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="flex flex-col gap-3">
        <div>
          <div className="flex items-center justify-between gap-3">
            {/* No count beside it: the count lives in the filter button. min-w-0,
                not whitespace-nowrap, so at 360px the heading wraps rather than
                pushing the page sideways. */}
            <h2 className="min-w-0 text-t2 font-semibold text-text-primary">
              {luxuryMake
                ? t('Specialists for your {make}', { make: luxuryMake })
                : luxuryOn
                ? t(LUXURY_FILTER_LABEL)
                : serviceMode === 'dropin' && atGarage.skipTheDrive
                ? t('Or drive to')
                : small
                  ? inCityHeading(city)
                  : t('Nearby garages')}
            </h2>
            <div className="flex shrink-0 items-center gap-2">
              {/* The map peek is the way to the map; without it, this is. */}
              {!showMapPeek && (
                <Link
                  href={mapHref}
                  className="fx-raised fx-press flex h-10 items-center gap-1.5 rounded-[12px] px-3.5 text-t4 font-medium text-[#C8C8D0]"
                >
                  <IconMap size={15} aria-hidden="true" />
                  {t('Map')}
                </Link>
              )}
              <button
                type="button"
                onClick={() => setSortOpen(true)}
                aria-haspopup="dialog"
                className="fx-raised fx-press flex h-10 items-center gap-1.5 rounded-[12px] px-3.5 text-t4 font-medium text-[#C8C8D0]"
              >
                <IconArrowsSort size={15} aria-hidden="true" className="text-[#8E8E98]" />
                {sortLabel(sort)}
              </button>
            </div>
          </div>

          {/* Where the distances are measured from, said once above the list.
              Every garage is listed (0062: no cut-off), so this is the only
              bound worth saying. */}
          {/* With "Luxury specialists" on: who approved them (and the order). */}
          {luxuryOn && vendors.length > 0 && (
            <p className="mt-1 text-t5 font-medium text-[#9A9AA3]">
              {luxuryCaption(!!origin && sort === 'distance', t)}
            </p>
          )}
          {!luxuryOn && origin && location && vendors.length > 0 && sort === 'distance' && (
            <p className="mt-1 text-t5 font-medium text-[#9A9AA3]">
              {t('Nearest first from {label}', { label: location.label })}
              {approximate && ` ${t('(distances from the area’s centre)')}`}
            </p>
          )}

          {/* Pickup & drop is bounded by each garage's own reach from where the
              car is. Without a location the list cannot know that, so it says
              checkout will. */}
          {serviceMode === 'pickup' && !origin && vendors.length > 0 && (
            <p className="mt-1 text-t5 text-text-muted">
              {t('Set your location to see only garages that collect from your area. Checkout checks your address either way.')}
            </p>
          )}
        </div>

        {atGarage.atHomeLine && (
          <AtHomeLine onSwitch={() => switchTo('doorstep')} />
        )}

        {/* Pull the list down to ask again now (moment 6). Dimmed rather
            than replaced while a new filter loads. The delay means a quick
            answer never dims at all; the return is immediate. */}
        <PullToRefresh onRefresh={retry}>
        <div
          aria-busy={isRefreshing || undefined}
          className={cn(
            'flex flex-col gap-3.5 transition-opacity duration-200 ease-[cubic-bezier(0.2,0,0,1)] motion-reduce:transition-none',
            isRefreshing && 'opacity-60 delay-150'
          )}
        >
          {/* An empty list mid-refresh has no answer yet — "No garages found"
              would be the previous filter's result. */}
          {isLoading || (isRefreshing && vendors.length === 0) ? (
            <p className="py-8 text-center text-t4 text-text-secondary">
              {t('Finding garages…')}
            </p>
          ) : isError ? (
            // Not "No garages found": that is a fact about the area, and
            // saying it when the request failed sends people away for good.
            <ErrorState
              message={t("Couldn't load garages. Check your connection.")}
              onRetry={retry}
            />
          ) : vendors.length === 0 ? (
            // Never a dead end (F14): what was not found, and a way on.
            <div className="flex flex-col items-center gap-3 py-6 text-center">
              <p className="text-t3 text-text-secondary">
                {luxuryOn
                  ? t('No luxury specialists here yet. Turn off “{label}” to see every garage.', { label: t(LUXURY_FILTER_LABEL) })
                  : silverOnly
                  ? t('No Silver or Gold garages here yet. Turn off “{label}” to see every garage.', { label: t(SILVER_KEY_LABEL) })
                  : serviceMode === 'pickup'
                    ? t('No garage collects from your area yet.')
                    : serviceMode === 'doorstep' && !citywide
                      ? t('No garage travels to your area yet.')
                      : farEmpty
                        ? // Nothing within 150 km (0070): why, and the way on.
                          farEmptyLine(place)
                        : t('No garages match these filters.')}
              </p>
              <div className="flex flex-wrap justify-center gap-2">
                {/* Nothing within 150 km (0070): another city, in the area sheet. */}
                {onAskArea && farEmpty && (
                  <ScButton variant="outline" fullWidth={false} onClick={onAskArea}>
                    {t('Choose a city')}
                  </ScButton>
                )}
                {luxuryOn && (
                  <ScButton variant="outline" fullWidth={false} onClick={() => setLuxuryFilter(null)}>
                    {t('Show every garage')}
                  </ScButton>
                )}
                {!luxuryOn && silverOnly && (
                  <ScButton
                    variant="outline"
                    fullWidth={false}
                    onClick={() => setSilverChosen(false)}
                  >
                    {t('Show every garage')}
                  </ScButton>
                )}
                {!silverOnly && !luxuryOn && category !== 'all' && (
                  <ScButton
                    variant="outline"
                    fullWidth={false}
                    onClick={() => setCategory('all')}
                  >
                    {t('Show all services')}
                  </ScButton>
                )}
                {!silverOnly && !luxuryOn && origin && serviceMode !== 'dropin' && (
                  <ScButton
                    variant="outline"
                    fullWidth={false}
                    onClick={() => selectCity(city)}
                  >
                    {t('Show all of {city}', { city: city.name })}
                  </ScButton>
                )}
                {!silverOnly && !luxuryOn && serviceMode !== 'dropin' && (
                  <ScButton
                    variant="outline"
                    fullWidth={false}
                    onClick={() => switchTo('dropin')}
                  >
                    {t('Try At garage')}
                  </ScButton>
                )}
              </div>
            </div>
          ) : (
            <>
              {vendors.map((vendor, i) => (
                <Fragment key={vendor.id}>
                  {/* The list is really two lists: garages we can measure a
                      distance to, then those still waiting on a pin. Saying so
                      at the boundary beats letting distance-less cards trail
                      off the end of a "Nearest First" list unexplained. */}
                  {i === firstFar && (
                    <p className="pt-1 text-t5 text-text-muted">
                      {t('Further away · other towns')}
                    </p>
                  )}
                  {i === firstUnlocatedIndex && (
                    <p className="pt-1 text-t5 text-text-muted">
                      {t('Other garages — location not set yet')}
                    </p>
                  )}
                  {/* The mode travels with the tap, so the garage page and
                      checkout open on the choice made here. The wrapper is
                      what Behaviour's "Saw a garage" watches. */}
                  {animateCards ? (
                    <Reveal index={Math.min(i, 2)}>
                      <div data-garage-card="">{card(vendor)}</div>
                    </Reveal>
                  ) : (
                    <div data-garage-card="">{card(vendor)}</div>
                  )}
                </Fragment>
              ))}
              <InfiniteSentinel
                onVisible={loadMore}
                enabled={hasMore}
                loading={isFetchingMore}
              />
            </>
          )}
          {ending}
        </div>
        </PullToRefresh>
      </section>

      <GarageSeenWatcher mode={serviceMode} />

      <FilterSheet
        open={filterOpen}
        value={category}
        counts={counts}
        onChange={setCategory}
        onClose={() => setFilterOpen(false)}
      />

      <SortSheet
        open={sortOpen}
        value={sort}
        onChange={setChosenSort}
        onClose={() => setSortOpen(false)}
        locationUnavailable={citywide}
        // No "Top Rated" until a listed garage has a review to rank by.
        ratingAvailable={canSortByRating(vendors, sort, hasMore)}
      />

      <QuickLook vendor={quickLook} mode={serviceMode} onClose={() => setQuickLook(null)} />
    </>
  )
}
