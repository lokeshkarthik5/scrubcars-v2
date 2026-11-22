import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { useHydrated } from '@repo/core/hooks/use-hydrated'
import { msg } from '../i18n/translate'

/**
 * Where the customer is, for sorting garages by distance.
 *
 * Two rules shape this store:
 *
 * 1. **Nothing here ever blocks the app.** The garage list must render for
 *    someone who declined the permission prompt, just without distances. Every
 *    consumer treats a null location as "no distances", never as "no results".
 *
 * 2. **Coordinates are rounded before they leave the device.** Sorting a list
 *    does not need better than ~100 m, so the listing request sends three
 *    decimals (~110 m). That is both the privacy story and what makes the
 *    server-side geocode cache work — see `coarse()`.
 */

/**
 * Where the location came from. `area` (0062) is a zone the customer picked
 * from the "Where's your car?" sheet: its centre, with no permission asked,
 * so distances from it are shown with "~". `manual` is a whole city, "All of
 * Coimbatore" (0070; before cities, always "All of Chennai"), which is no
 * place at all (see isCitywide).
 */
export type LocationSource = 'gps' | 'address' | 'manual' | 'area'

export interface ActiveLocation {
  lat: number
  lng: number
  /** What to show in the header — an area name, or the address label. */
  label: string
  source: LocationSource
  /** Epoch ms. A stale fix is still better than none. */
  updatedAt: number
  /** The zone's slug, for an `area` location (which chip is chosen). */
  zone?: string
  /**
   * The city picked, for a `manual` location (0070). A `manual` location
   * kept from before cities has none and means Chennai
   * (customerCityOf in @repo/core/customer-city).
   */
  cityId?: string
}

export type PermissionState = 'unknown' | 'prompt' | 'granted' | 'denied'

interface LocationState {
  location: ActiveLocation | null
  permission: PermissionState
  /** True while a GPS fix is in flight, so the UI can show it is working. */
  locating: boolean
  /**
   * Epoch ms of the last "Not now" on the explainer sheet. Persisted, because
   * being asked again on every visit is how a soft prompt turns into nagging —
   * and a nagged user hits the browser's Block, which is the one outcome we
   * cannot undo.
   */
  promptDismissedAt: number | null
  dismissPrompt: () => void
  setLocation: (location: ActiveLocation) => void
  /**
   * The customer picked an area: its centre and name, at once, with no
   * permission prompt (0062). Persisted like any other location.
   */
  setArea: (zone: { slug: string; name: string; lat: number; lng: number }) => void
  /**
   * Any place in the city found by the sheet's search (22 Nov 2026): kept as
   * an area with no zone, so it reads and measures like one (placeLocation).
   */
  setPlace: (place: { name: string; lat: number; lng: number }) => void
  /**
   * Browse a whole city: its centre, named for it, with its id (0070). Not a
   * pin, so lists are not sorted from downtown; only the far-garage limit is
   * measured from the centre.
   */
  selectCity: (city: { id: string; name: string; centre: { lat: number; lng: number } }) => void
  clearLocation: () => void
  setPermission: (permission: PermissionState) => void
  /**
   * Asks the browser for a fix. Resolves to null on denial or failure rather
   * than throwing — a refused prompt is an ordinary outcome, not an error.
   */
  requestGpsLocation: () => Promise<ActiveLocation | null>
  refreshPermission: () => Promise<void>
}

/**
 * A whole city as a stored place (0070): its centre and name, `manual`, with
 * the city's id. The web and the native store both make it here.
 */
export function cityLocation(city: { id: string; name: string; centre: { lat: number; lng: number } }): ActiveLocation {
  return {
    lat: city.centre.lat,
    lng: city.centre.lng,
    label: city.name,
    source: 'manual',
    cityId: city.id,
    updatedAt: Date.now(),
  }
}

/**
 * A searched place as a stored location: an `area` (its point, with no
 * permission asked, so distances say "~") with no zone, since it is not one
 * of the drawn zones and no chip is chosen for it. The web and the native
 * store both make it here.
 */
export function placeLocation(place: { name: string; lat: number; lng: number }): ActiveLocation {
  return { lat: place.lat, lng: place.lng, label: place.name, source: 'area', updatedAt: Date.now() }
}

/** A fix older than this is worth refreshing opportunistically. */
const STALE_AFTER_MS = 5 * 60 * 1000

export const useLocationStore = create<LocationState>()(
  persist(
    (set) => ({
      location: null,
      permission: 'unknown',
      locating: false,
      promptDismissedAt: null,

      dismissPrompt: () => set({ promptDismissedAt: Date.now() }),

      setLocation: (location) => set({ location }),
      setArea: (zone) =>
        set({
          location: {
            lat: zone.lat,
            lng: zone.lng,
            label: zone.name,
            source: 'area',
            zone: zone.slug,
            updatedAt: Date.now(),
          },
        }),
      setPlace: (place) => set({ location: placeLocation(place) }),
      selectCity: (city) => set({ location: cityLocation(city) }),
      clearLocation: () => set({ location: null }),
      setPermission: (permission) => set({ permission }),

      async refreshPermission() {
        if (typeof navigator === 'undefined' || !navigator.permissions) return
        try {
          const status = await navigator.permissions.query({
            name: 'geolocation',
          })
          set({ permission: status.state as PermissionState })
        } catch {
          // Safari has historically not supported querying geolocation
          // permission. Not knowing is fine — it only costs us the ability to
          // predict whether a prompt is about to appear.
        }
      },

      async requestGpsLocation() {
        if (typeof navigator === 'undefined' || !navigator.geolocation) {
          return null
        }

        set({ locating: true })

        return new Promise<ActiveLocation | null>((resolve) => {
          navigator.geolocation.getCurrentPosition(
            (position) => {
              const location: ActiveLocation = {
                lat: position.coords.latitude,
                lng: position.coords.longitude,
                // English as stored: a screen shows t(location.label).
                label: msg('Current location'),
                source: 'gps',
                updatedAt: Date.now(),
              }
              set({ location, permission: 'granted', locating: false })
              resolve(location)
            },
            (error) => {
              set({
                locating: false,
                permission:
                  error.code === error.PERMISSION_DENIED ? 'denied' : 'prompt',
              })
              resolve(null)
            },
            {
              // Sorting a list does not need a GPS lock. Wifi/cell positioning
              // is faster, kinder to the battery, and easily accurate enough —
              // high accuracy is for the doorstep address pin, not for browsing.
              enableHighAccuracy: false,
              timeout: 10_000,
              maximumAge: STALE_AFTER_MS,
            }
          )
        })
      },
    }),
    {
      name: 'detlio-location',
      // Permission state belongs to the browser, not to us: persisting it would
      // let a stale 'denied' outlive the user granting access in site settings.
      // The dismissal is ours, so it persists.
      partialize: (state) => ({
        location: state.location,
        promptDismissedAt: state.promptDismissedAt,
      }),
    }
  )
)

/**
 * A whole city ("All of Coimbatore") or no place at all. Lists then omit an
 * origin, so doorstep is not filtered to one downtown point and distances are
 * not measured from somewhere the customer never stood; the garage list sends
 * the city's centre for the far-garage limit only (cityCentreParams).
 */
export function isCitywide(location: ActiveLocation | null): boolean {
  return location === null || location.source === 'manual'
}

/**
 * Distances from here are approximate: an area's centre, not where the
 * customer stands. Cards then say "~6.2 km" (0062).
 */
export function isApproximate(location: ActiveLocation | null): boolean {
  return location?.source === 'area'
}

export function isStale(location: ActiveLocation | null): boolean {
  return location !== null && Date.now() - location.updatedAt > STALE_AFTER_MS
}

/** Long enough that "Not now" means not today, short enough to ask again. */
const PROMPT_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000

/**
 * Whether to offer the location explainer sheet.
 *
 * Not when we already have a fix, not when the browser has already been told
 * no — our sheet cannot reopen a blocked prompt — and not within the cooldown
 * of a previous dismissal.
 */
export function shouldOfferLocationPrompt(state: {
  location: ActiveLocation | null
  permission: PermissionState
  promptDismissedAt: number | null
}): boolean {
  if (state.location) return false
  if (state.permission === 'denied') return false
  if (
    state.promptDismissedAt &&
    Date.now() - state.promptDismissedAt < PROMPT_COOLDOWN_MS
  ) {
    return false
  }
  return true
}

/**
 * Coordinates rounded for a listing request: three decimals is ~110 m, which is
 * finer than any sort needs and coarse enough that we are not shipping someone's
 * doorstep to the server to browse car washes.
 */
export function coarse(location: Pick<ActiveLocation, 'lat' | 'lng'>): { lat: number; lng: number } {
  return {
    lat: Number(location.lat.toFixed(3)),
    lng: Number(location.lng.toFixed(3)),
  }
}

/**
 * The stored location, but null until the page has hydrated: the server
 * renders with no location (it has no localStorage), so a server-rendered
 * screen (the landing, 0062) must render its first pass the same way. On
 * screens that only render in the browser it is the stored location from
 * the second render on.
 */
export function useHydratedLocation(): ActiveLocation | null {
  const hydrated = useHydrated()
  const location = useLocationStore((s) => s.location)
  return hydrated ? location : null
}

/**
 * The list's `cityLat`/`cityLng` (0070) for a whole city picked: its centre,
 * for the far-garage limit only. Nothing for a real place (the origin is
 * sent instead) and nothing with no place at all, so a first visit asks the
 * same question the landing page rendered on the server.
 */
export function cityCentreParams(
  location: ActiveLocation | null,
  city: { centre: { lat: number; lng: number } }
): { cityLat?: number; cityLng?: number } {
  if (location?.source !== 'manual') return {}
  return { cityLat: Number(city.centre.lat.toFixed(3)), cityLng: Number(city.centre.lng.toFixed(3)) }
}
