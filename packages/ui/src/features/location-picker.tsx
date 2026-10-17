'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import dynamic from 'next/dynamic'
import {
  IconCurrentLocation,
  IconLoader2,
  IconMapPin,
  IconSearch,
} from '@tabler/icons-react'
import { ScButton } from '@repo/ui/sc/button'
import {
  createGeoSessionToken,
  parseCoordinatePair,
  resolveMapsLink,
  resolvePlace,
  reverseGeocode,
  searchPlaces,
  type GeoPlace,
  type MapsLinkWarning,
} from '@repo/core/api/geo'
import { DEFAULT_CENTER, MAP_STYLES, MAP_THEME, PICKER_ZOOM } from '@repo/core/map'
import { cn } from '@repo/core/utils'

/**
 * Pick a precise location: search to get close, then drag the pin to get it
 * right, then reverse-geocode the final pin for the address text.
 *
 * Search-only and GPS-only were both considered and rejected (see plans/geo.md
 * §4). The deciding argument is not accuracy in the abstract — it is that both
 * of them fail *silently*. Small independent garages are frequently absent from
 * every POI dataset, so a search lands on the main road rather than the lane;
 * and owners often onboard from home, so GPS is not even available. Showing the
 * result on a map is what makes a wrong answer visible, and a garage coordinate
 * is entered once and then poisons every distance sort forever if it is wrong.
 */

// maplibre-gl is ~200KB gzipped and pulls in WebGL. It has no business in the
// bundle of a listing page that shows no map, so the whole map subtree is
// loaded on demand.
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
// Taps and recentring both need the live MapLibre instance, which mapcn exposes
// through context rather than through props on <Map>.
const MapController = dynamic(
  () => import('./map-controller').then((m) => m.MapController),
  { ssr: false }
)

export interface PickedLocation {
  lat: number
  lng: number
  /** Formatted address from the provider. The caller may let the user edit it. */
  address: string
  city: string
  pincode: string
  /** How the coordinates were arrived at, for the server's `geoSource`. */
  source: 'gps' | 'map_pin'
}

interface LocationPickerProps {
  /** Existing pin to open on, when editing rather than setting for the first time. */
  value?: { lat: number; lng: number } | null
  onChange: (picked: PickedLocation) => void
  /** Hide the search box for flows where the user is already at the address. */
  showSearch?: boolean
  /**
   * The city the form already has. Used only to warn when a pasted link lands
   * somewhere else entirely — one of our vendors pasted a link to a garage
   * 450 km away, which nothing else would have caught.
   */
  expectedCity?: string
  className?: string
}

const DEBOUNCE_MS = 300
const MIN_QUERY_LENGTH = 3

const LINK_WARNINGS: Record<MapsLinkWarning, string> = {
  place_share_link:
    'That looks like a Google place-share link, which carries no location. We placed the pin from its address — check it before saving.',
  directions_link:
    'That was a directions link, so we used its destination. Check the pin before saving.',
  no_location_found:
    'Could not read a location from that link. Search above, or drop the pin by hand.',
  unreachable:
    'Could not open that link. Search above, or drop the pin by hand.',
}

export function LocationPicker({
  value,
  onChange,
  showSearch = true,
  expectedCity,
  className,
}: LocationPickerProps) {
  const [pin, setPin] = useState<{ lat: number; lng: number } | null>(
    value ?? null
  )
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<GeoPlace[]>([])
  const [searching, setSearching] = useState(false)
  const [resolving, setResolving] = useState(false)
  const [locating, setLocating] = useState(false)
  const [address, setAddress] = useState<string | null>(null)
  /** The suggestion text currently sitting in the input, if one was picked. */
  const [committedLabel, setCommittedLabel] = useState<string | null>(null)
  const [linkInput, setLinkInput] = useState('')
  const [linkBusy, setLinkBusy] = useState(false)
  /**
   * Non-blocking by design. A vendor who pastes the wrong kind of link should be
   * told what happened and left to carry on, not stopped — the map is right
   * there and dropping a pin by hand always works.
   */
  const [linkNotice, setLinkNotice] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  /**
   * Where the map should recentre to, and nothing else. Set by search and by
   * "use my current location"; deliberately NOT set by a drag — flying the map
   * to a pin the user just dragged would yank the ground out from under them.
   */
  const [flyTo, setFlyTo] = useState<{ lat: number; lng: number } | null>(null)

  // One token per picker session, so a provider that prices by session bills
  // this whole interaction once rather than once per keystroke.
  const sessionToken = useMemo(() => createGeoSessionToken(), [])

  // Guards against a slow earlier request overwriting a newer one's results.
  const requestSeq = useRef(0)
  const searchBoxRef = useRef<HTMLDivElement>(null)


  const center: [number, number] = pin ? [pin.lng, pin.lat] : DEFAULT_CENTER

  /**
   * Moves the pin and looks up what is there. The reverse call is what fills
   * the address fields, so it runs on every placement — including a drag, since
   * dragging 200 m down the road can change the pincode.
   */
  const placePin = useCallback(
    async (lat: number, lng: number, source: 'gps' | 'map_pin') => {
      setPin({ lat, lng })
      setError(null)
      setResolving(true)

      try {
        const place = await reverseGeocode(lat, lng)
        setAddress(place?.formatted ?? null)
        onChange({
          lat,
          lng,
          address: place?.formatted ?? '',
          city: place?.city ?? '',
          pincode: place?.pincode ?? '',
          source,
        })
      } catch {
        // The pin is the thing that matters and we already have it. A failed
        // lookup costs the prefilled address text, not the coordinates, so the
        // caller still gets a usable result and the user can type the rest.
        setAddress(null)
        setError('Could not look up that address — you can type it below.')
        onChange({ lat, lng, address: '', city: '', pincode: '', source })
      } finally {
        setResolving(false)
      }
    },
    [onChange]
  )

  const trimmedQuery = query.trim()
  const queryIsSearchable = trimmedQuery.length >= MIN_QUERY_LENGTH

  // Whether the dropdown shows is derived, not stored: a query falling below
  // the minimum simply stops rendering its stale results, rather than needing
  // an effect to clear them.
  //
  // `committedLabel` is what closes it after a pick. Selecting a suggestion
  // writes its label into the input, and that write is indistinguishable from
  // typing — so the search effect below would fire for the chosen text, refill
  // `results`, and pop the dropdown straight back open over a location the user
  // had already settled on.
  const showResults =
    queryIsSearchable && results.length > 0 && trimmedQuery !== committedLabel

  // The dropdown floats over the map, so leaving it open while the user reaches
  // past it to drop a pin means their first tap lands on a suggestion instead.
  // Dismiss on any pointer outside it, and on Escape.
  useEffect(() => {
    if (!showResults) return

    const onPointerDown = (event: PointerEvent) => {
      if (!searchBoxRef.current?.contains(event.target as Node)) {
        setResults([])
      }
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setResults([])
    }

    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [showResults])

  // Debounced search. Below MIN_QUERY_LENGTH we do not call at all — short
  // prefixes match everything, so they cost a request and return noise.
  useEffect(() => {
    if (!queryIsSearchable) return
    // Nothing to look up for text we just wrote ourselves. Skipping the request
    // outright, rather than only hiding its results, also saves a provider call
    // per selection.
    if (trimmedQuery === committedLabel) return

    const seq = ++requestSeq.current

    const timer = setTimeout(async () => {
      // Set once the debounce has actually elapsed rather than on every
      // keystroke, so a fast typist never sees the spinner flicker.
      setSearching(true)
      try {
        const places = await searchPlaces(
          trimmedQuery,
          pin ?? undefined,
          sessionToken
        )
        if (seq === requestSeq.current) setResults(places)
      } catch {
        if (seq === requestSeq.current) setResults([])
      } finally {
        if (seq === requestSeq.current) setSearching(false)
      }
    }, DEBOUNCE_MS)

    return () => clearTimeout(timer)
    // `pin` is read for search bias only; re-running on every pin nudge would
    // re-issue the same search for no benefit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trimmedQuery, queryIsSearchable, committedLabel, sessionToken])

  const pickSuggestion = async (place: GeoPlace) => {
    setResults([])
    setQuery(place.label)
    // Marks this text as ours, not typed. Editing it away re-enables search on
    // the next keystroke, since the comparison stops matching.
    setCommittedLabel(place.label)
    setResolving(true)

    try {
      // Some providers return autocomplete rows without coordinates. `resolve`
      // is a no-op for the ones that do, so this never branches on provider.
      const resolved =
        place.lat !== null && place.lng !== null
          ? place
          : place.providerPlaceId
            ? await resolvePlace(place.providerPlaceId, sessionToken)
            : place

      if (resolved.lat === null || resolved.lng === null) {
        setError('Could not locate that address. Try dropping the pin instead.')
        return
      }

      setPin({ lat: resolved.lat, lng: resolved.lng })
      setFlyTo({ lat: resolved.lat, lng: resolved.lng })
      setAddress(resolved.formatted ?? place.label)

      // Autocomplete predictions carry no address components — Ola returns them
      // only from reverse-geocode and place-details — so a picked suggestion
      // would otherwise leave city and pincode blank even though its own label
      // reads "…Chennai, Tamil Nadu, 600020". Rather than parse them back out of
      // a display string, ask the point. It is one call, server-cached on
      // rounded coordinates, and it is the same call a pin drop already makes,
      // so the two paths fill the form identically.
      let { city, pincode } = resolved
      if (!city || !pincode) {
        const atPoint = await reverseGeocode(resolved.lat, resolved.lng).catch(
          () => null
        )
        city = city || (atPoint?.city ?? null)
        pincode = pincode || (atPoint?.pincode ?? null)
      }

      onChange({
        lat: resolved.lat,
        lng: resolved.lng,
        address: resolved.formatted ?? place.label,
        city: city ?? '',
        pincode: pincode ?? '',
        // A searched result is still a pin the user is expected to check and
        // correct — it makes no claim of device accuracy.
        source: 'map_pin',
      })
    } catch {
      setError('Could not locate that address. Try dropping the pin instead.')
    } finally {
      setResolving(false)
    }
  }

  /**
   * Places the pin from a pasted Google Maps link, or from raw coordinates.
   *
   * Exists because business-name search is the weak link: our geocoder finds
   * only about a third of small garages by name, but Google's own share link
   * carries a canonical address it resolves reliably. Owners can already find
   * their garage on Google — this lets them hand that over instead.
   *
   * Nothing about the input is validated. A wrong kind of link produces a
   * warning and whatever could be salvaged, because the pin remains the source
   * of truth and is visible on the map either way.
   */
  const applyLink = async () => {
    const input = linkInput.trim()
    if (!input) return

    setLinkNotice(null)
    setError(null)

    // Raw "lat, lng" needs no round trip — and no geocoder to get it wrong.
    const pasted = parseCoordinatePair(input)
    if (pasted) {
      setFlyTo(pasted)
      void placePin(pasted.lat, pasted.lng, 'map_pin')
      return
    }

    setLinkBusy(true)
    try {
      const result = await resolveMapsLink(input)

      if (result.lat === null || result.lng === null) {
        setLinkNotice(
          LINK_WARNINGS[result.warning ?? 'no_location_found']
        )
        return
      }

      setFlyTo({ lat: result.lat, lng: result.lng })
      void placePin(result.lat, result.lng, 'map_pin')

      const notices: string[] = []
      if (result.warning) notices.push(LINK_WARNINGS[result.warning])

      // The link resolving somewhere other than the city on the form is the one
      // mistake the map alone will not catch, because the map obediently flies
      // to wherever the link pointed.
      const resolvedCity = result.address ?? ''
      if (
        expectedCity &&
        resolvedCity &&
        !resolvedCity.toLowerCase().includes(expectedCity.trim().toLowerCase())
      ) {
        notices.push(
          `This link points to “${resolvedCity.slice(0, 60)}”, which does not look like ${expectedCity}. Check the pin.`
        )
      } else if (result.source === 'geocoded') {
        notices.push('Pin placed from the link’s address — check it before saving.')
      }

      setLinkNotice(notices.length > 0 ? notices.join(' ') : null)
    } catch {
      setLinkNotice(LINK_WARNINGS.unreachable)
    } finally {
      setLinkBusy(false)
    }
  }

  const useCurrentLocation = () => {
    if (!navigator.geolocation) {
      setError('This browser cannot share your location.')
      return
    }

    setLocating(true)
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocating(false)
        setFlyTo({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        })
        void placePin(
          position.coords.latitude,
          position.coords.longitude,
          'gps'
        )
      },
      () => {
        setLocating(false)
        setError('Location access was blocked. Search or drop the pin instead.')
      },
      // Unlike browsing, this coordinate is stored permanently and drives
      // doorstep radius checks, so it is worth waiting for a real fix.
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 0 }
    )
  }

  return (
    <div className={cn('flex flex-col gap-3', className)}>
      {showSearch && (
        <div className="relative" ref={searchBoxRef}>
          <div className="flex items-center gap-2.5 rounded-[12px] border border-border bg-surface px-3.5 py-3">
            <IconSearch size={17} className="shrink-0 text-text-secondary" />
            <input
              aria-label="Search for area, street or landmark"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search for area, street or landmark"
              className="w-full bg-transparent text-[13px] text-text-primary outline-none placeholder:text-text-muted"
            />
            {searching && (
              <IconLoader2
                size={15}
                className="shrink-0 animate-spin text-text-muted"
              />
            )}
          </div>

          {showResults && (
            <ul className="absolute z-20 mt-1 max-h-60 w-full overflow-y-auto rounded-[12px] border border-border bg-surface-elevated shadow-lg">
              {results.map((place, index) => (
                <li key={place.providerPlaceId ?? `${place.label}-${index}`}>
                  <button
                    type="button"
                    onClick={() => void pickSuggestion(place)}
                    className="flex w-full items-start gap-2.5 border-b border-border px-3.5 py-3 text-left last:border-b-0 hover:bg-surface"
                  >
                    <IconMapPin
                      size={15}
                      className="mt-0.5 shrink-0 text-text-secondary"
                    />
                    <span className="min-w-0">
                      <span className="block truncate text-[13px] text-text-primary">
                        {place.label}
                      </span>
                      {place.formatted && place.formatted !== place.label && (
                        <span className="block truncate text-[11px] text-text-secondary">
                          {place.formatted}
                        </span>
                      )}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="relative h-56 overflow-hidden rounded-[12px] border border-border">
        <Map
          className="h-full w-full"
          styles={MAP_STYLES}
          theme={MAP_THEME}
          center={center}
          zoom={pin ? PICKER_ZOOM : 11}
          attributionControl={false}
        >
          <MapController
            onMapClick={(lat, lng) => void placePin(lat, lng, 'map_pin')}
            flyTo={flyTo}
          />
          {pin && (
            <MapMarker
              latitude={pin.lat}
              longitude={pin.lng}
              draggable
              onDragEnd={(lngLat: { lat: number; lng: number }) =>
                void placePin(lngLat.lat, lngLat.lng, 'map_pin')
              }
            >
              <MarkerContent>
                <IconMapPin
                  size={30}
                  className="text-brand-red drop-shadow"
                  fill="currentColor"
                />
              </MarkerContent>
            </MapMarker>
          )}
        </Map>

        {resolving && (
          <div className="absolute inset-x-0 bottom-0 bg-surface/90 px-3 py-1.5 text-center text-[11px] text-text-secondary">
            Looking up this location…
          </div>
        )}
      </div>

      {/* The fallback that always works: owners can find their own garage on
          Google even when our geocoder cannot, and a right-click there gives
          raw coordinates that need no interpretation at all. */}
      <div className="flex flex-col gap-1.5">
        <div className="flex gap-2">
          <input
            aria-label="Google Maps link or coordinates"
            value={linkInput}
            onChange={(e) => setLinkInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                void applyLink()
              }
            }}
            placeholder="Paste Google Maps link or 13.0043, 80.2554"
            className="min-w-0 flex-1 rounded-[10px] border border-border bg-surface px-3 py-2.5 text-[12px] text-text-primary outline-none placeholder:text-text-muted focus:border-text-secondary"
          />
          <ScButton
            type="button"
            variant="secondary"
            fullWidth={false}
            disabled={!linkInput.trim() || linkBusy}
            onClick={() => void applyLink()}
            className="shrink-0 px-4 py-2 text-[12px]"
          >
            {linkBusy ? 'Locating…' : 'Use'}
          </ScButton>
        </div>

        {linkNotice && (
          <p className="text-[11px] text-warning">{linkNotice}</p>
        )}
      </div>

      <ScButton
        type="button"
        variant="secondary"
        onClick={useCurrentLocation}
        disabled={locating}
        className="flex items-center justify-center gap-2"
      >
        {locating ? (
          <IconLoader2 size={15} className="animate-spin" />
        ) : (
          <IconCurrentLocation size={15} />
        )}
        {locating ? 'Finding you…' : 'Use my current location'}
      </ScButton>

      {!pin && (
        <p className="text-[11px] text-text-secondary">
          Search above, tap the map, or use your current location. Drag the pin
          to place it exactly.
        </p>
      )}

      {address && (
        <p className="text-[11px] text-text-secondary">
          <span className="text-text-muted">Pin is at:</span> {address}
        </p>
      )}

      {error && <p role="alert" className="text-[11px] text-error">{error}</p>}
    </div>
  )
}
