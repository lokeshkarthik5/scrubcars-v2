/**
 * "Estimated reach" on the admin's discount form: how many customers would
 * see an offer on Home today, before it is saved. Pure, with the clock passed
 * in.
 *
 * It asks the question Home asks — offerSkipReason in lib/offers.ts — once
 * per customer, of a draft offer that is live, unused and not dismissed, so
 * the count can only differ from Home where Home knows something the admin
 * page cannot:
 *
 *   - "Near this garage" is measured on Home from where the customer is when
 *     they open it, which is never stored. Here it is measured from their
 *     saved addresses, the nearest one, so it is an estimate and the form
 *     says so.
 *   - Usage limits and dismissals belong to a saved code and change daily;
 *     they are left out.
 *
 * The facts an audience reads are only gathered for that audience (see
 * discountsService.homeReach), and none at all while targeting is off.
 */
import { AppError } from './errors.js'
import {
  DEFAULT_NEAR_RADIUS_KM,
  homeFieldsProblem,
  mergeHomeFields,
  offerSkipReason,
  TARGETING_DISABLED_NOTE,
  targetingRefused,
  type CarType,
  type HomeAudience,
  type HomeFields,
  type HomeOfferRow,
} from './offers.js'

/** The form's settings as `GET /admin/discounts/home-reach` takes them. */
export interface ReachQuery {
  audience: HomeAudience
  vendorId?: string
  radiusKm?: number
  vehicleTypes?: CarType[]
}

/**
 * The settings to count, refused exactly as a save of them would be: a
 * targeted audience while targeting is off is a 409 TARGETING_DISABLED,
 * settings that do not fit together a 400 DISCOUNT_HOME_INVALID. Checked
 * before any customer data is read, so with targeting off a targeted count
 * reads nothing.
 */
export function reachSettings(query: ReachQuery, targetingEnabled: boolean): HomeFields {
  if (targetingRefused(query.audience, targetingEnabled)) {
    throw new AppError(409, TARGETING_DISABLED_NOTE, 'TARGETING_DISABLED')
  }

  const fields = mergeHomeFields({}, {
    homeAudience: query.audience,
    vendorId: query.vendorId ?? null,
    ...(query.radiusKm !== undefined ? { homeAudienceRadiusKm: query.radiusKm } : {}),
    ...(query.vehicleTypes !== undefined ? { homeAudienceVehicleTypes: query.vehicleTypes } : {}),
  })
  const problem = homeFieldsProblem(fields)
  if (problem) {
    throw new AppError(400, problem.message, 'DISCOUNT_HOME_INVALID')
  }
  return fields
}

/** What the draft offer on the form says, as far as reach is concerned. */
export interface ReachDraft {
  audience: HomeAudience
  vendorId: string | null
  /** "Near this garage" only; null takes the default 10 km. */
  radiusKm: number | null
  /** "Owners of a car type" only. */
  vehicleTypes: CarType[] | null
  /** The garage is live for customers (active, verified, pinned, not paused). */
  vendorPublic: boolean
}

/** One signed-in customer, with only the facts the chosen audience needs. */
export interface ReachCustomer {
  userId: string
  /** Types of their current (not archived) cars; empty means no car. */
  carTypes: CarType[]
  /** Garages they have a paid booking with. Empty when not gathered. */
  bookedVendorIds: Set<string>
  /** A wash is due or overdue on any of their cars. False when not gathered. */
  washDue: boolean
  /** Km from their nearest saved address to the garage. Null when unknown. */
  distanceKm: number | null
}

/**
 * The draft as Home's offer engine sees it: on Home, active, started, ending
 * tomorrow, used by nobody and closed by nobody, so only the garage and the
 * audience decide.
 */
export function draftOfferRow(draft: ReachDraft, now: Date): HomeOfferRow {
  return {
    id: 'draft',
    code: 'DRAFT',
    homeTitle: 'Draft',
    homePriority: 0,
    homeAudience: draft.audience,
    homeAudienceRadiusKm:
      draft.audience === 'near_this_garage' ? (draft.radiusKm ?? DEFAULT_NEAR_RADIUS_KM) : null,
    homeAudienceVehicleTypes: draft.audience === 'car_type' ? draft.vehicleTypes : null,
    discountType: 'percentage',
    percentOff: '10.00',
    amountOff: null,
    maxDiscountAmount: null,
    minOrderAmount: null,
    perUserLimit: null,
    totalUsageLimit: null,
    vendorId: draft.vendorId,
    vendorName: null,
    vendorPublic: draft.vendorPublic,
    vendorDistanceKm: null,
    showOnHome: true,
    isActive: true,
    startsAt: null,
    endsAt: new Date(now.getTime() + 24 * 60 * 60 * 1000),
    createdAt: now,
    dismissed: false,
  }
}

/** How many of `customers` would see the draft on Home now. */
export function countReach(
  draft: ReachDraft,
  customers: ReachCustomer[],
  options: { now: Date; targetingEnabled: boolean }
): number {
  const base = draftOfferRow(draft, options.now)
  const held = new Map<string, { total: number; byUser: number }>()
  let count = 0
  for (const customer of customers) {
    const row = { ...base, vendorDistanceKm: customer.distanceKm }
    const shown =
      offerSkipReason(row, {
        now: options.now,
        targetingEnabled: options.targetingEnabled,
        hasCar: customer.carTypes.length > 0,
        held,
        // As on Home: with targeting off nothing about the customer is passed.
        customer: options.targetingEnabled
          ? {
              bookedVendorIds: customer.bookedVendorIds,
              washDue: customer.washDue,
              carTypes: new Set(customer.carTypes),
            }
          : undefined,
      }) === null
    if (shown) count += 1
  }
  return count
}
