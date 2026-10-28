/**
 * A service's duration may be left empty (owner, 28 Oct 2026; 0061). An
 * empty one blocks this many minutes in the slot calendar, and a booking
 * snapshots that number, never null.
 *
 * Twin: packages/core/src/service-duration.ts, for the apps
 * (service-duration.parity.test.ts). Every slot, booking and travel
 * calculation on the server reads a service's duration through this file.
 * Screens show an empty duration as nothing ("Duration not set" in admin),
 * never as 60 min: the 60 is the calendar's, not the garage's word.
 */

/** What an empty duration blocks in the slot calendar. */
export const DEFAULT_SERVICE_DURATION_MINS = 60

/** The duration a service holds: its own, or the default when it has none. */
export function effectiveDurationMins(service: {
  durationMins?: number | null
}): number {
  const mins = service.durationMins
  return typeof mins === 'number' && Number.isFinite(mins) && mins > 0
    ? Math.round(mins)
    : DEFAULT_SERVICE_DURATION_MINS
}

/** Whether the garage set a duration for the service. */
export function hasDuration(service: { durationMins?: number | null }): boolean {
  const mins = service.durationMins
  return typeof mins === 'number' && Number.isFinite(mins) && mins > 0
}
