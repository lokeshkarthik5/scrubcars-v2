/**
 * Offers on Home: which promo codes a customer sees, in what order, and the
 * line of small print each card carries. Pure, with the clock passed in.
 *
 * An offer is a promo code an admin marked "Show on Home". Owner decisions:
 *
 *   - Offers come first on Home, up to three, highest priority first
 *     (Top 2, High 1, Normal 0), then — only while targeting is on — the
 *     customer's tie to the garage, then the one ending soonest, then the
 *     newest.
 *   - "Who sees it" is one audience per offer. Every audience but 'everyone'
 *     uses booking history, location or the customer's cars, so they are all
 *     switched off together (HOME_OFFER_TARGETING) until the privacy policy
 *     covers that use. While off, only 'everyone' offers are shown and none
 *     of that data is read for offers.
 *   - It is display targeting only. It decides who SEES the card on Home; it
 *     never changes who may type the code at checkout (resolveDiscount does
 *     not look at any of this). 'new_customers' is not "first booking only".
 *   - The card's title is the admin's; the rest is generated from the code's
 *     own columns, so it can never misstate a cap, a minimum or an end date.
 *
 * Usage limits are counted with DISCOUNT_HELD, as resolveDiscount counts
 * them, so a code a customer can no longer use leaves their Home by itself.
 * The minimum order cannot be checked without a basket, so it goes in the
 * small print instead.
 */
import { HOME_AUDIENCES, type HomeAudience } from '../db/schema.js'
import { rupees } from './home-updates.js'
import { daysBetween, istDateKey, istDayLabel, istParts, istTimeLabel, istWeekdayLabel, MONTHS } from './ist.js'

export const MAX_HOME_OFFERS = 3

/** How far from the garage counts as near, when the admin does not say. */
export const DEFAULT_NEAR_RADIUS_KM = 10
export const MAX_NEAR_RADIUS_KM = 50

// The audiences are declared beside the column (db/schema.ts) so the table
// and the rules can never list different ones.
export { HOME_AUDIENCES, type HomeAudience }

export type CarType = 'hatchback' | 'sedan' | 'suv'

export const HOME_AUDIENCE_LABELS: Record<HomeAudience, string> = {
  everyone: 'Everyone',
  new_customers: 'New customers (no bookings yet)',
  booked_this_garage: 'Customers who booked this garage',
  near_this_garage: 'Customers near this garage',
  wash_due: 'Customers whose wash is due',
  car_type: 'Owners of a car type',
}

export const HOME_PRIORITIES = [
  { value: 0, label: 'Normal' },
  { value: 1, label: 'High' },
  { value: 2, label: 'Top' },
] as const

/** Shown beside the audience options while targeting is switched off. */
export const TARGETING_DISABLED_NOTE =
  'Targeted offers use booking history and location. Our privacy policy is being updated to cover this before they go live.'

/** A code marked for Home, as the Home read loads it. */
export interface HomeOfferRow {
  id: string
  code: string
  homeTitle: string | null
  homePriority: number
  homeAudience: HomeAudience
  homeAudienceRadiusKm: number | null
  homeAudienceVehicleTypes: CarType[] | null
  discountType: 'percentage' | 'fixed'
  percentOff: string | null
  amountOff: string | null
  maxDiscountAmount: string | null
  minOrderAmount: string | null
  perUserLimit: number | null
  totalUsageLimit: number | null
  vendorId: string | null
  vendorName: string | null
  /** The garage is live for customers: active, verified, pinned, not paused. */
  vendorPublic: boolean
  /**
   * Distance from the customer to the garage, in km. Only measured while
   * targeting is on and the customer sent a location; null otherwise.
   */
  vendorDistanceKm: number | null
  showOnHome: boolean
  isActive: boolean
  startsAt: Date | null
  endsAt: Date | null
  createdAt: Date
  dismissed: boolean
}

/** What the offer engine knows about the customer looking at Home. */
export interface OfferContext {
  now: Date
  targetingEnabled: boolean
  /** Whether they have a car saved. With none, only Detlio-wide offers show. */
  hasCar: boolean
  /** Uses held (DISCOUNT_HELD) per code, in total and by this customer. */
  held: Map<string, { total: number; byUser: number }>
  /**
   * The facts the audiences read. Only filled in while targeting is on: with
   * it off, this is undefined and nothing about the customer is consulted.
   */
  customer?: {
    /** Garages they have a booking with whose payment went through. */
    bookedVendorIds: Set<string>
    /** A wash is due or overdue on any of their cars. */
    washDue: boolean
    carTypes: Set<CarType>
  }
}

export type OfferSkipReason =
  | 'not_on_home'
  | 'inactive'
  | 'not_started'
  | 'ended'
  | 'no_end_date'
  | 'used_up'
  | 'used_by_customer'
  | 'dismissed'
  | 'garage_not_public'
  | 'needs_car'
  | 'targeting_off'
  | 'audience'

/**
 * Why a code is not shown to this customer, or null when it is. The order is
 * cheapest first; only the answer "null or not" matters to Home, the reason
 * is for tests and logs.
 */
export function offerSkipReason(row: HomeOfferRow, ctx: OfferContext): OfferSkipReason | null {
  if (!row.showOnHome) return 'not_on_home'
  if (!row.isActive) return 'inactive'
  // Same window rule as assertRuleApplies in lib/discounts.ts.
  if (row.startsAt && ctx.now < row.startsAt) return 'not_started'
  if (!row.endsAt) return 'no_end_date'
  if (ctx.now >= row.endsAt) return 'ended'
  if (row.dismissed) return 'dismissed'

  const held = ctx.held.get(row.id) ?? { total: 0, byUser: 0 }
  if (row.totalUsageLimit !== null && held.total >= row.totalUsageLimit) return 'used_up'
  if (row.perUserLimit !== null && held.byUser >= row.perUserLimit) return 'used_by_customer'

  if (row.vendorId && !row.vendorPublic) return 'garage_not_public'
  // Every code is priced against a car, so a customer without one can only
  // be pointed at the list of garages: Detlio-wide offers alone.
  if (row.vendorId && !ctx.hasCar) return 'needs_car'

  if (row.homeAudience === 'everyone') return null
  if (!ctx.targetingEnabled || !ctx.customer) return 'targeting_off'
  return audienceMatches(row, ctx.customer) ? null : 'audience'
}

function audienceMatches(row: HomeOfferRow, customer: NonNullable<OfferContext['customer']>): boolean {
  switch (row.homeAudience) {
    case 'everyone':
      return true
    case 'new_customers':
      return customer.bookedVendorIds.size === 0
    case 'booked_this_garage':
      return !!row.vendorId && customer.bookedVendorIds.has(row.vendorId)
    case 'near_this_garage':
      return (
        row.vendorDistanceKm !== null &&
        row.vendorDistanceKm <= (row.homeAudienceRadiusKm ?? DEFAULT_NEAR_RADIUS_KM)
      )
    case 'wash_due':
      return customer.washDue
    case 'car_type':
      return (row.homeAudienceVehicleTypes ?? []).some((type) => customer.carTypes.has(type))
  }
}

/**
 * The customer's tie to the offer's garage, lower first: a garage they have
 * booked, one near them, then a Detlio-wide code, then any other garage.
 * Only used while targeting is on; it reads booking history and location.
 */
export function offerTier(row: HomeOfferRow, ctx: OfferContext): number {
  if (!ctx.targetingEnabled || !ctx.customer) return 0
  if (!row.vendorId) return 2
  if (ctx.customer.bookedVendorIds.has(row.vendorId)) return 0
  if (row.vendorDistanceKm !== null && row.vendorDistanceKm <= DEFAULT_NEAR_RADIUS_KM) return 1
  return 3
}

/** The offers to show, best first, at most three. */
export function rankOffers(rows: HomeOfferRow[], ctx: OfferContext): HomeOfferRow[] {
  return rows
    .filter((row) => offerSkipReason(row, ctx) === null)
    .sort(
      (a, b) =>
        b.homePriority - a.homePriority ||
        offerTier(a, ctx) - offerTier(b, ctx) ||
        // Every shown offer has an end date (offerSkipReason).
        a.endsAt!.getTime() - b.endsAt!.getTime() ||
        b.createdAt.getTime() - a.createdAt.getTime() ||
        a.id.localeCompare(b.id)
    )
    .slice(0, MAX_HOME_OFFERS)
}

// ─── The small print ─────────────────────────────────────────────────────────

/**
 * The last moment a code works, as a customer reads it. A code that ends at
 * midnight IST is valid all of the day before, so it reads "Till Sat 17 Oct"
 * (worked from ends_at − 1 ms); one that ends at another time names it:
 * "Till 18 Oct, 6 PM".
 */
export function tillLabel(endsAt: Date): string {
  const p = istParts(endsAt)
  if (p.hour === 0 && p.minute === 0 && p.second === 0 && p.ms === 0) {
    return `Till ${istDayLabel(new Date(endsAt.getTime() - 1))}`
  }
  return `Till ${p.day} ${MONTHS[p.month]}, ${istTimeLabel(endsAt)}`
}

/**
 * "Ends today" or "Ends Sun" once three days or fewer are left, in IST;
 * null before that. Counted to the last day the code works.
 */
export function endsSoonLabel(endsAt: Date, now: Date): string | null {
  const lastDay = new Date(endsAt.getTime() - 1)
  const daysLeft = daysBetween(istDateKey(now), istDateKey(lastDay))
  if (daysLeft < 0 || daysLeft > 3) return null
  if (daysLeft === 0) return 'Ends today'
  return `Ends ${istWeekdayLabel(lastDay)}`
}

/**
 * "Up to ₹300 · Min ₹1,000 · Code DETAIL20 · Till Sat 17 Oct". Every part
 * comes from a column, so the card cannot promise more than the code gives.
 * Money is exact, paise and all: a ₹149.50 cap rounded to "Up to ₹150"
 * would promise 50 paise the code never gives.
 */
export function offerMetaLine(
  row: Pick<HomeOfferRow, 'code' | 'discountType' | 'maxDiscountAmount' | 'minOrderAmount' | 'endsAt'>
): string {
  const parts: string[] = []
  if (row.discountType === 'percentage' && row.maxDiscountAmount) {
    parts.push(`Up to ${rupees(row.maxDiscountAmount)}`)
  }
  if (row.minOrderAmount) parts.push(`Min ${rupees(row.minOrderAmount)}`)
  parts.push(`Code ${row.code}`)
  if (row.endsAt) parts.push(tillLabel(row.endsAt))
  return parts.join(' · ')
}

/** An offer as Home sends it. */
export interface HomeOffer {
  id: string
  code: string
  title: string
  metaLine: string
  endsSoon: string | null
  endsAt: string
  priority: number
  /** Null for a Detlio-wide code: the card opens the list of garages. */
  vendorId: string | null
  vendorName: string | null
  discountType: 'percentage' | 'fixed'
  percentOff: string | null
  amountOff: string | null
  maxDiscountAmount: string | null
  minOrderAmount: string | null
}

export function toHomeOffer(row: HomeOfferRow, now: Date): HomeOffer {
  return {
    id: row.id,
    code: row.code,
    title: (row.homeTitle ?? '').trim(),
    metaLine: offerMetaLine(row),
    endsSoon: row.endsAt ? endsSoonLabel(row.endsAt, now) : null,
    endsAt: row.endsAt!.toISOString(),
    priority: row.homePriority,
    vendorId: row.vendorId,
    vendorName: row.vendorName,
    discountType: row.discountType,
    percentOff: row.percentOff,
    amountOff: row.amountOff,
    maxDiscountAmount: row.maxDiscountAmount,
    minOrderAmount: row.minOrderAmount,
  }
}

// ─── Saving the Home fields ──────────────────────────────────────────────────

/** A code's Home fields as they will be stored: the row with the patch on top. */
export interface HomeFields {
  showOnHome: boolean
  homeTitle: string | null
  homePriority: number
  homeAudience: HomeAudience
  homeAudienceRadiusKm: number | null
  homeAudienceVehicleTypes: CarType[] | null
  vendorId: string | null
  endsAt: Date | null
  startsAt: Date | null
}

export interface HomeFieldsProblem {
  field: keyof HomeFields
  message: string
}

/**
 * What is wrong with a code's Home fields as a whole, or null. Run on the
 * merged row (stored row plus the PATCH), because a PATCH that only clears
 * `endsAt` on a code shown on Home is as broken as one that sends nothing
 * else. 0031's CHECKs are the backstop.
 */
export function homeFieldsProblem(row: HomeFields): HomeFieldsProblem | null {
  if (row.showOnHome) {
    const title = (row.homeTitle ?? '').trim()
    if (title.length < 3 || title.length > 40) {
      return { field: 'homeTitle', message: 'An offer on Home needs a title of 3 to 40 characters.' }
    }
    if (!row.endsAt) {
      return { field: 'endsAt', message: 'An offer on Home needs an end date, so the card can say when it ends.' }
    }
  }
  if (![0, 1, 2].includes(row.homePriority)) {
    return { field: 'homePriority', message: 'Priority must be Normal, High or Top.' }
  }
  if ((row.homeAudience === 'booked_this_garage' || row.homeAudience === 'near_this_garage') && !row.vendorId) {
    return { field: 'homeAudience', message: 'This audience needs the code to be for one garage.' }
  }
  if (row.homeAudience === 'near_this_garage') {
    const radius = row.homeAudienceRadiusKm
    if (radius === null || !Number.isInteger(radius) || radius < 1 || radius > MAX_NEAR_RADIUS_KM) {
      return { field: 'homeAudienceRadiusKm', message: `Pick a distance from 1 to ${MAX_NEAR_RADIUS_KM} km.` }
    }
  } else if (row.homeAudienceRadiusKm !== null) {
    return { field: 'homeAudienceRadiusKm', message: 'A distance only applies to "Customers near this garage".' }
  }
  if (row.homeAudience === 'car_type') {
    if (!row.homeAudienceVehicleTypes || row.homeAudienceVehicleTypes.length === 0) {
      return { field: 'homeAudienceVehicleTypes', message: 'Pick at least one car type.' }
    }
  } else if (row.homeAudienceVehicleTypes !== null) {
    return { field: 'homeAudienceVehicleTypes', message: 'Car types only apply to "Owners of a car type".' }
  }
  return null
}

export const HOME_FIELD_KEYS = [
  'showOnHome',
  'homeTitle',
  'homePriority',
  'homeAudience',
  'homeAudienceRadiusKm',
  'homeAudienceVehicleTypes',
  'vendorId',
  'startsAt',
  'endsAt',
] as const satisfies ReadonlyArray<keyof HomeFields>

/**
 * The Home fields as they will be stored: `patch` (only the keys a request
 * sets) over `stored` (nothing on a create). A setting the new audience does
 * not use is dropped rather than refused when only the audience changed, so
 * moving "near this garage" back to "everyone" needs no second edit; and
 * "near this garage" picked without a distance gets the default 10 km.
 */
export function mergeHomeFields(stored: Partial<HomeFields>, patch: Partial<HomeFields>): HomeFields {
  const pick = <K extends keyof HomeFields>(key: K, fallback: HomeFields[K]): HomeFields[K] =>
    key in patch ? (patch[key] as HomeFields[K]) : (stored[key] ?? fallback)

  const merged: HomeFields = {
    showOnHome: pick('showOnHome', false),
    homeTitle: pick('homeTitle', null),
    homePriority: pick('homePriority', 0),
    homeAudience: pick('homeAudience', 'everyone'),
    homeAudienceRadiusKm: pick('homeAudienceRadiusKm', null),
    homeAudienceVehicleTypes: pick('homeAudienceVehicleTypes', null),
    vendorId: pick('vendorId', null),
    startsAt: pick('startsAt', null),
    endsAt: pick('endsAt', null),
  }

  if ('homeAudience' in patch) {
    if (merged.homeAudience !== 'near_this_garage' && !('homeAudienceRadiusKm' in patch)) {
      merged.homeAudienceRadiusKm = null
    }
    if (merged.homeAudience !== 'car_type' && !('homeAudienceVehicleTypes' in patch)) {
      merged.homeAudienceVehicleTypes = null
    }
  }
  if (merged.homeAudience === 'near_this_garage' && merged.homeAudienceRadiusKm === null && !('homeAudienceRadiusKm' in patch)) {
    merged.homeAudienceRadiusKm = DEFAULT_NEAR_RADIUS_KM
  }
  return merged
}

/**
 * Whether saving this audience must be refused because targeting is off.
 * Only an audience being set now is refused: an offer saved while targeting
 * was on can still have its title or dates edited once it is switched off,
 * even by a form that sends its unchanged audience back (Home simply stops
 * showing it).
 */
export function targetingRefused(
  audience: HomeAudience | undefined,
  targetingEnabled: boolean,
  storedAudience?: HomeAudience
): boolean {
  if (targetingEnabled || audience === undefined || audience === 'everyone') return false
  return audience !== storedAudience
}
