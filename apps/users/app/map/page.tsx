'use client'

import { Suspense, useCallback, useEffect, useRef, useState } from 'react'
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
import { track } from '@repo/core/analytics'
import { coarse, useLocationStore } from '@repo/core/stores/location-store'
// From map-bounds, not map-controller: the controller imports the map and so
// MapLibre, which a static import here put in the page's first load.
import { boundsToParam, type MapBounds } from '@repo/ui/features/map-bounds'
import { FLOATING_NAV_CLEARANCE } from '@repo/ui/sc/app-shell'
import { Figures } from '@repo/ui/sc/figures'
import { DEFAULT_CENTER, MAP_STYLES, MAP_THEME, formatDistance } from '@repo/core/map'
import { cn } from '@repo/core/utils'
import { BOOKING_TYPE_LABELS, bookingTypeParam, parseBookingType } from '@repo/core/booking-types'
import type { BookingType, Vendor } from '@repo/core/types'
import { OpenStatus } from '@/components/open-status'
import { HubNav } from '@/components/home/hub-nav'
import { isHomeHubEnabled } from '@/lib/home-hub'

/**
 * Airbnb-style map browse: the map is the filter.
 *
 * Panning changes the *query*, not just the view — results are whatever is
 * inside the viewport rectangle. That is a bounding-box query rather than a
 * radius one, which is why `bbox` went into the listing API up front
 * (plans/geo.md §8) even though this screen came last.
 *
 * The two-way binding between markers and cards is the whole interaction:
 * tapping a marker brings its card up, swiping the cards moves the map. Either
 * one alone would be a map with a list stapled underneath it.
 */

// maplibre-gl is ~200KB gzipped plus WebGL; it loads only on this route and the
// picker, never in the listing bundle.
const Map = dynamic(() => import('@repo/ui/sc/map').then((m) => m.Map), {
  ssr: false,
  loading: () => <div className="h-full w-full animate-pulse bg-surface" />,
})
const MapMarker = dynamic(
  () => import('@repo/ui/sc/map').then((m) => m.MapMarker),
  { ssr: false }
)
const MarkerContent = dynamic(
  () => import('@repo/ui/sc/map').then((m) => m.MarkerContent),
  { ssr: false }
)
const MapController = dynamic(
  () => import('@repo/ui/features/map-controller').then((m) => m.MapController),
  { ssr: false }
)

const PAGE_LIMIT = 50

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

function MapBrowseContent() {
  const router = useRouter()
  // Read at build time (lib/home-hub.ts): the hub's floating nav, or none as
  // before.
  const hub = isHomeHubEnabled()
  const searchParams = useSearchParams()
  const location = useLocationStore((s) => s.location)
  const requestGpsLocation = useLocationStore((s) => s.requestGpsLocation)
  const locating = useLocationStore((s) => s.locating)

  const bookingType = parseBookingType(searchParams.get('bookingType')) ?? 'dropin'
  const category = searchParams.get('category') ?? undefined

  useEffect(() => {
    track('map_view', { mode: bookingType })
  }, [bookingType])

  /** The viewport the current results were fetched for. */
  const [searchedBounds, setSearchedBounds] = useState<MapBounds | null>(null)
  /** Where the map is now, which may have drifted from the above. */
  const [liveBounds, setLiveBounds] = useState<MapBounds | null>(null)
  /**
   * The explicit choice, if one has been made. The effective selection is
   * derived below — storing it outright would need an effect to re-sync every
   * time the result set changes under it, and that effect would fight the
   * scroll handler for who owns the value.
   */
  const [chosenId, setChosenId] = useState<string | null>(null)
  /** Set when the map should recentre — a selection, or a fresh GPS fix. */
  const [flyTo, setFlyTo] = useState<{ lat: number; lng: number } | null>(null)
  const cardsRef = useRef<HTMLDivElement>(null)
  /** Suppresses the scroll→select feedback loop while we scroll programmatically. */
  const scrollingProgrammatically = useRef(false)

  const origin = location ? coarse(location) : undefined

  const { vendors, isLoading } = useVendorSearch(
    {
      bookingType,
      category,
      bbox: searchedBounds ? boundsToParam(searchedBounds) : undefined,
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
    { enabled: searchedBounds !== null }
  )

  const handleBoundsChange = useCallback((bounds: MapBounds) => {
    setLiveBounds(bounds)
    // First settle after load: search straight away rather than making someone
    // press "Search this area" for a map they have not touched.
    setSearchedBounds((current) => current ?? bounds)
  }, [])

  const hasMoved = hasMovedMeaningfully(liveBounds, searchedBounds)

  const searchThisArea = () => {
    if (liveBounds) setSearchedBounds(liveBounds)
  }

  /**
   * Recentre on the customer.
   *
   * Updating the location store alone moved nothing: the store feeds the
   * distance sort, but the map's centre is a construction option MapLibre reads
   * once. The map has to be told to fly, and the results have to be re-queried,
   * or you land somewhere new still looking at the previous area's garages.
   */
  const centreOnMe = async () => {
    const fix = await requestGpsLocation()
    if (!fix) return

    setFlyTo({ lat: fix.lat, lng: fix.lng })
    // The bounds this produces arrive via onBoundsChange; clearing the searched
    // bounds makes the next settle re-search rather than leaving stale pins on
    // a map that has moved somewhere else entirely.
    setSearchedBounds(null)
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

  /** Tapping a marker: bring its card up and centre the map on it. */
  const selectFromMap = (vendor: Vendor) => {
    setChosenId(vendor.id)
    scrollCardIntoView(vendor.id)
    if (vendor.lat !== null && vendor.lng !== null) {
      setFlyTo({ lat: vendor.lat, lng: vendor.lng })
    }
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

  const center: [number, number] = location
    ? [location.lng, location.lat]
    : DEFAULT_CENTER

  const emptyMessage =
    bookingType === 'pickup'
      ? 'No garages pick up near you yet — try At garage or Doorstep.'
      : bookingType === 'doorstep'
        ? 'No garages travel to this area yet.'
        : 'No garages in this area. Try zooming out or moving the map.'

  return (
    <div className="fixed inset-0 bg-surface">
      {/* The map bleeds to the viewport edges — insetting it left dark gutters
          that read as a broken border. Only the chrome on top is constrained to
          AppShell's phone width, so controls and cards stay in one column
          instead of being flung to opposite edges on a wide screen. */}
      <div className="absolute inset-0">
        <Map
          className="h-full w-full"
          styles={MAP_STYLES}
          theme={MAP_THEME}
          center={center}
          zoom={13}
          attributionControl={false}
        >
          <MapController onBoundsChange={handleBoundsChange} flyTo={flyTo} />

          {vendors.map((vendor) => (
            <VendorPin
              key={vendor.id}
              vendor={vendor}
              selected={vendor.id === selectedId}
              onSelect={() => selectFromMap(vendor)}
            />
          ))}
        </Map>

      </div>

      {/* Chrome column: phone-width, centred, transparent to pointer events
          except where a control actually sits. */}
      <div className="pointer-events-none absolute inset-0 mx-auto flex w-full max-w-[428px] flex-col">
        {/* ─── Top controls ──────────────────────────────────────────────── */}
        <div className="flex items-start justify-between gap-2 p-4 pt-[max(1rem,env(safe-area-inset-top))]">
          <RoundButton label="Back" onClick={() => router.back()}>
            <IconChevronLeft size={20} />
          </RoundButton>

          {/* Grouped so `justify-between` puts Back on one edge and this pair on
              the other, rather than spreading three controls evenly. */}
          <div className="flex items-center gap-2">
            {/* Back to the list in the same mode the map was opened in. */}
            <Link
              href={bookingTypeParam(bookingType) ? `/garages?mode=${bookingTypeParam(bookingType)}` : '/garages'}
              className="press pointer-events-auto flex min-h-11 items-center gap-1.5 rounded-full bg-surface-elevated px-3.5 py-2 text-[13px] font-semibold text-text-primary shadow-lg ring-1 ring-border"
            >
              <IconList size={15} aria-hidden="true" />
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
              className="press pointer-events-auto flex min-h-11 items-center gap-1.5 rounded-full bg-brand-white px-4 py-2 text-[13px] font-semibold text-brand-black shadow-lg"
            >
              <IconRefresh size={15} aria-hidden="true" />
              Search this area
            </button>
          </div>
        )}

        {/* ─── Results ───────────────────────────────────────────────────── */}
        {/* With the Home hub on, Map is a tab of the floating nav, so the
            cards sit above the pill rather than under it. */}
        <div
          className="mt-auto flex flex-col gap-2 pb-[max(1rem,env(safe-area-inset-bottom))]"
          style={hub ? { paddingBottom: FLOATING_NAV_CLEARANCE } : undefined}
        >
          {isLoading ? (
            <p className="px-4 text-center text-[12px] text-text-secondary">
              Looking in this area…
            </p>
          ) : vendors.length === 0 ? (
            <div className="pointer-events-auto mx-4 rounded-[14px] bg-surface-elevated px-4 py-3 text-center shadow-lg ring-1 ring-border">
              <p className="text-[13px] text-text-secondary">{emptyMessage}</p>
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
                  />
                ))}
              </div>

              {vendors.length === PAGE_LIMIT && (
                // Saying so beats a silently truncated map, which reads as
                // "this is everything" when it is not.
                <p className="px-4 text-center text-[11px] text-text-muted">
                  Showing the first {PAGE_LIMIT} — zoom in to narrow it down.
                </p>
              )}
            </>
          )}
        </div>
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
      className="press pointer-events-auto flex size-11 items-center justify-center rounded-full bg-surface-elevated text-text-primary shadow-lg ring-1 ring-border disabled:opacity-50"
    >
      {children}
    </button>
  )
}

/** A price pill, the way a map-first marketplace marks a result. */
function VendorPin({
  vendor,
  selected,
  onSelect,
}: {
  vendor: Vendor
  selected: boolean
  onSelect: () => void
}) {
  // Vendors without coordinates never reach a bbox query, but the list type
  // allows null so the guard keeps this component total.
  if (vendor.lat === null || vendor.lng === null) return null

  return (
    <MapMarker latitude={vendor.lat} longitude={vendor.lng} onClick={onSelect}>
      <MarkerContent>
        <span
          className={cn(
            // Garages with no priced service fall back to their name, capped
            // and ellipsised — a hard character slice cut them mid-word.
            'block max-w-[140px] truncate rounded-full px-2.5 py-1 text-[12px] font-semibold shadow-md ring-1 transition-all',
            // A price pin is a figure, in the brand's numeric face.
            vendor.startingPrice > 0 && 'font-numeric font-bold',
            selected
              ? 'scale-110 bg-brand-red text-brand-white ring-brand-red'
              : 'bg-surface-elevated text-text-primary ring-border'
          )}
        >
          {vendor.startingPrice > 0 ? `₹${vendor.startingPrice}` : vendor.name}
        </span>
      </MarkerContent>
    </MapMarker>
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
}: {
  vendor: Vendor
  selected: boolean
  /** The mode home handed the map, passed on so checkout opens on it too. */
  mode: BookingType
}) {
  const modeParam = bookingTypeParam(mode)
  // Whether it comes to you: on a Pickup & drop map every garage collects,
  // so that is the badge; otherwise Doorstep, as before.
  const badge =
    mode === 'pickup'
      ? BOOKING_TYPE_LABELS.pickup
      : vendor.doorstepEnabled
        ? BOOKING_TYPE_LABELS.doorstep
        : null

  return (
    <Link
      href={
        modeParam
          ? `/garage/${vendor.id}?mode=${modeParam}`
          : `/garage/${vendor.id}`
      }
      data-vendor-id={vendor.id}
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
            badge ? 'max-w-[calc(100%-7.5rem)]' : 'max-w-[calc(100%-1rem)]'
          )}
        />

        {badge && (
          <span className="absolute right-2 top-2 rounded-full bg-surface-elevated/90 px-2 py-0.5 text-[11px] font-semibold text-text-primary ring-1 ring-border">
            {badge}
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
