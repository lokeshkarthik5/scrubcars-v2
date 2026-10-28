/**
 * "Never an empty list" (customer reach, 0062): what the garage list adds
 * around its garages so a customer always has a next step. The figures come
 * from the API's list answer (`reach`, `outside`; apps/server/src/lib/reach.ts
 * holds the server's rules); these are the screen's rules and words.
 *
 * Pure, unit-tested (reach.test.ts). Tabs never switch on their own: every
 * piece here is something to tap.
 */

// Relative, not @repo/core/…: kept loadable by path like the other twins.
import { insidePickupReach } from './pickup'
import type { BookingType } from './types'

/** What each tab offers the customer, as the API counts it. */
export interface ReachFigures {
  dropin: { count: number; nearestKm: number | null }
  doorstep: { count: number; fromPrice: number | null }
  pickup: { count: number; fromPrice: number | null }
}

/** Past this, the nearest garage to drive to is far: "Skip the drive". */
export const FAR_KM = 10
/** From this to FAR_KM, worth a drive, but home is worth a mention. */
export const WORTH_IT_KM = 5

export type DistanceBand = 'close' | 'worth_it' | 'far'

/**
 * How far the nearest at-garage garage is: under 5 km close, 5–10 km worth
 * it, 10 km or more far. None to drive to at all (no pinned at-garage garage)
 * counts as far: the customer has to be offered another way.
 */
export function distanceBand(nearestKm: number | null): DistanceBand {
  if (nearestKm === null || nearestKm >= FAR_KM) return 'far'
  if (nearestKm >= WORTH_IT_KM) return 'worth_it'
  return 'close'
}

export interface SkipTheDriveRow {
  mode: 'doorstep' | 'pickup'
  title: string
  detail: string
}

function garages(count: number): string {
  return count === 1 ? '1 garage' : `${count} garages`
}

function rupees(amount: number): string {
  return `₹${Math.round(amount).toLocaleString('en-IN')}`
}

/**
 * The At garage tab's pieces, with a location: a "Skip the drive" card when
 * the nearest garage is far (a row per other way that has garages: "2
 * garages can come to your door · from ₹349", "1 garage picks up and drops
 * back"), or the small "or have it done at home" line when it is 5–10 km and
 * a doorstep garage comes to them. Each piece is left out when its count is
 * 0; without a location, or without the figures, nothing.
 */
export function atGarageReach(
  figures: ReachFigures | null | undefined,
  located: boolean
): { skipTheDrive: SkipTheDriveRow[] | null; atHomeLine: boolean; nearestKm: number | null } {
  const none = { skipTheDrive: null, atHomeLine: false, nearestKm: null }
  if (!figures || !located) return none
  const band = distanceBand(figures.dropin.nearestKm)
  if (band === 'far') {
    const rows: SkipTheDriveRow[] = []
    if (figures.doorstep.count > 0) {
      rows.push({
        mode: 'doorstep',
        title: 'At your door',
        detail: `${garages(figures.doorstep.count)} can come to your door${
          figures.doorstep.fromPrice ? ` · from ${rupees(figures.doorstep.fromPrice)}` : ''
        }`,
      })
    }
    if (figures.pickup.count > 0) {
      rows.push({
        mode: 'pickup',
        title: 'We collect your car',
        detail: `${garages(figures.pickup.count)} ${
          figures.pickup.count === 1 ? 'picks' : 'pick'
        } up and ${figures.pickup.count === 1 ? 'drops' : 'drop'} back`,
      })
    }
    return { skipTheDrive: rows.length > 0 ? rows : null, atHomeLine: false, nearestKm: figures.dropin.nearestKm }
  }
  return {
    skipTheDrive: null,
    atHomeLine: band === 'worth_it' && figures.doorstep.count > 0,
    nearestKm: figures.dropin.nearestKm,
  }
}

/** "The nearest garage is 14 km away", for the card's title; "No garage to drive to nearby" with none. */
export function skipTheDriveTitle(nearestKm: number | null): string {
  return nearestKm === null
    ? 'No garage to drive to near you yet'
    : `The nearest garage is ${Math.round(nearestKm)} km away`
}

export interface NextTabOffer {
  mode: BookingType
  label: string
}

/**
 * What the bottom of each tab offers next: At garage → Doorstep ("Have it
 * done at home"), Doorstep → Pickup & drop ("We collect your car"). Pickup &
 * drop has none here (the next part of this release fills it: a free wash in
 * the customer's area). Left out when that tab has no garages for them, or
 * the figures are unknown.
 */
export function nextTabOffer(
  mode: BookingType,
  figures: ReachFigures | null | undefined
): NextTabOffer | null {
  if (!figures) return null
  if (mode === 'dropin' && figures.doorstep.count > 0) {
    return { mode: 'doorstep', label: 'Have it done at home' }
  }
  if (mode === 'doorstep' && figures.pickup.count > 0) {
    return { mode: 'pickup', label: 'We collect your car' }
  }
  return null
}

/**
 * "Can collect your car" on an at-garage card: the garage does pickup & drop
 * and the customer's location is inside its pickup radius (the checkout's
 * own early check, insidePickupReach). Never without a location.
 */
export function canCollectFrom(
  garage: { pickupEnabled: boolean; lat: number | null; lng: number | null; pickupRadiusKm?: number | null },
  origin: { lat: number; lng: number } | null | undefined
): boolean {
  if (!garage.pickupEnabled || !origin) return false
  return insidePickupReach(garage, origin) === true
}

/**
 * A "Just outside their area" card's line: "covers 5 km · 3.9 km outside";
 * a garage with a drawn doorstep area has no single radius, so "3.9 km
 * outside its area".
 */
export function outsideLine(coverKm: number | null, outsideKm: number): string {
  const out = `${outsideKm.toFixed(1).replace(/\.0$/, '')} km outside`
  if (coverKm === null) return `${out} its area`
  return `covers ${String(Number(coverKm.toFixed(1)))} km · ${out}`
}
