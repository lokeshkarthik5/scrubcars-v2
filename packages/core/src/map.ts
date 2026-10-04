/**
 * Basemap configuration.
 *
 * Tiles are by far the highest-volume map call — every pan and zoom — so
 * getting them to genuinely zero is the single biggest cost lever. OpenFreeMap
 * serves OpenStreetMap-based vector tiles with no API key, no registration and
 * no documented request limit, and MapLibre adds its attribution automatically.
 *
 * It is a donation-funded public instance with no SLA, which is exactly why the
 * style URL is an env var: swapping to MapTiler (100k requests/month free, no
 * card) or Carto is a config change, not a code change.
 */

const OPENFREEMAP_LIGHT = 'https://tiles.openfreemap.org/styles/positron'
const OPENFREEMAP_DARK = 'https://tiles.openfreemap.org/styles/dark'

export const MAP_STYLES = {
  light: process.env.NEXT_PUBLIC_MAP_STYLE_URL ?? OPENFREEMAP_LIGHT,
  dark: process.env.NEXT_PUBLIC_MAP_STYLE_URL_DARK ?? OPENFREEMAP_DARK,
}

/**
 * This app is dark-only: `globals.css` defines a single fixed dark palette and
 * hardcodes `body { background-color: #0A0A0A }` — there is no theme class, no
 * `data-theme`, and no toggle.
 *
 * mapcn's <Map> falls back to `prefers-color-scheme` when no `theme` prop is
 * given, so leaving it off would hand anyone with a light-mode OS a near-white
 * positron basemap inside a permanently dark app. Every <Map> passes this.
 *
 * If a light mode is ever added, this becomes the theme value from wherever it
 * is stored and MAP_STYLES.light starts earning its keep.
 */
export const MAP_THEME = 'dark' as const

/**
 * Fallback map centre. Only ever used before we know anything about the user —
 * it decides where an empty map opens, never what gets searched.
 */
export const DEFAULT_CENTER: [number, number] = [80.2707, 13.0827]

/** Close enough to recognise your own street, wide enough to get your bearings. */
export const PICKER_ZOOM = 16

/**
 * Straight-line distance, phrased the way a person would say it.
 *
 * Deliberately never a duration: 2 km across a river is not an 8-minute drive,
 * and a distance figure that implies travel time is a promise we cannot keep.
 */
export function formatDistance(km: number | null): string {
  if (km === null) return '—'
  if (km < 1) return `${Math.round(km * 1000)} m`
  return `${km.toFixed(1)} km`
}

/**
 * Kilometres between two points as the crow flies (haversine). The fallback
 * when road routing is unavailable — always shown as a distance, never turned
 * into a time, for the reason formatDistance gives.
 */
export function straightLineKm(
  from: { lat: number; lng: number },
  to: { lat: number; lng: number }
): number {
  const rad = (deg: number) => (deg * Math.PI) / 180
  const dLat = rad(to.lat - from.lat)
  const dLng = rad(to.lng - from.lng)
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(from.lat)) * Math.cos(rad(to.lat)) * Math.sin(dLng / 2) ** 2
  return 2 * 6371 * Math.asin(Math.sqrt(h))
}
