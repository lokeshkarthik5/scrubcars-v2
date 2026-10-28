/**
 * "6.2 km · ~20 min" on every garage card (customer reach, 0062).
 *
 * The drive time is an estimate from the straight-line distance for Chennai
 * traffic, never a routing call: a list of fifty garages must not cost fifty
 * paid requests. The rule is the owner's, `round(4 + km × 2.6)` minutes: a
 * few minutes to get going, then about 23 km/h across the city. Always shown
 * with "~", since it is an estimate. (The garage page still asks for a real
 * road time for one garage when the customer shared GPS: useTravelTime.)
 */

/** Minutes to get going (parking, the first signal), before any distance. */
const START_MINUTES = 4
/** Minutes per straight-line km in Chennai traffic. */
const MINUTES_PER_KM = 2.6

/** Estimated drive in whole minutes for a straight-line distance in km. */
export function driveMinutes(km: number): number {
  return Math.round(START_MINUTES + Math.max(0, km) * MINUTES_PER_KM)
}

/**
 * "~20 min"; past an hour "~1 h 10 min" (and "~2 h" on the hour). The
 * figure is the estimate from driveMinutes.
 */
export function driveTimeLabel(km: number): string {
  const minutes = driveMinutes(km)
  if (minutes <= 60) return `~${minutes} min`
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  return rest === 0 ? `~${hours} h` : `~${hours} h ${rest} min`
}

/**
 * The distance as a card says it: "6.2 km", "400 m" under a kilometre. With
 * `approx` (measured from an area's centre, not the customer's own fix) it
 * starts with "~", as the drive time does.
 */
export function distanceLabel(km: number, approx = false): string {
  const figure = km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`
  return approx ? `~${figure}` : figure
}

/** "6.2 km · ~20 min", or "~6.2 km · ~20 min" from an area. */
export function distanceAndDrive(km: number, approx = false): string {
  return `${distanceLabel(km, approx)} · ${driveTimeLabel(km)}`
}
