'use client'

import { Suspense, useCallback, useMemo, useRef, useState } from 'react'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import {
  IconChevronLeft,
  IconCurrentLocation,
  IconList,
  IconPhoto,
  IconRefresh,
  IconStarFilled,
} from '@tabler/icons-react'
import { useVendorSearch } from '@repo/core/api/hooks/use-vendors'
import { coarse, isCitywide, useLocationStore } from '@repo/core/stores/location-store'
import { boundsToParam, type MapBounds } from '@repo/ui/features/map-controller'
import { FLOATING_NAV_CLEARANCE } from '@repo/ui/sc/app-shell'
import { Figures } from '@repo/ui/sc/figures'
import {
  DEFAULT_CENTER,
  MAP_STYLES,
  MAP_THEME,
  formatDistance,
  straightLineKm,
} from '@repo/core/map'
import { cn } from '@repo/core/utils'
import { bookingTypeParam } from '@repo/core/booking-types'
import type { BookingType, Vendor } from '@repo/core/types'
import { OpenStatus } from '@/components/open-status'
import { HubNav } from '@/components/home/hub-nav'
import { isHomeHubEnabled } from '@/lib/home-hub'
import { fitPadding, framingBounds, type FitPadding } from '@/lib/map-view'

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

const PAGE_LIMIT = 50

/**
 * City mode's reach from DEFAULT_CENTER: the same 50 km as the list's radius
 * from a customer (LIST_RADIUS_KM in the server's lib/discovery.ts), so a
 * customer with no location sees what one standing in the centre would.
 */
const CITY_RADIUS_KM = 50
const CITY_CENTRE = { lat: DEFAULT_CENTER[1], lng: DEFAULT_CENTER[0] }

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
    Math.abs((live.minLng + live.maxLng) / 2 - (searched.minLng + searched.maxLng) / 2) /
    width
  const centreShiftY =
    Math.abs((live.minLat + live.maxLat) / 2 - (searched.minLat + searched.maxLat) / 2) /
    height
  const zoomChange = Math.abs(Math.abs(live.maxLng - live.minLng) / width - 1)

  // A quarter-screen pan, or a ~35% change in how much ground is visible.
  return centreShiftX > 0.25 || centreShiftY > 0.25 || zoomChange > 0.35
}

function hasPin(vendor: Vendor): vendor is Vendor & { lat: number; lng: number } {
  return vendor.lat !== null && vendor.lng !== null
}

function MapBrowseContent() {
  const router = useRouter()
  // Read at build time (lib/home-hub.ts): the hub's floating nav, or none as
  // before.
  const hub = isHomeHubEnabled()
  const searchParams = useSearchParams()
  const location = useLocationStore((s) => s.location)
  const requestGpsLocation = useLocationStore((s) => s.requestGpsLocation)
  const locating = useLocationStore((s) => s.locating)

  const bookingType =
    searchParams.get('bookingType') === 'doorstep' ? 'doorstep' : 'dropin'
  const category = searchParams.get('category') ?? undefined

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
  const rootRef = useRef<HTMLDivElement>(null)
  const topRef = useRef<HTMLDivElement>(null)
  const resultsRef = useRef<HTMLDivElement>(null)
  const cardsRef = useRef<HTMLDivElement>(null)
  /** Suppresses the scroll→select feedback loop while we scroll programmatically. */
  const scrollingProgrammatically = useRef(false)

  const nearby = origin !== undefined && areaBounds === null
  const city = !hasOrigin && areaBounds === null

  const { vendors: found, radiusKm, isLoading } = useVendorSearch(
    {
      bookingType,
      category,
      // Nearby sends no viewport, so the server applies the list's 50 km
      // (doorstep: each garage's own reach) from the customer.
      // City mode sends neither: every pinned garage comes back, and the ones
      // within reach of the centre are picked below.
      bbox: areaBounds ? boundsToParam(areaBounds) : undefined,
      lat: origin?.lat,
      lng: origin?.lng,
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
    node.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' })
    window.setTimeout(() => {
      scrollingProgrammatically.current = false
    }, 500)
  }, [])

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
    const top = topRef.current ? topRef.current.getBoundingClientRect().bottom - root.top : 0
    const bottom = resultsRef.current
      ? root.bottom - resultsRef.current.getBoundingClientRect().top
      : 0
    return fitPadding({ width: root.width, height: root.height }, { top, bottom })
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
      pins.length > 0 ? framingBounds([origin, ...pins], 3) : framingBounds([origin], 12)
  } else if (!isLoading && city && pins.length > 0) {
    fitKey = 'city'
    fitTarget = framingBounds(pins, 3)
  }

  const center: [number, number] = location
    ? [location.lng, location.lat]
    : DEFAULT_CENTER

  const emptyMessage =
    bookingType === 'doorstep' ? (
      'No garages travel to this area yet.'
    ) : nearby && radiusKm !== null ? (
      <>
        No garages within <span className="font-numeric">{radiusKm}</span> km of you yet.
      </>
    ) : (
      'No garages in this area. Try zooming out or moving the map.'
    )

  return (
    <div ref={rootRef} className="fixed inset-0 bg-surface">
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
          <RoundButton label="Back" onClick={() => router.back()}>
            <IconChevronLeft size={20} />
          </RoundButton>

          {/* Grouped so `justify-between` puts Back on one edge and this pair on
              the other, rather than spreading three controls evenly. */}
          <div className="flex items-center gap-2">
            <Link
              href="/garages"
              className="press pointer-events-auto flex items-center gap-1.5 rounded-full bg-surface-elevated px-3.5 py-2 text-[13px] font-semibold text-text-primary shadow-lg ring-1 ring-border"
            >
              <IconList size={15} />
              List
            </Link>

            <RoundButton
              label="Centre on my location"
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
              className="press pointer-events-auto flex items-center gap-1.5 rounded-full bg-brand-white px-4 py-2 text-[13px] font-semibold text-brand-black shadow-lg"
            >
              <IconRefresh size={15} />
              Search this area
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
            <p className="px-4 text-center text-[12px] text-text-secondary">
              {nearby ? 'Finding garages near you…' : 'Looking in this area…'}
            </p>
          ) : vendors.length === 0 ? (
            <div className="pointer-events-auto mx-4 flex flex-col items-center rounded-[14px] bg-surface-elevated px-4 py-3 text-center shadow-lg ring-1 ring-border">
              <p className="text-[13px] text-text-secondary">{emptyMessage}</p>
              {/* Nothing within reach is not the end: the list has every
                  garage, further away and not yet pinned ones included. */}
              {nearby && bookingType === 'dropin' && (
                <Link
                  href="/garages"
                  className="flex min-h-11 items-center px-3 text-[13px] font-semibold text-text-primary underline underline-offset-4"
                >
                  See all garages
                </Link>
              )}
            </div>
          ) : (
            <>
              <div
                ref={cardsRef}
                onScroll={onCardsScroll}
                // Side padding of half the strip minus half a card, so any card
                // — including the only one — can actually reach the centre that
                // `snap-center` is aiming at. Plain `px-4` pins the first card
                // to the left edge and leaves a lone result looking off-centre.
                // `py-2` is not cosmetic. Setting `overflow-x` to anything but
                // `visible` makes the computed `overflow-y` `auto` too, so this
                // container clips vertically — and a card's `ring-1`/`shadow-xl`
                // are painted OUTSIDE its border box. Without the vertical
                // padding the ring is shaved off along the top edge.
                className="pointer-events-auto flex snap-x snap-mandatory gap-3 overflow-x-auto px-[max(1rem,calc(50%-150px))] py-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
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

              {vendors.length === PAGE_LIMIT && (
                // Saying so beats a silently truncated map, which reads as
                // "this is everything" when it is not.
                <p className="px-4 text-center text-[11px] text-text-muted">
                  {nearby ? (
                    <>
                      Showing the nearest <span className="font-numeric">{PAGE_LIMIT}</span>.
                    </>
                  ) : (
                    <>
                      Showing the first <span className="font-numeric">{PAGE_LIMIT}</span> — zoom
                      in to narrow it down.
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
      className="press pointer-events-auto flex h-10 w-10 items-center justify-center rounded-full bg-surface-elevated text-text-primary shadow-lg ring-1 ring-border disabled:opacity-50"
    >
      {children}
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
  const modeParam = bookingTypeParam(mode)

  return (
    <Link
      href={
        modeParam
          ? `/garage/${vendor.id}?mode=${modeParam}`
          : `/garage/${vendor.id}`
      }
      data-vendor-id={vendor.id}
      aria-current={selected ? 'true' : undefined}
      // A tap on a card at the side of the strip picks it first, so its pin
      // can be found on the map before committing to the garage; a tap on
      // the chosen card opens the garage. A modified click (new tab) always
      // follows the link.
      onClick={(e) => {
        if (selected || e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return
        e.preventDefault()
        onChoose()
      }}
      className={cn(
        'flex w-[78vw] max-w-[300px] shrink-0 snap-center flex-col overflow-hidden rounded-[16px] bg-surface-elevated shadow-xl ring-1 transition-colors',
        // The selected card is outlined in white; its pin carries the red.
        selected ? 'ring-text-primary/60' : 'ring-border'
      )}
    >
      <div className="relative h-[112px] w-full bg-surface">
        {vendor.photos[0] ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={vendor.photos[0]}
            alt=""
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <IconPhoto size={22} className="text-text-muted" />
          </div>
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
            vendor.doorstepEnabled ? 'max-w-[calc(100%-6rem)]' : 'max-w-[calc(100%-1rem)]'
          )}
        />

        {vendor.doorstepEnabled && (
          <span className="absolute right-2 top-2 rounded-full bg-surface-elevated/90 px-2 py-0.5 text-[10px] font-semibold text-text-primary ring-1 ring-border">
            Doorstep
          </span>
        )}
      </div>

      <div className="flex flex-col gap-1 p-3">
        <div className="flex items-start justify-between gap-2">
          <p className="min-w-0 flex-1 truncate text-[14px] font-semibold text-text-primary">
            {vendor.name}
          </p>
          {vendor.reviewCount > 0 ? (
            <span className="flex shrink-0 items-center gap-1 text-[12px]">
              <IconStarFilled size={11} className="text-warning" />
              <span className="font-numeric font-medium text-text-primary">
                {vendor.rating.toFixed(1)}
              </span>
              <span className="text-text-secondary">({vendor.reviewCount})</span>
            </span>
          ) : (
            <span className="shrink-0 text-[12px] font-medium text-text-primary">
              New
            </span>
          )}
        </div>

        {vendor.serviceTags.length > 0 && (
          <p className="truncate text-[12px] text-text-secondary">
            {vendor.serviceTags.join(' · ')}
          </p>
        )}

        <p className="truncate text-[12px] text-text-secondary">
          <Figures
            text={[
              vendor.area,
              vendor.distanceKm !== null ? formatDistance(vendor.distanceKm) : null,
            ]
              .filter(Boolean)
              .join(' · ')}
          />
        </p>

        {vendor.startingPrice > 0 && (
          <p className="mt-0.5 text-[13px] text-text-secondary">
            <span className="font-numeric font-bold text-text-primary">
              ₹{vendor.startingPrice}
            </span>{' '}
            onwards
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
