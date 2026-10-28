'use client'

import { Fragment, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  IconArrowsSort,
  IconChevronDown,
  IconMap,
  IconRosetteDiscountCheckFilled,
  IconSearch,
} from '@tabler/icons-react'
import { ModeSwitch } from '@/components/mode-switch'
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
  coarse,
  isApproximate,
  isCitywide,
  shouldOfferLocationPrompt,
  useHydratedLocation,
  useLocationStore,
} from '@repo/core/stores/location-store'
import { ScButton } from '@repo/ui/sc/button'
import { CATEGORY_FILTERS } from '@repo/core/categories'
import { CERTIFIED_FILTER_LABEL } from '@repo/core/certification'
import { BOOKING_TYPES } from '@repo/core/booking-types'
import { atGarageReach, canCollectFrom, nextTabOffer } from '@repo/core/reach'
import type { BookingType } from '@repo/core/types'
import { cn } from '@repo/core/utils'
import {
  AtHomeLine,
  CanCollectChip,
  JustOutsideSection,
  NextTabFooter,
  PickupExplainer,
  SkipTheDriveCard,
} from './reach-parts'
import { FreeWashPiece } from '@/components/reach/free-wash'

const CATEGORIES = CATEGORY_FILTERS

type CategoryKey = (typeof CATEGORIES)[number]['key']

/**
 * The first page the landing page renders on the server: At garage, every
 * category, no Certified filter, no location, the default order. The list
 * starts from it only while it is asking exactly that (useVendorSearch's
 * `initialPage` must never seed another question's answer).
 */
export const LANDING_LIST_PARAMS = {
  bookingType: 'dropin' as const,
  sort: 'relevance' as const,
}

/**
 * The customer's garage list: mode switch, search, category chips, sort, the
 * garages (an infinite list), and the "never empty" pieces around them
 * (customer reach, 0062: Skip the drive, Can collect your car, the pickup
 * explainer, Just outside their area, and the next tab at the bottom).
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
  initialPage,
  onAskArea,
  animateCards = true,
}: {
  mode: BookingType
  onModeChange: (mode: BookingType) => void
  /** The search row; the landing page leaves it out to keep the first screen short. */
  showSearch?: boolean
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
}) {
  const router = useRouter()
  const serviceMode = mode
  const [category, setCategory] = useState<CategoryKey>('all')
  // "Certified only" (0048): a filter on the server, like the category, so
  // it holds across sorting and every page.
  const [certifiedOnly, setCertifiedOnly] = useState(false)
  // `null` means "the customer has not chosen", which is what lets the default
  // follow whether we know where they are. Derived rather than set from an
  // effect, so a location fix cannot race a tap on the sort sheet.
  const [chosenSort, setChosenSort] = useState<SortKey | null>(null)
  const [sortOpen, setSortOpen] = useState(false)
  const topRef = useRef<HTMLDivElement>(null)

  // Null until hydrated, so a server-rendered list (the landing page) and its
  // first client render agree; the stored place follows a moment later.
  const location = useHydratedLocation()
  const permission = useLocationStore((s) => s.permission)
  const promptDismissedAt = useLocationStore((s) => s.promptDismissedAt)
  const refreshPermission = useLocationStore((s) => s.refreshPermission)
  const selectChennai = useLocationStore((s) => s.selectChennai)

  // "All of Chennai" sends no origin: the list is the whole city, not a
  // distance from a downtown pin the customer never chose. A phone fix is
  // rounded to ~110 m before it leaves the device; an area is its centre.
  const citywide = isCitywide(location)
  const origin = citywide || !location ? undefined : coarse(location)
  const approximate = isApproximate(location)

  // Distance is the default once we know where the customer is.
  const sort: SortKey = chosenSort ?? (origin ? 'distance' : 'relevance')
  const effectiveSort = origin ? sort : sort === 'distance' ? 'relevance' : sort
  const category_ = category === 'all' ? undefined : category

  // The server-rendered page applies only to the question it answered.
  const asksLandingQuestion =
    serviceMode === LANDING_LIST_PARAMS.bookingType &&
    category_ === undefined &&
    !certifiedOnly &&
    !origin &&
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
      certified: certifiedOnly || undefined,
      lat: origin?.lat,
      lng: origin?.lng,
      sort: effectiveSort,
    },
    // A mode, chip or sort change keeps the current garages on screen until
    // the new ones land, instead of collapsing the page to one line of text.
    {
      keepPrevious: true,
      initialPage: asksLandingQuestion ? initialPage : undefined,
    }
  )

  // Where the located half ends. Only meaningful while an origin is known —
  // without one nothing has a distance, so there is no boundary to mark. A
  // list that is all unpinned garages starts with the boundary, so it is
  // headed by the same line rather than left unexplained.
  const firstUnlocatedIndex = origin
    ? vendors.findIndex((v) => v.distanceKm === null)
    : -1

  // The At garage tab's pieces (Skip the drive, or the small "at home" line).
  const atGarage =
    serviceMode === 'dropin' && !isRefreshing
      ? atGarageReach(reach, !!origin)
      : { skipTheDrive: null, atHomeLine: false, nearestKm: null }
  // The end of the list, where the next way to have it done is offered and
  // the "just outside" garages follow.
  const listEnded = !isLoading && !isError && !hasMore && !isRefreshing
  const justOutside =
    (serviceMode === 'doorstep' || serviceMode === 'pickup') && listEnded
      ? (outside ?? [])
      : []
  const nextOffer = nextTabOffer(serviceMode, reach)

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

  /** A tap that moves to another tab (never done by the list on its own). */
  const switchTo = (next: BookingType) => {
    if (next !== serviceMode) track('mode_switch', { mode: next })
    onModeChange(next)
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    topRef.current?.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' })
  }

  const card = (vendor: (typeof vendors)[number]) => (
    <VendorCard
      vendor={vendor}
      mode={serviceMode}
      action={<SaveGarageButton vendor={vendor} />}
      chips={
        serviceMode === 'dropin' && canCollectFrom(vendor, origin) ? (
          <CanCollectChip />
        ) : undefined
      }
    />
  )

  const ending = listEnded && (
    <>
      {justOutside.length > 0 && serviceMode !== 'dropin' && (
        <JustOutsideSection items={justOutside} mode={serviceMode} />
      )}
      <NextTabFooter mode={serviceMode} offer={nextOffer} onSwitch={switchTo} />
    </>
  )

  return (
    <>
      <div ref={topRef} className="scroll-mt-20">
        <ModeSwitch
          modes={BOOKING_TYPES}
          value={serviceMode}
          onChange={onModeChange}
          className="[&_button]:min-h-11"
        />
      </div>

      {showSearch && (
        <button
          type="button"
          onClick={() => router.push('/search')}
          className="flex items-center gap-2.5 rounded-[12px] border border-border bg-surface px-3.5 py-3 text-left"
        >
          <IconSearch size={17} className="text-text-secondary" />
          <span className="text-[13px] text-text-muted">
            Search garages or services
          </span>
        </button>
      )}

      {/* The chosen category is a white chip, not a red one: red on this
          screen is kept for things to press, and a solid red "All" was the
          loudest thing above the fold before a single garage had loaded. */}
      {/* py-2 -my-2: room inside the scroller for the chips' 44px touch
          areas, which it would otherwise clip at its edge. */}
      <div className="-mx-4 -my-2 flex gap-2 overflow-x-auto px-4 py-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {/* "Certified only" comes first, a switch rather than one of the
            categories: on, it narrows whichever category is chosen. White
            when on, like the chosen category. */}
        <button
          type="button"
          aria-pressed={certifiedOnly}
          onClick={() => setCertifiedOnly((on) => !on)}
          className={cn(
            'flex min-h-11 shrink-0 items-center gap-1.5 rounded-full px-4 text-[13px] font-medium transition-colors',
            certifiedOnly
              ? 'bg-brand-white text-brand-black'
              : 'bg-surface text-text-primary'
          )}
        >
          <IconRosetteDiscountCheckFilled
            size={15}
            aria-hidden="true"
            className="shrink-0"
          />
          {CERTIFIED_FILTER_LABEL}
        </button>
        <span aria-hidden="true" className="my-1.5 w-px shrink-0 bg-border" />
        {CATEGORIES.map((c) => (
          <button
            key={c.key}
            type="button"
            aria-pressed={category === c.key}
            onClick={() => setCategory(c.key)}
            className={cn(
              'min-h-11 shrink-0 rounded-full px-4 text-[13px] font-medium transition-colors',
              category === c.key
                ? 'bg-brand-white text-brand-black'
                : 'bg-surface text-text-primary'
            )}
          >
            {c.label}
          </button>
        ))}
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

      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          {/* min-w-0, not whitespace-nowrap: at 360px the heading and the
              Map and Sort pills don't fit on one line, so the heading wraps
              rather than pushing the page sideways. */}
          <h2 className="min-w-0 text-[17px] font-medium text-text-primary">
            {serviceMode === 'dropin' && atGarage.skipTheDrive
              ? 'Or drive to'
              : 'Nearby garages'}
          </h2>
          <div className="flex shrink-0 items-center gap-2">
            <Link
              href={{
                pathname: '/map',
                query: {
                  bookingType: serviceMode,
                  ...(category === 'all' ? {} : { category }),
                },
              }}
              className="flex min-h-11 items-center gap-1.5 rounded-full border border-line px-3.5 text-[13px] text-text-secondary"
            >
              <IconMap size={14} aria-hidden="true" />
              Map
            </Link>
            <button
              type="button"
              onClick={() => setSortOpen(true)}
              className="flex min-h-11 items-center gap-1.5 rounded-full border border-line px-3.5 text-[13px] text-text-secondary"
            >
              <IconArrowsSort size={14} aria-hidden="true" />
              {sortLabel(sort)}
              <IconChevronDown size={14} aria-hidden="true" />
            </button>
          </div>
        </div>

        {/* Pickup & drop is bounded by each garage's own reach from where the
            car is. Without a location the list cannot know that, so it says
            checkout will. */}
        {serviceMode === 'pickup' && !origin && vendors.length > 0 && (
          <p className="text-[11px] text-text-muted">
            Set your location to see only garages that collect from your area.
            Checkout checks your address either way.
          </p>
        )}

        {/* Where the distances are measured from, said once above the list.
            Every garage is listed (0062: no cut-off), so this is the only
            bound worth saying. */}
        {origin && location && vendors.length > 0 && sort === 'distance' && (
          <p className="text-[11px] text-text-muted">
            Nearest first from {location.label}
            {approximate && ' (distances from the area’s centre)'}
          </p>
        )}

        {atGarage.atHomeLine && (
          <AtHomeLine onSwitch={() => switchTo('doorstep')} />
        )}

        {/* Dimmed rather than replaced while a new filter loads. The delay
            means a quick answer never dims at all; the return is immediate. */}
        <div
          aria-busy={isRefreshing || undefined}
          className={cn(
            'flex flex-col gap-3 transition-opacity duration-200 ease-[cubic-bezier(0.2,0,0,1)] motion-reduce:transition-none',
            isRefreshing && 'opacity-60 delay-150'
          )}
        >
          {/* An empty list mid-refresh has no answer yet — "No garages found"
              would be the previous filter's result. */}
          {isLoading || (isRefreshing && vendors.length === 0) ? (
            <p className="py-8 text-center text-[13px] text-text-secondary">
              Finding garages…
            </p>
          ) : isError ? (
            // Not "No garages found": that is a fact about the area, and
            // saying it when the request failed sends people away for good.
            <ErrorState
              message="Couldn't load garages. Check your connection."
              onRetry={retry}
            />
          ) : vendors.length === 0 ? (
            // Never a dead end (F14): what was not found, and a way on.
            <div className="flex flex-col items-center gap-3 py-6 text-center">
              <p className="text-[15px] text-text-secondary">
                {certifiedOnly
                  ? 'No Detlio Certified garages here yet. Turn off “Certified only” to see every garage.'
                  : serviceMode === 'pickup'
                    ? 'No garage collects from your area yet.'
                    : serviceMode === 'doorstep' && !citywide
                      ? 'No garage travels to your area yet.'
                      : 'No garages match these filters.'}
              </p>
              <div className="flex flex-wrap justify-center gap-2">
                {certifiedOnly && (
                  <ScButton
                    variant="outline"
                    fullWidth={false}
                    onClick={() => setCertifiedOnly(false)}
                  >
                    Show every garage
                  </ScButton>
                )}
                {!certifiedOnly && category !== 'all' && (
                  <ScButton
                    variant="outline"
                    fullWidth={false}
                    onClick={() => setCategory('all')}
                  >
                    Show all services
                  </ScButton>
                )}
                {!certifiedOnly && origin && serviceMode !== 'dropin' && (
                  <ScButton
                    variant="outline"
                    fullWidth={false}
                    onClick={selectChennai}
                  >
                    Show all of Chennai
                  </ScButton>
                )}
                {!certifiedOnly && serviceMode !== 'dropin' && (
                  <ScButton
                    variant="outline"
                    fullWidth={false}
                    onClick={() => switchTo('dropin')}
                  >
                    Try At garage
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
                  {i === firstUnlocatedIndex && (
                    <p className="pt-1 text-[11px] text-text-muted">
                      Other garages — location not set yet
                    </p>
                  )}
                  {/* The mode travels with the tap, so the garage page and
                      checkout open on the choice made here. The wrapper is
                      what Behaviour's "Saw a garage" watches. */}
                  {animateCards ? (
                    <Reveal index={i}>
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
      </section>

      <GarageSeenWatcher mode={serviceMode} />

      <SortSheet
        open={sortOpen}
        value={sort}
        onChange={setChosenSort}
        onClose={() => setSortOpen(false)}
        locationUnavailable={citywide}
        // No "Top Rated" until a listed garage has a review to rank by.
        ratingAvailable={canSortByRating(vendors, sort, hasMore)}
      />
    </>
  )
}
