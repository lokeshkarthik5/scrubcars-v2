/**
 * Garage add-ons (0068): small extras a garage sells with its services, such
 * as a helmet wash or an oil change. Rules decided by the owner, 1 Nov 2026.
 *
 * An add-on is a `services` row with `is_addon = true`, so booking lines, money
 * and receipts work as they do for any line, and a line keeps the flag as a
 * snapshot. Everywhere a "service" means something bookable on its own (the
 * "from" price, category filters, service counts, packages, search, map prices,
 * washes, the redo promise), add-ons are left out.
 *
 * Twin: packages/core/src/add-ons.ts, for the apps (add-ons.parity.test.ts).
 */

/** The category an add-on is held under: never shown; commission's 8% reads it. */
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

/**
 * Services first, then add-ons, each in the customer's order. The first line
 * is what `bookings.service_id` and older clients read as "the service", so it
 * must never be an add-on.
 */
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
