/**
 * Garage add-ons (0068): small extras a garage sells with its services.
 *
 * Twin: apps/server/src/lib/add-ons.ts, whose rules the server enforces
 * (add-ons.parity.test.ts). The display words live here.
 */
import { formatServiceSummary } from './utils'

export const ADD_ON_CATEGORY = 'others' as const

export const ADD_ON_LIMITS = {
  nameLength: 120,
  /** A day's work: past this it is a job of its own, not an extra. */
  extraMins: 480,
  /** On one booking, on top of its services. */
  perBooking: 10,
} as const

/** Services on one booking; add-ons have their own limit, above. */
export const MAX_SERVICE_LINES = 10

/**
 * What a request's `serviceIds` may hold before the rows are read: services
 * and add-ons travel together there, so only the service layer can tell them
 * apart (lineCapRefusal).
 */
export const MAX_BOOKING_LINES = MAX_SERVICE_LINES + ADD_ON_LIMITS.perBooking

export const ADD_ONS_ALONE_CODE = 'ADD_ONS_NEED_A_SERVICE'
export const ADD_ONS_ALONE_MESSAGE =
  'Add-ons go with a service. Add a service first.'

/** Lines with nothing but add-ons: never bookable. An empty list is not this. */
export function onlyAddOns(
  lines: ReadonlyArray<{ isAddon?: boolean | null }>
): boolean {
  return lines.length > 0 && lines.every((line) => line.isAddon === true)
}

/** The lines that are services in their own right, in their order. */
export function serviceLinesOf<T extends { isAddon?: boolean | null }>(
  lines: readonly T[]
): T[] {
  return lines.filter((line) => line.isAddon !== true)
}

/** The add-on lines, in their order. */
export function addOnLinesOf<T extends { isAddon?: boolean | null }>(
  lines: readonly T[]
): T[] {
  return lines.filter((line) => line.isAddon === true)
}

/** Services first, then add-ons, each in the customer's order. */
export function servicesFirst<T extends { isAddon?: boolean | null }>(
  lines: readonly T[]
): T[] {
  return [...serviceLinesOf(lines), ...addOnLinesOf(lines)]
}

/** Which limit these lines pass, each kind counted on its own; null when neither. */
export function lineCapRefusal(
  lines: ReadonlyArray<{ isAddon?: boolean | null }>
): { code: string; message: string } | null {
  if (serviceLinesOf(lines).length > MAX_SERVICE_LINES) {
    return { code: 'TOO_MANY_SERVICES', message: `A booking can include at most ${MAX_SERVICE_LINES} services` }
  }
  if (addOnLinesOf(lines).length > ADD_ON_LIMITS.perBooking) {
    return { code: 'TOO_MANY_ADD_ONS', message: `A booking can include at most ${ADD_ON_LIMITS.perBooking} add-ons` }
  }
  return null
}

/** The add-on lines' price, in paise. */
export function addOnPaise(
  lines: ReadonlyArray<{ isAddon?: boolean | null; amount: string | number }>
): number {
  return addOnLinesOf(lines).reduce((total, line) => {
    const value = Number(line.amount)
    return total + (Number.isFinite(value) ? Math.round(value * 100) : 0)
  }, 0)
}

/** "+10 min", or "No extra time" when an add-on adds none. */
export function addOnTimeLabel(extraMins: number): string {
  return extraMins > 0 ? `+${extraMins} min` : 'No extra time'
}

/** "1 add-on", "2 add-ons". */
export function addOnCountLabel(count: number): string {
  return count === 1 ? '1 add-on' : `${count} add-ons`
}

/**
 * One line for a job: the services' summary, then the add-ons as a count, so
 * "Foam wash + 2 add-ons" reads as one wash with extras, not three services.
 */
export function jobSummary(
  lines: ReadonlyArray<{ name: string; isAddon?: boolean | null }>
): string {
  const services = formatServiceSummary(
    serviceLinesOf(lines).map((line) => line.name)
  )
  const addOns = addOnLinesOf(lines).length
  if (addOns === 0) return services
  return services
    ? `${services} + ${addOnCountLabel(addOns)}`
    : addOnCountLabel(addOns)
}

/**
 * The picked add-ons after a service is taken off: all of them go with the
 * last service, so checkout can never hold add-ons alone.
 */
export function addOnsAfterRemoving(
  addOnIds: readonly string[],
  servicesLeft: number
): string[] {
  return servicesLeft > 0 ? [...addOnIds] : []
}
