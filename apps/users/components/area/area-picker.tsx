'use client'

import { useState } from 'react'
import {
  IconCheck,
  IconCurrentLocation,
  IconMapPin,
  IconSearch,
} from '@tabler/icons-react'
import { LocationPromptSheet } from '@repo/ui/features/location-prompt-sheet'
import { GraphiteSwitch } from '@repo/ui/finish/graphite-switch'
import { ScSheet } from '@repo/ui/sc/modal'
import { track } from '@repo/core/analytics'
import { useZones } from '@repo/core/api/hooks/use-zones'
import { useAreaPlaces } from '@repo/core/api/hooks/use-area-places'
import { createGeoSessionToken } from '@repo/core/api/geo'
import type { AreaPlace } from '@repo/core/area-place'
import { useCustomerPlace } from '@repo/core/hooks/use-customer-place'
import {
  CITY_SWITCH_MAX,
  cityGaragesLine,
  zoneInCity,
  type CustomerCity,
} from '@repo/core/customer-city'
import { useLocationStore } from '@repo/core/stores/location-store'
import { searchZones, type Zone } from '@repo/core/zones'
import type { BookingType } from '@repo/core/types'
import { cn } from '@repo/core/utils'
import { useT } from '@repo/core/i18n'
import { msg } from '@repo/core/i18n/translate'

/** The line said when "Near me" cannot work: the browser has location blocked. */
export const NEAR_ME_BLOCKED_LINE =
  msg('Location is off for this site. Pick your area instead — distances work the same.')

/**
 * Picks an area: its centre and name go into the location store at once, with
 * no permission asked (customer reach, 0062), and the list re-sorts by
 * distance from it. Records "picked an area" (area_pick) with the zone's
 * slug.
 */
export function useAreaPick(mode?: BookingType) {
  const setArea = useLocationStore((s) => s.setArea)
  return (zone: Pick<Zone, 'slug' | 'name' | 'lat' | 'lng'>) => {
    setArea(zone)
    track('area_pick', mode ? { area: zone.slug, mode } : { area: zone.slug })
  }
}

/**
 * Picks a place found by the sheet's search (22 Nov 2026): kept like an area
 * with no zone, and recorded as "picked an area" with `area: 'place'`, so
 * the event's other values stay the zones' slugs.
 */
export function usePlacePick(mode?: BookingType) {
  const setPlace = useLocationStore((s) => s.setPlace)
  return (place: Pick<AreaPlace, 'name' | 'lat' | 'lng'>) => {
    setPlace(place)
    track('area_pick', mode ? { area: 'place', mode } : { area: 'place' })
  }
}

/**
 * "Near me": our explainer first (LocationPromptSheet), then the browser's
 * prompt, only when asked. With location already blocked there is no prompt
 * to show, so the caller says so (`blocked`) and offers the areas instead.
 */
export function useNearMe(mode?: BookingType) {
  const [explaining, setExplaining] = useState(false)
  const [blocked, setBlocked] = useState(false)
  const ask = () => {
    track('area_pick', mode ? { area: 'near-me', mode } : { area: 'near-me' })
    if (useLocationStore.getState().permission === 'denied') {
      setBlocked(true)
      return
    }
    setBlocked(false)
    setExplaining(true)
  }
  /** Closes the explainer; true when the browser refused, so the areas come back with the line. */
  const closeExplainer = (): boolean => {
    setExplaining(false)
    const { permission, location } = useLocationStore.getState()
    const refused = permission === 'denied' && location?.source !== 'gps'
    if (refused) setBlocked(true)
    return refused
  }
  return { explaining, blocked, ask, closeExplainer, dismissBlocked: () => setBlocked(false) }
}

/** The friendly line under the chips, or at the top of the sheet. */
export function NearMeBlocked() {
  const t = useT()
  return (
    <p role="status" className="text-t4 leading-snug text-text-secondary">
      {t(NEAR_ME_BLOCKED_LINE)}
    </p>
  )
}

/**
 * The area sheet (mockup B, customer cities 0070): the city, "Near me", then
 * the city's zones with a search box, then "All of <City>". Opened by "More"
 * on the landing page's chips and by the city chip at the top of the garage
 * list and Home's Nearby card, so the customer always picks a place the same
 * way.
 *
 * With two or three cities on for customers, a graphite switch at the top
 * picks which city's areas are listed; from four, a short list of rows does.
 * Picking a city only changes the list below; picking an area or "All of
 * <City>" is the choice, and closes the sheet. With one city there is no city
 * row at all, and the sheet is as it was before cities.
 */
export function AreaPicker({
  open,
  onClose,
  mode,
}: {
  open: boolean
  onClose: () => void
  /** The tab the list is on, for the area_pick event. */
  mode?: BookingType
}) {
  const t = useT()
  const location = useLocationStore((s) => s.location)
  const selectCity = useLocationStore((s) => s.selectCity)
  const { city: customerCity, cities } = useCustomerPlace()
  // The city whose areas are listed: the customer's own until they pick
  // another in the row, which changes nothing else until an area is chosen.
  const [viewedId, setViewedId] = useState<string | null>(null)
  const viewed = cities.find((c) => c.id === viewedId) ?? customerCity
  const manyCities = cities.length > 1
  const pickArea = useAreaPick(mode)
  const pickPlace = usePlacePick(mode)
  const nearMe = useNearMe(mode)
  const [query, setQuery] = useState('')
  // Open again by itself after "Near me" was refused at the browser's
  // prompt, so the customer lands back on the areas with the line.
  const [reopened, setReopened] = useState(false)

  const close = () => {
    setQuery('')
    setViewedId(null)
    setReopened(false)
    nearMe.dismissBlocked()
    // Closed without a place: not offered again by itself for a week, as
    // "Not now" on the location explainer always did.
    if (!useLocationStore.getState().location) useLocationStore.getState().dismissPrompt()
    onClose()
  }

  const choose = (zone: Zone) => {
    pickArea(zone)
    close()
  }

  const choosePlace = (place: AreaPlace) => {
    pickPlace(place)
    close()
  }

  const askNearMe = () => {
    nearMe.ask()
    // The explainer opens in place of this sheet (two sheets never stack);
    // a blocked browser keeps this one open with the line at its top.
    if (useLocationStore.getState().permission !== 'denied') {
      setReopened(false)
      onClose()
    }
  }

  return (
    <>
      <ScSheet open={open || reopened} onClose={close} aria-label={t("Where's your car?")} className="px-4">
        <div className="flex flex-col gap-4 pt-1">
          <div>
            <h2 className="text-[20px] font-normal tracking-[-0.015em] text-text-primary">
              {t("Where's your car?")}
            </h2>
            <p className="mt-1 text-t4 text-text-secondary">
              {manyCities
                ? t('Pick your city and area to see distances and drive times. No location permission needed.')
                : t('Pick your area to see distances and drive times. No location permission needed.')}
            </p>
          </div>

          {manyCities && (
            <CityChoice
              cities={cities}
              value={viewed}
              onChange={(next) => {
                setViewedId(next.id)
                setQuery('')
              }}
            />
          )}

          {nearMe.blocked && <NearMeBlocked />}

          <button
            type="button"
            onClick={askNearMe}
            className="press flex min-h-12 items-center gap-3 rounded-[14px] border border-line bg-white/[0.03] px-4 text-left text-t3 text-text-primary"
          >
            <IconCurrentLocation size={18} aria-hidden className="shrink-0" />
            <span className="min-w-0 flex-1">{t('Near me')}</span>
            {location?.source === 'gps' && (
              <IconCheck size={16} aria-label={t('Chosen')} className="shrink-0" />
            )}
          </button>

          <label className="flex items-center gap-2 rounded-[14px] border border-line bg-white/[0.03] px-3.5">
            <IconSearch size={16} aria-hidden className="shrink-0 text-text-secondary" />
            <input
              type="search"
              aria-label={t('Search areas in {city}', { city: viewed.name })}
              placeholder={t('Search areas in {city}', { city: viewed.name })}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              className="min-w-0 flex-1 bg-transparent py-3 text-t3 text-text-primary outline-none placeholder:text-text-muted"
            />
          </label>

          <AreaList
            query={query}
            city={viewed}
            cities={cities}
            chosen={location?.source === 'area' ? location.zone : undefined}
            onChoose={choose}
            onChoosePlace={choosePlace}
          />

          <button
            type="button"
            onClick={() => {
              selectCity(viewed)
              close()
            }}
            className="min-h-11 self-center px-3 text-t3 text-text-primary underline underline-offset-2"
          >
            {t('All of {city}', { city: viewed.name })}
          </button>
        </div>
      </ScSheet>

      <LocationPromptSheet
        open={nearMe.explaining}
        onClose={() => {
          if (nearMe.closeExplainer()) setReopened(true)
        }}
      />
    </>
  )
}

/**
 * Which city's areas the sheet lists: a graphite switch for two or three
 * cities, each with a quiet "42 garages" (none for a small city), and a short
 * list of rows from four, which a switch could not hold at phone width.
 * Either way a radiogroup named "City".
 */
function CityChoice({
  cities,
  value,
  onChange,
}: {
  cities: readonly CustomerCity[]
  value: CustomerCity
  onChange: (city: CustomerCity) => void
}) {
  const t = useT()
  if (cities.length <= CITY_SWITCH_MAX) {
    return (
      <GraphiteSwitch
        aria-label={t('City')}
        value={value.id}
        onChange={(id) => {
          const next = cities.find((c) => c.id === id)
          if (next) onChange(next)
        }}
        options={cities.map((c) => ({ value: c.id, label: c.name, quiet: cityGaragesLine(c) ?? undefined }))}
      />
    )
  }
  return (
    <div role="radiogroup" aria-label={t('City')} className="flex flex-col">
      {cities.map((c) => {
        const on = c.id === value.id
        const quiet = cityGaragesLine(c)
        return (
          <button
            key={c.id}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(c)}
            className={cn(
              'flex min-h-12 w-full items-center gap-3 border-b border-line px-1 text-left text-t3 text-text-primary',
              on && 'font-medium'
            )}
          >
            <span className="min-w-0 flex-1">{c.name}</span>
            {quiet && <span className="shrink-0 font-numeric text-t5 text-text-muted">{quiet}</span>}
            {on && <IconCheck size={16} aria-hidden className="shrink-0" />}
          </button>
        )
      })}
    </div>
  )
}

/**
 * The city's zones, filtered by the search, and under them any place in the
 * city that matches (useAreaPlaces, 22 Nov 2026): "Other places in Chennai".
 * Its own component so the zones and places are only read while the sheet is
 * open (ScSheet renders nothing when closed), with one search session per
 * opening.
 */
function AreaList({
  query,
  city,
  cities,
  chosen,
  onChoose,
  onChoosePlace,
}: {
  query: string
  city: CustomerCity
  cities: readonly CustomerCity[]
  chosen: string | undefined
  onChoose: (zone: Zone) => void
  onChoosePlace: (place: AreaPlace) => void
}) {
  const t = useT()
  const [sessionToken] = useState(createGeoSessionToken)
  const inCity = useZones().filter((zone) => zoneInCity(zone, city, cities))
  const found = searchZones(inCity, query)
  const { places, searching } = useAreaPlaces({
    query,
    city,
    cities,
    zoneNames: found.map((zone) => zone.name),
    sessionToken,
  })
  const typed = query.trim()
  const nothing = typed.length > 0 && found.length === 0 && places.length === 0 && !searching
  return (
    <div className="flex flex-col gap-2">
      {/* A city with no areas drawn yet lists none: its places still come
          up when typed, and "All of <City>" right below is the choice. */}
      {found.length > 0 && (
        <ul aria-label={t('Areas')} className="flex flex-col">
          {found.map((zone) => {
            const on = chosen === zone.slug
            return (
              <li key={zone.slug}>
                <button
                  type="button"
                  aria-pressed={on}
                  onClick={() => onChoose(zone)}
                  className={cn(
                    'flex min-h-12 w-full items-center gap-3 border-b border-line px-1 text-left text-t3 text-text-primary',
                    on && 'font-medium'
                  )}
                >
                  <IconMapPin size={16} aria-hidden className="shrink-0 text-text-secondary" />
                  <span className="min-w-0 flex-1">{zone.name}</span>
                  {on && <IconCheck size={16} aria-hidden className="shrink-0" />}
                </button>
              </li>
            )
          })}
        </ul>
      )}
      {places.length > 0 && (
        <section aria-label={t('Other places in {city}', { city: city.name })} className="flex flex-col">
          <h3 className="px-1 pt-2 pb-1 text-t5 text-text-secondary">
            {t('Other places in {city}', { city: city.name })}
          </h3>
          <ul className="flex flex-col">
            {places.map((place) => (
              <li key={place.id}>
                <button
                  type="button"
                  onClick={() => onChoosePlace(place)}
                  className="flex min-h-12 w-full items-center gap-3 border-b border-line px-1 py-2 text-left text-text-primary"
                >
                  <IconSearch size={16} aria-hidden className="shrink-0 text-text-secondary" />
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-t3">{place.name}</span>
                    {place.detail && (
                      <span className="truncate text-t5 text-text-secondary">{place.detail}</span>
                    )}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
      {searching && found.length === 0 && places.length === 0 && (
        <p role="status" className="py-4 text-t4 text-text-secondary">
          {t('Searching {city}…', { city: city.name })}
        </p>
      )}
      {nothing && (
        <p className="py-4 text-t4 text-text-secondary">
          {t('Nothing called “{query}” in {city}. Try a nearby area, or All of {city}.', {
            query: typed,
            city: city.name,
          })}
        </p>
      )}
    </div>
  )
}
