'use client'

import {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import {
  IconArrowUpRight,
  IconChevronLeft,
  IconChevronRight,
  IconChevronUp,
  IconCurrentLocation,
  IconList,
  IconMap,
  IconRefresh,
  IconStarFilled,
} from '@tabler/icons-react'
import { NEW_GARAGE_LABEL, hasStarScore } from '@repo/core/ratings'
import { prefetchGarage, useVendorSearch } from '@repo/core/api/hooks/use-vendors'
import { useQueryClient } from '@tanstack/react-query'
import { track } from '@repo/core/analytics'
import {
  coarse,
  isApproximate,
  isCitywide,
  useLocationStore,
} from '@repo/core/stores/location-store'
// From map-bounds, not map-controller: the controller imports the map and so
// MapLibre, which a static import here put in the page's first load.
import { boundsToParam, type MapBounds } from '@repo/ui/features/map-bounds'
import { FLOATING_NAV_CLEARANCE } from '@repo/ui/sc/app-shell'
import { Figures } from '@repo/ui/sc/figures'
import { OutsideCityChip } from '@repo/ui/features/outside-city'
import { GarageCover } from '@repo/ui/features/garage-cover'
import {
  DEFAULT_CENTER,
  MAP_STYLES,
  MAP_THEME,
  straightLineKm,
} from '@repo/core/map'
import { distanceAndDrive, distanceLabel, driveTimeLabel } from '@repo/core/drive-time'
import { SERVICE_CITY } from '@repo/core/service-city'
import { categoryLabel } from '@repo/core/categories'
import { cn } from '@repo/core/utils'
import { ScSheet } from '@repo/ui/sc/modal'
import { usePrefersReducedMotion } from '@repo/ui/finish/motion'
import {
  BOOKING_TYPE_LABELS,
  bookingTypeParam,
  parseBookingType,
} from '@repo/core/booking-types'
import type { BookingType, Vendor } from '@repo/core/types'
import { OpenStatus } from '@/components/open-status'
import { HubNav } from '@/components/home/hub-nav'
import { isHomeHubEnabled } from '@/lib/home-hub'
import { fitPadding, framingBounds, type FitPadding } from '@/lib/map-view'
import { fill, useT } from '@repo/core/i18n'

/**
 * Airbnb-style map browse.
 *
 * Three ways of choosing what is on the map:
 *
 * - Nearby, whenever we know where the customer is: every garage within the
 *   list's 50 km, nearest first (the same radius as the list and Home), and
 *   the map opens framing the customer and all of them. The query does not
 *   wait for the map at all, so the cards load even before it has drawn.
 * - City, for a customer with no location: every pinned garage within the
 *   same 50 km of the city centre, nearest the centre first, all framed at
 *   once. The owner asked for every garage on the opening map; the old opening
 *   viewport, a few kilometres of central Chennai, left out the suburbs.
 *   Garages in other towns are left off, as they are for a Chennai customer.
 * - This area: after "Search this area", whatever is inside the viewport
 *   rectangle. That is a bounding-box query rather than a radius one, which is
 *   why `bbox` went into the listing API up front (plans/geo.md §8). "Centre
 *   on my location" goes back to nearby.
 *
 * The two-way binding between markers and cards is the whole interaction:
 * tapping a pin brings its card up, swiping or tapping a card turns its pin
 * red. Either one alone would be a map with a list stapled underneath it.
 */

// maplibre-gl is ~200KB gzipped plus WebGL; it loads only on this route and the
// picker, never in the listing bundle.
const Map = dynamic(() => import('@repo/ui/sc/map').then((m) => m.Map), {
  ssr: false,
  loading: () => <div className="h-full w-full animate-pulse bg-surface" />,
})
const MapController = dynamic(
  () => import('@repo/ui/features/map-controller').then((m) => m.MapController),
  { ssr: false }
)
const GaragePins = dynamic(
  () => import('@/components/map/garage-pins').then((m) => m.GaragePins),
  { ssr: false }
)
const RouteArc = dynamic(
  () => import('@/components/map/route-arc').then((m) => m.RouteArc),
  { ssr: false }
)

const PAGE_LIMIT = 50

/**
 * City mode's reach from the centre, and Nearby mode's from the customer:
 * the city's 50 km (CITY_REACH_KM in the server's lib/discovery.ts), so a
 * customer with no location sees what one standing in the centre would. The
 * service city's own numbers, so a garage this leaves off is exactly one
 * that carries the "Outside Chennai" sign.
 */
const CITY_RADIUS_KM = SERVICE_CITY.radiusKm
const CITY_CENTRE = SERVICE_CITY.centre

/**
 * The opening zoom, before any fit: about a city across on a phone. Chennai
 * for a customer with no location, which the fit then narrows to its garages.
 */
const OPENING_ZOOM = 11

/**
 * How much the viewport must change before "Search this area" appears.
 *
 * Measured against the viewport's own size rather than in fixed degrees: a
 * quarter-screen pan means the same thing at street zoom and at city zoom,
 * whereas a fixed epsilon fires constantly when zoomed in and never when zoomed
 * out. Tile loads and container resizes nudge the bounds by a hair on first
 * paint, and a fixed threshold turned that into a button offering to re-search
 * a map nobody had touched.
 */
function hasMovedMeaningfully(
  live: MapBounds | null,
  searched: MapBounds | null
): boolean {
  if (!live || !searched) return false

  const width = Math.abs(searched.maxLng - searched.minLng)
  const height = Math.abs(searched.maxLat - searched.minLat)
  if (width === 0 || height === 0) return false

  const centreShiftX =
    Math.abs(
      (live.minLng + live.maxLng) / 2 - (searched.minLng + searched.maxLng) / 2
    ) / width
  const centreShiftY =
    Math.abs(
      (live.minLat + live.maxLat) / 2 - (searched.minLat + searched.maxLat) / 2
    ) / height
  const zoomChange = Math.abs(Math.abs(live.maxLng - live.minLng) / width - 1)

  // A quarter-screen pan, or a ~35% change in how much ground is visible.
  return centreShiftX > 0.25 || centreShiftY > 0.25 || zoomChange > 0.35
}

function hasPin(
  vendor: Vendor
): vendor is Vendor & { lat: number; lng: number } {
  return vendor.lat !== null && vendor.lng !== null
}

function MapBrowseContent() {
  const t = useT()
  const router = useRouter()
  // Read at build time (lib/home-hub.ts): the hub's floating nav, or none as
  // before.
  const hub = isHomeHubEnabled()
  const searchParams = useSearchParams()
  const location = useLocationStore((s) => s.location)
  const requestGpsLocation = useLocationStore((s) => s.requestGpsLocation)
  const locating = useLocationStore((s) => s.locating)

  const bookingType =
    parseBookingType(searchParams.get('bookingType')) ?? 'dropin'
  const category = searchParams.get('category') ?? undefined

  useEffect(() => {
    track('map_view', { mode: bookingType })
  }, [bookingType])

  // Browsing all of Chennai (the header's citywide choice) behaves like
  // having no location: city mode below shows every pinned garage.
  const origin =
    !location || isCitywide(location) ? undefined : coarse(location)
  const hasOrigin = origin !== undefined

  /**
   * The viewport being searched, in "this area" mode; null means nearby mode
   * while there is a location (and, without one, that the opening viewport
   * has not been reported yet).
   */
  const [areaBounds, setAreaBounds] = useState<MapBounds | null>(null)
  /** Where the map is now. */
  const [liveBounds, setLiveBounds] = useState<MapBounds | null>(null)
  /**
   * Where the app last put the map, or where it last searched: what "Search
   * this area" is measured from. Not the searched viewport alone, because in
   * nearby mode nothing was searched by viewport, and the opening fit moves
   * the map without the customer touching it.
   */
  const [baseline, setBaseline] = useState<MapBounds | null>(null)
  /** Bumped by "Centre on my location", so a second press frames again. */
  const [recentred, setRecentred] = useState(0)
  /**
   * The explicit choice, if one has been made. The effective selection is
   * derived below — storing it outright would need an effect to re-sync every
   * time the result set changes under it, and that effect would fight the
   * scroll handler for who owns the value.
   */
  const [chosenId, setChosenId] = useState<string | null>(null)
  /** The last garage chosen by a tap, for the map to bring into view. */
  const [reveal, setReveal] = useState<{ id: string; n: number } | null>(null)
  /** The pull-up list of every garage on the map (List, or "N garages near you"). */
  const [listOpen, setListOpen] = useState(false)
  const reduce = usePrefersReducedMotion()
  const rootRef = useRef<HTMLDivElement>(null)
  const topRef = useRef<HTMLDivElement>(null)
  const resultsRef = useRef<HTMLDivElement>(null)
  const cardsRef = useRef<HTMLDivElement>(null)
  /** Suppresses the scroll→select feedback loop while we scroll programmatically. */
  const scrollingProgrammatically = useRef(false)

  const nearby = origin !== undefined && areaBounds === null
  const city = !hasOrigin && areaBounds === null

  const {
    vendors: found,
    radiusKm,
    isLoading,
  } = useVendorSearch(
    {
      bookingType,
      category,
      // Nearby sends no viewport but the city's 50 km, so the map stays a
      // neighbourhood (the list itself has no bound since 0062; doorstep and
      // pickup: each garage's own reach, the server ignores the radius).
      // City mode sends neither: every pinned garage comes back, and the ones
      // within reach of the centre are picked below.
      bbox: areaBounds ? boundsToParam(areaBounds) : undefined,
      lat: origin?.lat,
      lng: origin?.lng,
      radiusKm: nearby ? CITY_RADIUS_KM : undefined,
      sort: origin ? 'distance' : 'relevance',
      // A garage with no coordinates cannot be drawn on a map, so the tail of
      // still-unpinned garages is the one place it makes no sense to include.
      includeUnlocated: false,
      // A viewport zoomed out to state level could match everything, so the
      // page is capped and the map says so rather than truncating silently.
      limit: PAGE_LIMIT,
    },
    { enabled: nearby || city || areaBounds !== null }
  )

  // City mode: the page holds every pinned garage, other towns included, so
  // keep those within reach of the centre, nearest it first. Done here rather
  // than with the centre as an origin, which would rank doorstep garages by
  // whether they travel to the centre instead of showing them all.
  const vendors = useMemo(() => {
    if (!city) return found
    return found
      .filter(hasPin)
      .map((vendor) => ({ vendor, km: straightLineKm(CITY_CENTRE, vendor) }))
      .filter(({ km }) => km <= CITY_RADIUS_KM)
      .sort((a, b) => a.km - b.km)
      .map(({ vendor }) => vendor)
  }, [city, found])

  const handleBoundsChange = useCallback(
    (bounds: MapBounds, _center: unknown, meta: { programmatic: boolean }) => {
      setLiveBounds(bounds)
      // The app put the map here (the opening view, a fit, a bubble zooming
      // in), so there is nothing new to search from this view.
      if (meta.programmatic) setBaseline(bounds)
    },
    []
  )

  const hasMoved = hasMovedMeaningfully(liveBounds, baseline)

  const searchThisArea = () => {
    if (!liveBounds) return
    setAreaBounds(liveBounds)
    setBaseline(liveBounds)
  }

  /**
   * Back to nearby mode, from a fresh fix.
   *
   * Updating the location store alone moved nothing: the map's centre is a
   * construction option MapLibre reads once. Clearing the area search puts
   * the screen back on the nearby list for the new fix, and the bump frames
   * it again even when the fix lands where the last one did.
   */
  const centreOnMe = async () => {
    const fix = await requestGpsLocation()
    if (!fix) return
    setAreaBounds(null)
    setRecentred((count) => count + 1)
  }

  // Falls back to the first result, so the strip always opens on a defined
  // card rather than mid-scroll on an arbitrary one, and a selection that is no
  // longer in the results simply stops applying.
  const selectedId =
    chosenId && vendors.some((v) => v.id === chosenId)
      ? chosenId
      : (vendors[0]?.id ?? null)

  /** Brings a card into view without it echoing back as a new selection. */
  const scrollCardIntoView = useCallback((vendorId: string) => {
    const node = cardsRef.current?.querySelector<HTMLElement>(
      `[data-vendor-id="${vendorId}"]`
    )
    if (!node) return

    scrollingProgrammatically.current = true
    node.scrollIntoView({
      behavior: reduce ? 'auto' : 'smooth',
      inline: 'center',
      block: 'nearest',
    })
    window.setTimeout(() => {
      scrollingProgrammatically.current = false
    }, 500)
  }, [reduce])

  /**
   * A pin or a card was tapped: that garage's card comes to the middle of the
   * strip and its pin turns red. The map keeps its zoom — flying to street
   * level from a 50 km view would throw away the overview the customer was
   * using to choose — but if the pin is off screen (a card tapped after a
   * bubble zoomed in elsewhere), GaragePins pans just far enough to show it.
   */
  const choose = (vendor: Vendor) => {
    setChosenId(vendor.id)
    setReveal((last) => ({ id: vendor.id, n: (last?.n ?? 0) + 1 }))
    scrollCardIntoView(vendor.id)
  }

  const selectedIndex = vendors.findIndex((v) => v.id === selectedId)

  /** The pager and the strip's edges: the next or the previous card. */
  const step = (by: 1 | -1) => {
    const next = vendors[selectedIndex + by]
    if (next) choose(next)
  }

  /**
   * Swiping the cards: whichever card is centred becomes the selection.
   *
   * Driven by scroll position rather than hover — hover does not exist on a
   * phone, which is the only place this screen is used.
   */
  const onCardsScroll = () => {
    if (scrollingProgrammatically.current) return

    const container = cardsRef.current
    if (!container) return

    const centre = container.scrollLeft + container.clientWidth / 2
    const cards = Array.from(
      container.querySelectorAll<HTMLElement>('[data-vendor-id]')
    )

    const closest = cards.reduce<{ id: string; distance: number } | null>(
      (best, node) => {
        const distance = Math.abs(
          node.offsetLeft + node.offsetWidth / 2 - centre
        )
        return !best || distance < best.distance
          ? { id: node.dataset.vendorId ?? '', distance }
          : best
      },
      null
    )

    if (closest && closest.id && closest.id !== selectedId) {
      setChosenId(closest.id)
    }
  }

  /**
   * Room around a fit, measured when it happens: the controls on top and the
   * card strip along the bottom (taller with the hub's floating nav), so no
   * pin is framed underneath either.
   */
  const getPadding = useCallback((): FitPadding => {
    const root = rootRef.current?.getBoundingClientRect()
    if (!root) return { top: 48, bottom: 48, left: 72, right: 72 }
    const top = topRef.current
      ? topRef.current.getBoundingClientRect().bottom - root.top
      : 0
    const bottom = resultsRef.current
      ? root.bottom - resultsRef.current.getBoundingClientRect().top
      : 0
    return fitPadding(
      { width: root.width, height: root.height },
      { top, bottom }
    )
  }, [])

  // What the map frames once results land, keyed so it happens once per
  // origin (and per "Centre on my location"), never again on a re-render.
  // Nearby: the customer and every pin, however far apart; with no garages
  // within reach, the customer alone, at about a city across. No location:
  // every garage around the city centre, once — later area searches leave the
  // map where the customer put it.
  const pins = vendors.filter(hasPin)
  let fitKey: string | null = null
  let fitTarget: MapBounds | null = null
  if (!isLoading && nearby && origin) {
    fitKey = `nearby:${origin.lat},${origin.lng}:${recentred}`
    fitTarget =
      pins.length > 0
        ? framingBounds([origin, ...pins], 3)
        : framingBounds([origin], 12)
  } else if (!isLoading && city && pins.length > 0) {
    fitKey = 'city'
    fitTarget = framingBounds(pins, 3)
  }

  const center: [number, number] = location
    ? [location.lng, location.lat]
    : DEFAULT_CENTER

  const emptyMessage =
    bookingType === 'pickup' ? (
      t('No garages pick up near you yet — try At garage or Doorstep.')
    ) : bookingType === 'doorstep' ? (
      t('No garages travel to this area yet.')
    ) : nearby && radiusKm !== null ? (
      <>
        {fill(t('No garages within {radiusKm} km of you yet.'), { radiusKm: <span className="font-numeric">{radiusKm}</span> })}
      </>
    ) : (
      t('No garages in this area. Try zooming out or moving the map.')
    )

  return (
    // Below the cookie bar while it is up (--consent-bar, app/globals.css).
    <div
      ref={rootRef}
      className="fixed inset-x-0 top-(--consent-bar) bottom-0 bg-surface"
    >
      {/* Chrome column: phone-width, centred, transparent to pointer events
          except where a control actually sits. First in the DOM, and kept on
          top with z-index, so a keyboard or screen-reader user reaches Back,
          List, Centre and the cards before the map's pins (up to 50 of them,
          plus bubbles); the cards are the full-name way to choose. */}
      <div className="pointer-events-none absolute inset-0 z-10 mx-auto flex w-full max-w-[428px] flex-col">
        {/* ─── Top controls ──────────────────────────────────────────────── */}
        <div
          ref={topRef}
          className="flex items-start justify-between gap-2 p-4 pt-[max(1rem,env(safe-area-inset-top))]"
        >
          <RoundButton label={t('Back')} onClick={() => router.back()}>
            <IconChevronLeft size={20} />
          </RoundButton>

          {/* Grouped so `justify-between` puts Back on one edge and this pair on
              the other, rather than spreading three controls evenly. */}
          <div className="flex items-center gap-2">
            {/* Every garage on the map as a list, pulled up over it. The garage
                list itself is Back, or the + in the bar. */}
            <button
              type="button"
              onClick={() => setListOpen(true)}
              aria-haspopup="dialog"
              disabled={vendors.length === 0}
              className="fx-glass fx-press pointer-events-auto flex h-11 items-center gap-1.5 rounded-pill px-[15px] text-t4 font-semibold text-text-primary disabled:opacity-50"
            >
              <IconList size={16} aria-hidden="true" />
              {t('List')}
            </button>

            <RoundButton
              label={t('Centre on my location')}
              onClick={centreOnMe}
              disabled={locating}
            >
              <IconCurrentLocation
                size={18}
                className={cn(locating && 'animate-pulse')}
              />
            </RoundButton>
          </div>
        </div>

        {/* Only once the map has actually been moved a meaningful amount. */}
        {hasMoved && (
          <div className="flex justify-center px-4">
            <button
              type="button"
              onClick={searchThisArea}
              // pointer-events-auto is load-bearing: the chrome column is
              // pointer-events-none so the map stays draggable through it, and
              // without this the button rendered perfectly but every tap fell
              // through to the map underneath.
              //
              // White, not red: the map's one red is the selected garage's
              // pin, and red text on graphite is under AA contrast anyway.
              className="press pointer-events-auto flex min-h-11 items-center gap-1.5 rounded-full bg-brand-white px-4 py-2 text-t4 font-semibold text-brand-black shadow-lg"
            >
              <IconRefresh size={15} aria-hidden="true" />
              {t('Search this area')}
            </button>
          </div>
        )}

        {/* ─── Results ───────────────────────────────────────────────────── */}
        {/* With the Home hub on, Map is a tab of the floating nav, so the
            cards sit above the pill rather than under it. Measured for the
            fit's padding (getPadding), so it is the whole block, nav room
            included. */}
        <div
          ref={resultsRef}
          className="mt-auto flex flex-col gap-2 pb-[max(1rem,env(safe-area-inset-bottom))]"
          style={hub ? { paddingBottom: FLOATING_NAV_CLEARANCE } : undefined}
        >
          {isLoading ? (
            <p className="px-4 text-center text-t5 text-text-secondary">
              {nearby ? t('Finding garages near you…') : t('Looking in this area…')}
            </p>
          ) : vendors.length === 0 ? (
            <div className="fx-glass pointer-events-auto mx-4 flex flex-col items-center rounded-[22px] px-4 py-3 text-center">
              <p className="text-t4 text-text-secondary">{emptyMessage}</p>
              {/* Nothing within reach is not the end: the list has every
                  garage, further away and not yet pinned ones included. */}
              {nearby && bookingType === 'dropin' && (
                <Link
                  href="/garages"
                  className="flex min-h-11 items-center px-3 text-t4 font-semibold text-text-primary underline underline-offset-4"
                >
                  {t('See all garages')}
                </Link>
              )}
            </div>
          ) : (
            <>
              {/* Above the strip: the pull-up list, and where in the strip
                  the chosen card is ("1 of 6"), with a step either way. */}
              <div className="flex items-center justify-between gap-2 px-4">
                <button
                  type="button"
                  onClick={() => setListOpen(true)}
                  aria-haspopup="dialog"
                  className="fx-glass fx-press pointer-events-auto flex h-9 items-center gap-[7px] rounded-pill pl-[9px] pr-[13px] text-t4 font-semibold text-text-primary"
                >
                  <IconChevronUp size={18} aria-hidden="true" />
                  <span>
                    <span className="font-numeric">{vendors.length}</span>{' '}
                    {nearby
                      ? vendors.length === 1
                        ? t('garage near you')
                        : t('garages near you')
                      : vendors.length === 1
                        ? t('garage here')
                        : t('garages here')}
                  </span>
                </button>
                {vendors.length > 1 && (
                  <div className="fx-glass pointer-events-auto flex h-9 items-center gap-0.5 rounded-pill px-[3px] text-t4 font-semibold">
                    <button
                      type="button"
                      aria-label={t('Previous garage')}
                      disabled={selectedIndex <= 0}
                      onClick={() => step(-1)}
                      className="grid size-[30px] place-items-center rounded-full disabled:opacity-30"
                    >
                      <IconChevronLeft size={17} aria-hidden />
                    </button>
                    <span className="min-w-11 text-center" aria-live="polite">
                      {fill(t('{index} of {total}'), {
                        index: <span className="font-numeric">{selectedIndex + 1}</span>,
                        total: <span className="font-numeric">{vendors.length}</span>,
                      })}
                    </span>
                    <button
                      type="button"
                      aria-label={t('Next garage')}
                      disabled={selectedIndex >= vendors.length - 1}
                      onClick={() => step(1)}
                      className="grid size-[30px] place-items-center rounded-full disabled:opacity-30"
                    >
                      <IconChevronRight size={17} aria-hidden />
                    </button>
                  </div>
                )}
              </div>

              <div className="relative">
                <div
                  ref={cardsRef}
                  onScroll={onCardsScroll}
                  // Side padding of half the strip minus half a card, so any
                  // card — the only one included — can reach the centre that
                  // `snap-center` aims at, and the next one peeks in at the
                  // edge. `py-2.5` is not cosmetic: a horizontal scroller clips
                  // vertically too, and the cards' edge light and shadow are
                  // painted outside their boxes.
                  className="pointer-events-auto flex snap-x snap-mandatory gap-3 overflow-x-auto px-[max(1rem,calc(50%-144px))] py-2.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
                >
                  {vendors.map((vendor) => (
                    <MapVendorCard
                      key={vendor.id}
                      vendor={vendor}
                      selected={vendor.id === selectedId}
                      mode={bookingType}
                      onChoose={() => choose(vendor)}
                    />
                  ))}
                </div>
                {/* The strip's edges: a step to the card either side. */}
                {selectedIndex > 0 && (
                  <EdgeButton side="prev" onClick={() => step(-1)} />
                )}
                {selectedIndex < vendors.length - 1 && (
                  <EdgeButton side="next" onClick={() => step(1)} />
                )}
              </div>

              {vendors.length === PAGE_LIMIT && (
                // Saying so beats a silently truncated map, which reads as
                // "this is everything" when it is not.
                <p className="px-4 text-center text-t5 text-text-muted">
                  {nearby ? (
                    <>
                      {fill(t('Showing the nearest {limit}.'), { limit: <span className="font-numeric">{PAGE_LIMIT}</span> })}
                    </>
                  ) : (
                    <>
                      {fill(t('Showing the first {limit} — zoom in to narrow it down.'), { limit: <span className="font-numeric">{PAGE_LIMIT}</span> })}
                    </>
                  )}
                </p>
              )}
            </>
          )}
        </div>
      </div>

      {/* The map bleeds to the viewport edges — insetting it left dark gutters
          that read as a broken border. Only the chrome on top is constrained to
          AppShell's phone width, so controls and cards stay in one column
          instead of being flung to opposite edges on a wide screen. */}
      <div className="absolute inset-0 z-0">
        <Map
          className="h-full w-full"
          styles={MAP_STYLES}
          theme={MAP_THEME}
          center={center}
          zoom={OPENING_ZOOM}
          attributionControl={false}
        >
          <MapController
            onBoundsChange={handleBoundsChange}
            fitBounds={fitTarget}
            fitKey={fitKey}
            fitPadding={getPadding}
            fitMaxZoom={15}
          />

          {/* The route from the customer to the chosen garage, drawn once
              each time one is chosen (Route draw), arcing off the map. */}
          <RouteArc
            from={origin}
            to={(() => {
              const chosen = vendors.find((v) => v.id === selectedId)
              return chosen && hasPin(chosen) ? { lat: chosen.lat, lng: chosen.lng } : null
            })()}
          />

          <GaragePins
            vendors={vendors}
            selectedId={selectedId}
            onSelect={choose}
            // Whenever it is known, not only in nearby mode: after "Search
            // this area" the cards are still sorted by distance from it.
            origin={origin}
            getPadding={getPadding}
            reveal={reveal}
          />
        </Map>
      </div>

      <ScSheet
        open={listOpen}
        onClose={() => setListOpen(false)}
        aria-label={t('Garages on the map')}
        className="fx-glass mx-2 h-[82vh] max-h-[82vh] rounded-b-none rounded-t-[28px] border border-b-0 border-white/14 bg-[rgb(16_16_20/0.82)] pb-0"
      >
        <div className="flex items-center justify-between gap-2.5 px-4 pb-3 pt-1">
          <div>
            <h2 className="text-t2 font-semibold text-text-primary">
              {nearby ? t('Garages near you') : t('Garages here')}
            </h2>
            <p className="text-t4 text-text-secondary">
              <span className="font-numeric">{vendors.length}</span>{' '}
              {origin ? t('nearest first') : t('on the map')}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setListOpen(false)}
            className="fx-glass fx-press flex h-9 items-center gap-1.5 rounded-pill pl-[9px] pr-3 text-t4 font-semibold text-text-primary"
          >
            <IconMap size={16} aria-hidden />
            {t('Map')}
          </button>
        </div>
        <ul className="flex flex-col gap-2 px-2.5 pb-[calc(1.5rem+env(safe-area-inset-bottom))]">
          {vendors.map((vendor) => (
            <li key={vendor.id}>
              <MapListRow
                vendor={vendor}
                selected={vendor.id === selectedId}
                onChoose={() => {
                  choose(vendor)
                  setListOpen(false)
                }}
              />
            </li>
          ))}
        </ul>
      </ScSheet>

      {/* No scrim: nothing scrolls under the pill here, and a dark band
          would only hide the streets. */}
      {hub && <HubNav scrim={false} />}
    </div>
  )
}

function RoundButton({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string
  onClick: () => void
  disabled?: boolean
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className="fx-glass fx-press pointer-events-auto flex size-11 items-center justify-center rounded-full text-text-primary disabled:opacity-50"
    >
      {children}
    </button>
  )
}

/** A step to the card either side, on the strip's edge. */
function EdgeButton({ side, onClick }: { side: 'prev' | 'next'; onClick: () => void }) {
  const t = useT()
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={side === 'prev' ? t('Previous garage') : t('Next garage')}
      className={cn(
        'fx-glass fx-press pointer-events-auto absolute top-[72px] grid size-[38px] place-items-center rounded-full text-text-primary',
        side === 'prev' ? 'left-2.5' : 'right-2.5'
      )}
    >
      {side === 'prev' ? <IconChevronLeft size={18} aria-hidden /> : <IconChevronRight size={18} aria-hidden />}
    </button>
  )
}

/** A row of the pull-up list: photo, name, area, and how far, how long, how much. */
function MapListRow({
  vendor,
  selected,
  onChoose,
}: {
  vendor: Vendor
  selected: boolean
  onChoose: () => void
}) {
  const t = useT()
  const approx = useLocationStore((s) => isApproximate(s.location))
  const km = vendor.distanceKm
  return (
    <button
      type="button"
      onClick={onChoose}
      aria-current={selected ? 'true' : undefined}
      className={cn(
        'grid w-full grid-cols-[64px_minmax(0,1fr)_auto] items-center gap-3 rounded-[18px] border p-2 text-left transition-colors',
        selected ? 'border-white/30 bg-white/9' : 'border-white/7 bg-white/5 hover:bg-white/9'
      )}
    >
      <span className="relative size-16 overflow-hidden rounded-[13px] bg-surface">
        {vendor.photos[0] ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={vendor.photos[0]} alt="" className="size-full object-cover" />
        ) : (
          <GarageCover vendor={vendor} size="compact" showMeta={false} />
        )}
      </span>
      <span className="min-w-0">
        <span className="block truncate text-t3 font-semibold text-text-primary">{vendor.name}</span>
        <span className="mt-0.5 block truncate text-t4 text-text-secondary">
          {[vendor.area, hasStarScore(vendor) ? `★ ${vendor.rating.toFixed(1)}` : t(NEW_GARAGE_LABEL)]
            .filter(Boolean)
            .join(' · ')}
        </span>
      </span>
      <span className="flex flex-col items-end gap-0.5">
        {km !== null && (
          <>
            <span className="whitespace-nowrap font-numeric text-[16px] font-semibold text-text-primary">
              {distanceLabel(km, approx)}
            </span>
            <span className="whitespace-nowrap text-t5 text-text-secondary">{driveTimeLabel(km)}</span>
          </>
        )}
        {vendor.startingPrice > 0 && (
          <span className="font-numeric text-t4 font-semibold text-[#E8E8EC]">₹{vendor.startingPrice}</span>
        )}
      </span>
    </button>
  )
}

/**
 * A result card, carrying the facts someone actually chooses on.
 *
 * The first version showed a name and a price, which is not enough to pick
 * between two garages — the reference here is Airbnb's map card, which leads
 * with the photo and then answers rating, what it is, and what it costs in one
 * glance. The equivalents for a garage are what it does (service tags), whether
 * it is open, how far it is, and whether it comes to you.
 */
function MapVendorCard({
  vendor,
  selected,
  mode,
  onChoose,
}: {
  vendor: Vendor
  selected: boolean
  /** The mode home handed the map, passed on so checkout opens on it too. */
  mode: BookingType
  /** Makes this the chosen garage: its card centred, its pin red. */
  onChoose: () => void
}) {
  const t = useT()
  const modeParam = bookingTypeParam(mode)
  const queryClient = useQueryClient()
  // "6.2 km · ~20 min" (0062), "~" before the km when measured from an area.
  const approx = useLocationStore((s) => isApproximate(s.location))
  const distance =
    vendor.distanceKm !== null ? distanceAndDrive(vendor.distanceKm, approx) : null
  // Whether it comes to you: on a Pickup & drop map every garage collects,
  // so that is the badge; otherwise Doorstep, as before.
  const badge =
    mode === 'pickup'
      ? t(BOOKING_TYPE_LABELS.pickup)
      : vendor.doorstepEnabled
        ? t(BOOKING_TYPE_LABELS.doorstep)
        : null

  return (
    <Link
      href={
        modeParam
          ? `/garage/${vendor.id}?mode=${modeParam}`
          : `/garage/${vendor.id}`
      }
      data-vendor-id={vendor.id}
      aria-current={selected ? 'true' : undefined}
      // The garage page starts loading the moment a finger lands on its card.
      onPointerDown={() => void prefetchGarage(queryClient, vendor.id)}
      // A tap on a card at the side of the strip picks it first, so its pin
      // can be found on the map before committing to the garage; a tap on
      // the chosen card opens the garage. A modified click (new tab) always
      // follows the link.
      onClick={(e) => {
        if (selected || e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0)
          return
        e.preventDefault()
        onChoose()
      }}
      className={cn(
        'fx-glass flex w-[min(78vw,288px)] shrink-0 snap-center flex-col rounded-[24px] p-[7px] transition-[transform,opacity,border-color] duration-[400ms] ease-[cubic-bezier(.2,.8,.2,1)] motion-reduce:transition-none',
        // The chosen card full size and lit at its edge; its pin carries
        // the red. The others step back a little, so the next one peeks.
        selected ? 'border-white/34 opacity-100' : 'scale-[0.93] opacity-[0.66]'
      )}
    >
      <div className="relative h-[124px] w-full overflow-hidden rounded-[18px] bg-surface">
        {vendor.photos[0] ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={vendor.photos[0]}
            alt=""
            className="h-full w-full object-cover"
          />
        ) : (
          // No photo: its designed cover, as on its list card. The open
          // status and badge own the top corners, so no small-caps line.
          <GarageCover vendor={vendor} size="compact" showMeta={false} />
        )}

        {/* Whether they are taking work right now is the first thing that makes
            a card actionable or not, so it sits on the photo rather than
            competing with the details below. Read from the garage's hours;
            nothing shows when the list did not carry them. */}
        <OpenStatus
          hours={vendor.openingHours}
          closures={vendor.closures}
          variant="overlay"
          className={cn(
            'absolute left-2 top-2',
            badge ? 'max-w-[calc(100%-7.5rem)]' : 'max-w-[calc(100%-1rem)]'
          )}
        />

        {badge && (
          <span className="fx-glass absolute right-2 top-2 rounded-full px-2 py-0.5 text-t5 font-semibold text-text-primary">
            {badge}
          </span>
        )}
        <span aria-hidden="true" className="fx-pearl absolute bottom-2 right-2 grid size-9 place-items-center rounded-full">
          <IconArrowUpRight size={18} />
        </span>
      </div>

      <div className="flex flex-col gap-1 px-2 pb-1 pt-2.5">
        <div className="flex items-start justify-between gap-2">
          <p className="min-w-0 flex-1 truncate text-t2 font-semibold text-text-primary">
            {vendor.name}
          </p>
          {hasStarScore(vendor) ? (
            <span className="flex shrink-0 items-center gap-1 pt-1 text-t5">
              <IconStarFilled size={11} className="text-warning" />
              <span className="font-numeric font-semibold text-text-primary">
                {vendor.rating.toFixed(1)}
              </span>
              <span className="text-text-secondary">
                ({vendor.reviewCount})
              </span>
            </span>
          ) : (
            <span className="shrink-0 pt-1 text-t5 font-medium text-text-primary">
              {t(NEW_GARAGE_LABEL)}
            </span>
          )}
        </div>

        {vendor.serviceTags.length > 0 && (
          // The list's own category names, never the raw codes (F10).
          <p className="truncate text-t4 text-text-secondary">
            {vendor.serviceTags.map(categoryLabel).join(' · ')}
          </p>
        )}

        {/* A garage in another town (the strip can hold one in nearby and
            "this area" modes) carries the sign in place of its town, which
            the sign already names. */}
        {vendor.outsideServiceCity ? (
          <p className="flex min-w-0 items-center gap-1.5 text-t5 text-text-secondary">
            <OutsideCityChip
              outside={vendor.outsideServiceCity}
              className="min-w-0 bg-surface"
            />
            {distance && (
              <span className="shrink-0 font-numeric">{distance}</span>
            )}
          </p>
        ) : (
          <p className="truncate text-t5 text-text-secondary">
            <Figures
              text={[vendor.area, distance]
                .filter(Boolean)
                .join(' · ')}
            />
          </p>
        )}

        {vendor.startingPrice > 0 && (
          <p className="mt-0.5 text-t4 text-text-secondary">
            {fill(t('{price} onwards'), { price: <span className="font-numeric text-[17px] font-semibold text-text-primary">
              ₹{vendor.startingPrice}
            </span> })}
          </p>
        )}
      </div>
    </Link>
  )
}

export default function MapBrowsePage() {
  return (
    <Suspense>
      <MapBrowseContent />
    </Suspense>
  )
}
