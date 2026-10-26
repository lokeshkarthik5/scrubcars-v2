import { AppError, hasPgCode } from '../../lib/errors.js'
import {
  assertRuleApplies,
  computeDiscount,
  type DiscountFundedBy,
  type DiscountRule,
} from '../../lib/discounts.js'
import { bannedPhraseIn } from '../../lib/copy-rules.js'
import { categoryLabel } from '../../lib/categories.js'
import { eligibleSubtotal as eligibleSubtotalOf } from '../../lib/coupons.js'
import { env } from '../../lib/env.js'
import { logger } from '../../lib/logger.js'
import {
  DEFAULT_NEAR_RADIUS_KM,
  HOME_AUDIENCE_LABELS,
  HOME_AUDIENCES,
  HOME_FIELD_KEYS,
  HOME_PRIORITIES,
  homeFieldsProblem,
  MAX_HOME_OFFERS,
  MAX_NEAR_RADIUS_KM,
  mergeHomeFields,
  TARGETING_DISABLED_NOTE,
  targetingRefused,
  type HomeFields,
} from '../../lib/offers.js'
import { countReach, reachSettings, type ReachCustomer } from '../../lib/offer-reach.js'
import { computeServiceAmount, sumAmounts } from '../../lib/pricing.js'
import { isWashDue, washStatus } from '../../lib/wash-status.js'
import { discountsRepository } from './discounts.repository.js'
import { rewardsLive } from '../rewards/rewards.settings.js'
import type {
  CreateDiscountInput,
  HomeReachQuery,
  ListDiscountsQuery,
  UpdateDiscountInput,
  ValidateDiscountInput,
} from './discounts.validation.js'

const log = logger.child({ module: 'discounts' })

export interface ResolvedDiscount {
  discountId: string
  code: string
  discountAmount: string
  finalAmount: string
  fundedBy: DiscountFundedBy
  // Carried back so the booking transaction can re-check them under a lock
  // without a second read.
  perUserLimit: number | null
  totalUsageLimit: number | null
}

/**
 * Postgres check_violation: a row 0031's Home CHECKs (or an older one)
 * refuse. The service checks the merged row first, so reaching this means the
 * two disagree; it is still the admin's input, so a 400 rather than a 500.
 */
function isCheckViolation(err: unknown): boolean {
  return hasPgCode(err, '23514')
}

function checkViolation() {
  return new AppError(
    400,
    "These settings don't fit together. Check the Show on Home fields and the dates.",
    'DISCOUNT_INVALID'
  )
}

/** Postgres unique_violation — the case-insensitive index on lower(code). */
function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code?: string }).code === '23505'
  )
}

const money = (value: number | null | undefined): string | null =>
  typeof value === 'number' ? value.toFixed(2) : null

const toDate = (value: string | null | undefined): Date | null =>
  value ? new Date(value) : null

/**
 * Resolve a typed code against a booking, or throw the reason it does not
 * apply. **This is the only place a discount amount is computed** — the
 * preview endpoint and the booking write path both come through here, so a
 * preview can never disagree with what is charged.
 */
export async function resolveDiscount(input: {
  code: string
  userId: string
  vendorId: string
  subtotal: string
  /**
   * Each line's service category and price, for a code limited to one
   * service type (a printed coupon's voucher, 0056). Both callers pass
   * them; without them such a code applies to nothing.
   */
  lines?: ReadonlyArray<{ category: string; amount: string }>
}): Promise<ResolvedDiscount> {
  const discount = await discountsRepository.findByCode(input.code)

  if (!discount) {
    throw new AppError(400, "This code isn't valid.", 'DISCOUNT_NOT_FOUND')
  }

  // A Detlio Rewards voucher (0050) is a promo code that belongs to one
  // customer: anyone else gets the same answer as a code that does not
  // exist, so a voucher code is worth nothing to anyone it is passed to.
  // Only while rewards are live (REWARDS_ENABLED and the admin switch); a voucher the team cancelled is gone. Its
  // once-only limit, expiry and Detlio funding are its discounts row's,
  // checked below like any code.
  if (discount.source === 'reward') {
    if (!(await rewardsLive())) {
      throw new AppError(400, "Rewards are paused right now, so this voucher can't be used.", 'REWARDS_PAUSED')
    }
    const voucher = await discountsRepository.findRewardVoucher(discount.id)
    if (!voucher || voucher.userId !== input.userId || voucher.cancelledAt) {
      throw new AppError(400, "This code isn't valid.", 'DISCOUNT_NOT_FOUND')
    }
  }

  // A printed coupon's voucher (0056) belongs to the customer who added it,
  // exactly like a reward voucher, but works whatever REWARDS_ENABLED says.
  // Not once the team voided its coupon. "New customers only" is checked
  // again here, so a voucher added before a first booking can't ride on a
  // later one: any booking whose money landed and was kept (a cancelled one
  // gives the voucher back and does not count).
  let eligibleSubtotal: string | undefined
  if (discount.source === 'coupon') {
    const voucher = await discountsRepository.findCouponVoucher(discount.id)
    if (!voucher || voucher.userId !== input.userId || voucher.cancelledAt) {
      throw new AppError(400, "This code isn't valid.", 'DISCOUNT_NOT_FOUND')
    }
    if (voucher.newCustomersOnly && (await discountsRepository.hasKeptBooking(input.userId))) {
      throw new AppError(400, 'This coupon is for your first booking on Detlio.', 'COUPON_NOT_NEW')
    }
  }

  // Everything judgeable from the row alone: active, window, vendor scope,
  // minimum order.
  assertRuleApplies(discount as DiscountRule, {
    vendorId: input.vendorId,
    subtotal: input.subtotal,
  })

  // A coupon voucher limited to one service type (0056) needs one in the
  // booking, and comes off those lines only.
  if (discount.source === 'coupon' && discount.serviceCategory) {
    const eligible = eligibleSubtotalOf(input.lines ?? [], discount.serviceCategory)
    if (eligible === null) {
      throw new AppError(
        400,
        `This coupon is for ${categoryLabel(discount.serviceCategory).toLowerCase()} services. Add one to use it.`,
        'DISCOUNT_NOT_FOR_SERVICE'
      )
    }
    eligibleSubtotal = eligible
  }

  // Then the two that need a count. Total first: "this code is gone" is more
  // useful to a customer than "you've used it before" when both are true.
  if (discount.totalUsageLimit !== null) {
    const used = await discountsRepository.countHeld(discount.id)

    if (used >= discount.totalUsageLimit) {
      throw new AppError(
        400,
        'This code has been fully redeemed.',
        'DISCOUNT_EXHAUSTED'
      )
    }
  }

  if (discount.perUserLimit !== null) {
    const usedByUser = await discountsRepository.countHeld(
      discount.id,
      input.userId
    )

    if (usedByUser >= discount.perUserLimit) {
      throw new AppError(
        400,
        "You've already used this code.",
        'DISCOUNT_ALREADY_USED'
      )
    }
  }

  const { discountAmount, finalAmount } = computeDiscount(
    discount,
    input.subtotal,
    eligibleSubtotal
  )

  return {
    discountId: discount.id,
    code: discount.code,
    discountAmount,
    finalAmount,
    fundedBy: discount.fundedBy,
    perUserLimit: discount.perUserLimit,
    totalUsageLimit: discount.totalUsageLimit,
  }
}

function toDiscountResponse(
  discount: {
    id: string
    code: string
    description: string | null
    discountType: string
    percentOff: string | null
    amountOff: string | null
    maxDiscountAmount: string | null
    minOrderAmount: string | null
    perUserLimit: number | null
    totalUsageLimit: number | null
    vendorId: string | null
    fundedBy: string
    startsAt: Date | null
    endsAt: Date | null
    isActive: boolean
    showOnHome: boolean
    homeTitle: string | null
    homePriority: number
    homeAudience: string
    homeAudienceRadiusKm: number | null
    homeAudienceVehicleTypes: string[] | null
    createdAt: Date
    vendor?: { id: string; businessName: string } | null
  },
  usage?: {
    redemptionCount: number
    heldCount: number
    realizedCount: number
    totalSaved: string
  }
) {
  return {
    id: discount.id,
    code: discount.code,
    description: discount.description,
    discountType: discount.discountType,
    percentOff: discount.percentOff,
    amountOff: discount.amountOff,
    maxDiscountAmount: discount.maxDiscountAmount,
    minOrderAmount: discount.minOrderAmount,
    perUserLimit: discount.perUserLimit,
    totalUsageLimit: discount.totalUsageLimit,
    vendorId: discount.vendorId,
    vendorName: discount.vendor?.businessName ?? null,
    fundedBy: discount.fundedBy,
    startsAt: discount.startsAt?.toISOString() ?? null,
    endsAt: discount.endsAt?.toISOString() ?? null,
    isActive: discount.isActive,
    showOnHome: discount.showOnHome,
    homeTitle: discount.homeTitle,
    homePriority: discount.homePriority,
    homeAudience: discount.homeAudience,
    homeAudienceRadiusKm: discount.homeAudienceRadiusKm,
    homeAudienceVehicleTypes: discount.homeAudienceVehicleTypes,
    createdAt: discount.createdAt.toISOString(),
    redemptionCount: usage?.redemptionCount ?? 0,
    heldCount: usage?.heldCount ?? 0,
    realizedCount: usage?.realizedCount ?? 0,
    totalSaved: usage?.totalSaved ?? '0.00',
  }
}

/** Only the keys actually present, so PATCH stays partial. */
function toRowValues(input: UpdateDiscountInput) {
  const values: Record<string, unknown> = {}

  if ('code' in input) values.code = input.code
  if ('description' in input) values.description = input.description ?? null
  if ('discountType' in input) values.discountType = input.discountType
  if ('percentOff' in input) values.percentOff = money(input.percentOff)
  if ('amountOff' in input) values.amountOff = money(input.amountOff)
  if ('maxDiscountAmount' in input) {
    values.maxDiscountAmount = money(input.maxDiscountAmount)
  }
  if ('minOrderAmount' in input) {
    values.minOrderAmount = money(input.minOrderAmount)
  }
  if ('perUserLimit' in input) values.perUserLimit = input.perUserLimit ?? null
  if ('totalUsageLimit' in input) {
    values.totalUsageLimit = input.totalUsageLimit ?? null
  }
  if ('vendorId' in input) values.vendorId = input.vendorId ?? null
  if ('fundedBy' in input) values.fundedBy = input.fundedBy
  if ('startsAt' in input) values.startsAt = toDate(input.startsAt)
  if ('endsAt' in input) values.endsAt = toDate(input.endsAt)
  if ('isActive' in input) values.isActive = input.isActive
  if ('showOnHome' in input) values.showOnHome = input.showOnHome
  if ('homeTitle' in input) values.homeTitle = input.homeTitle?.trim() || null
  if ('homePriority' in input) values.homePriority = input.homePriority
  if ('homeAudience' in input) values.homeAudience = input.homeAudience
  if ('homeAudienceRadiusKm' in input) {
    values.homeAudienceRadiusKm = input.homeAudienceRadiusKm ?? null
  }
  if ('homeAudienceVehicleTypes' in input) {
    values.homeAudienceVehicleTypes = input.homeAudienceVehicleTypes ?? null
  }

  return values
}

/**
 * Checks a code's Home fields as a whole and writes the merged values back
 * into `values`. Throws the first problem as a 400, a non-everyone audience
 * while targeting is off as a 409, and banned words in the title as a 400.
 */
function applyHomeFields(
  stored: Partial<HomeFields>,
  values: Record<string, unknown>,
  input: UpdateDiscountInput
) {
  if (targetingRefused(input.homeAudience, env.homeOfferTargeting, stored.homeAudience)) {
    throw new AppError(409, TARGETING_DISABLED_NOTE, 'TARGETING_DISABLED')
  }

  const patch = Object.fromEntries(
    HOME_FIELD_KEYS.filter((key) => key in values).map((key) => [key, values[key]])
  ) as Partial<HomeFields>
  const merged = mergeHomeFields(stored, patch)
  const problem = homeFieldsProblem(merged)
  if (problem) {
    throw new AppError(400, problem.message, 'DISCOUNT_HOME_INVALID')
  }

  if (merged.homeTitle) {
    const banned = bannedPhraseIn(merged.homeTitle)
    if (banned) {
      throw new AppError(
        400,
        `Offer titles can't say "${banned}". Describe what the code gives, plainly.`,
        'COPY_NOT_ALLOWED'
      )
    }
  }

  values.homeAudienceRadiusKm = merged.homeAudienceRadiusKm
  values.homeAudienceVehicleTypes = merged.homeAudienceVehicleTypes
}

// Switching a code's effect must not leave the old effect's columns behind:
// a percentage row that keeps a stale amountOff would fail the check
// constraint, and a fixed row that keeps percentOff would price twice.
function clearOppositeEffect(
  values: Record<string, unknown>,
  discountType: string | undefined
) {
  if (discountType === 'percentage') {
    values.amountOff = null
  }
  if (discountType === 'fixed') {
    values.percentOff = null
    values.maxDiscountAmount = null
  }
}

// A single indexed lookup, and deliberately not restricted to the picker's
// list: that list hides archived garages, so checking against it would 404 when
// an admin edits an existing discount whose garage was archived later.
async function assertVendorExists(vendorId: string | null | undefined) {
  if (!vendorId) return

  if (!(await discountsRepository.vendorExists(vendorId))) {
    throw new AppError(404, 'Vendor not found', 'VENDOR_NOT_FOUND')
  }
}

export const discountsService = {
  resolveDiscount,

  /**
   * Customer-facing preview. Recomputes the subtotal from the service and the
   * customer's vehicle — the client never gets to name a price — then resolves
   * the code. Non-binding: `POST /bookings` resolves again.
   */
  async validateForCustomer(userId: string, input: ValidateDiscountInput) {
    const { services, vehicle } = await discountsRepository.findPricingContext({
      vendorId: input.vendorId,
      serviceIds: input.serviceIds,
      userId,
      vehicleId: input.vehicleId,
    })

    if (services.some((service) => !service || !service.isActive)) {
      throw new AppError(404, 'Service not found', 'SERVICE_NOT_FOUND')
    }

    if (!vehicle) {
      throw new AppError(404, 'Vehicle not found', 'VEHICLE_NOT_FOUND')
    }

    // The whole cart, priced the way the booking will price it: a minimum
    // order value has to be tested against the total the customer will pay,
    // not against whichever service happened to be first.
    const lineAmounts = services.map((service) => {
      const lineAmount = computeServiceAmount(service!, vehicle.vehicleType)

      if (lineAmount === null) {
        throw new AppError(
          400,
          `${service!.name} is not priced for your vehicle type yet. Remove it, or contact the garage.`,
          'SERVICE_NOT_PRICED_FOR_VEHICLE'
        )
      }

      return lineAmount
    })

    const subtotal = sumAmounts(lineAmounts)

    const resolved = await resolveDiscount({
      code: input.code,
      userId,
      vendorId: input.vendorId,
      subtotal,
      lines: services.map((service, index) => ({ category: service!.category, amount: lineAmounts[index]! })),
    })

    log.info(
      { userId, code: resolved.code, discountAmount: resolved.discountAmount },
      'discount:preview_applied'
    )

    return {
      code: resolved.code,
      discountAmount: resolved.discountAmount,
      subtotal,
      finalAmount: resolved.finalAmount,
    }
  },

  async listDiscounts(query: ListDiscountsQuery) {
    const [rows, usage] = await Promise.all([
      discountsRepository.listDiscounts({
        q: query.q,
        active: query.active === undefined ? undefined : query.active === 'true',
      }),
      discountsRepository.usageByDiscount(),
    ])

    return rows.map((row) => toDiscountResponse(row, usage.get(row.id)))
  },

  async getDiscount(id: string) {
    const discount = await discountsRepository.findDetailById(id)

    if (!discount) {
      throw new AppError(404, 'Discount not found', 'DISCOUNT_NOT_FOUND')
    }

    const usage = await discountsRepository.usageByDiscount(discount.id)

    return toDiscountResponse(discount, usage.get(discount.id))
  },

  async createDiscount(input: CreateDiscountInput) {
    await assertVendorExists(input.vendorId)

    const values = toRowValues(input)
    clearOppositeEffect(values, input.discountType)
    applyHomeFields({}, values, input)

    try {
      const created = await discountsRepository.createDiscount(
        values as Parameters<typeof discountsRepository.createDiscount>[0]
      )
      log.info({ discountId: created.id, code: created.code }, 'discount:created')
      return toDiscountResponse(created)
    } catch (err) {
      if (isCheckViolation(err)) throw checkViolation()
      if (isUniqueViolation(err)) {
        throw new AppError(
          409,
          'That code already exists.',
          'DISCOUNT_CODE_TAKEN'
        )
      }
      throw err
    }
  },

  async updateDiscount(id: string, input: UpdateDiscountInput) {
    const existing = await discountsRepository.findById(id)

    if (!existing) {
      throw new AppError(404, 'Discount not found', 'DISCOUNT_NOT_FOUND')
    }

    await assertVendorExists(input.vendorId)

    // A PATCH that omits `discountType` is still a PATCH *of* a typed row, and
    // the Zod refinement can only see the payload. Reconcile against the stored
    // type here so `{ percentOff: 20 }` on a flat discount is rejected rather
    // than writing a percent_off the engine will silently ignore.
    const effectiveType = input.discountType ?? existing.discountType

    if (effectiveType === 'percentage' && typeof input.amountOff === 'number') {
      throw new AppError(
        400,
        'A percentage discount cannot also have a flat amount',
        'DISCOUNT_EFFECT_MISMATCH'
      )
    }

    if (
      effectiveType === 'fixed' &&
      (typeof input.percentOff === 'number' ||
        typeof input.maxDiscountAmount === 'number')
    ) {
      throw new AppError(
        400,
        'A flat discount cannot have a percentage or a maximum',
        'DISCOUNT_EFFECT_MISMATCH'
      )
    }

    const values = toRowValues(input)
    clearOppositeEffect(values, effectiveType)
    // Judged on the merged row: a PATCH that only clears `endsAt` on a code
    // shown on Home is refused here, not by the database.
    applyHomeFields(existing, values, input)

    try {
      const updated = await discountsRepository.updateDiscount(id, values)
      log.info({ discountId: id }, 'discount:updated')
      return toDiscountResponse(updated)
    } catch (err) {
      if (isCheckViolation(err)) throw checkViolation()
      if (isUniqueViolation(err)) {
        throw new AppError(
          409,
          'That code already exists.',
          'DISCOUNT_CODE_TAKEN'
        )
      }
      throw err
    }
  },

  /**
   * Hard-deletes only a code nobody has used. Once a redemption exists the
   * audit trail outranks tidiness: 409, and the admin deactivates instead.
   */
  async deleteDiscount(id: string) {
    const existing = await discountsRepository.findById(id)

    if (!existing) {
      throw new AppError(404, 'Discount not found', 'DISCOUNT_NOT_FOUND')
    }

    if (await discountsRepository.hasRedemptions(id)) {
      throw new AppError(
        409,
        'This code has already been used. Deactivate it instead.',
        'DISCOUNT_IN_USE'
      )
    }

    await discountsRepository.deleteDiscount(id)
    log.info({ discountId: id, code: existing.code }, 'discount:deleted')

    return { id }
  },

  listVendorOptions() {
    return discountsRepository.listVendorOptions()
  },

  /**
   * What the admin form needs for "Show on Home": the priorities, the
   * audiences, and whether audiences other than 'everyone' can be saved
   * (HOME_OFFER_TARGETING). While they cannot, the form shows them disabled
   * with `targetingNote`.
   */
  homeConfig() {
    return {
      targetingEnabled: env.homeOfferTargeting,
      targetingNote: env.homeOfferTargeting ? null : TARGETING_DISABLED_NOTE,
      maxOffersOnHome: MAX_HOME_OFFERS,
      priorities: HOME_PRIORITIES,
      audiences: HOME_AUDIENCES.map((value) => ({
        value,
        label: HOME_AUDIENCE_LABELS[value],
        enabled: value === 'everyone' || env.homeOfferTargeting,
      })),
      defaultNearRadiusKm: DEFAULT_NEAR_RADIUS_KM,
      maxNearRadiusKm: MAX_NEAR_RADIUS_KM,
    }
  },

  /**
   * "Estimated reach" on the form: how many customers the Show on Home
   * settings would reach today, counted by Home's own rule (lib/offer-reach.ts).
   * Refused as a save would be: a targeted audience while targeting is off
   * (409), settings that do not fit together (400). Only the facts the
   * audience reads are loaded, so "Everyone" reads no booking history or
   * location.
   */
  async homeReach(query: HomeReachQuery, now = new Date()) {
    const targeting = env.homeOfferTargeting
    const fields = reachSettings(query, targeting)

    let vendorPublic = true
    if (fields.vendorId) {
      const isPublic = await discountsRepository.vendorIsPublic(fields.vendorId)
      if (isPublic === null) {
        throw new AppError(404, 'Vendor not found', 'VENDOR_NOT_FOUND')
      }
      vendorPublic = isPublic
    }

    const base = await discountsRepository.listReachCustomers()
    const booked =
      fields.homeAudience === 'new_customers' || fields.homeAudience === 'booked_this_garage'
        ? await discountsRepository.paidBookingGarages()
        : null
    const distances =
      fields.homeAudience === 'near_this_garage' && fields.vendorId
        ? await discountsRepository.nearestAddressKm(fields.vendorId)
        : null
    let washDueUsers: Set<string> | null = null
    if (fields.homeAudience === 'wash_due') {
      washDueUsers = new Set()
      for (const car of await discountsRepository.carWashFacts(now)) {
        const status = washStatus({
          intervalDays: car.intervalDays,
          lastWashAt: car.lastWashAt,
          // Only whether one exists matters here: a booked car is never due.
          bookedFor: car.booked ? { bookingId: 'booked', scheduledAt: now } : null,
          now,
        })
        if (isWashDue(status)) washDueUsers.add(car.userId)
      }
    }

    const customers: ReachCustomer[] = base.map((row) => ({
      userId: row.userId,
      carTypes: row.carTypes,
      bookedVendorIds: booked?.get(row.userId) ?? new Set(),
      washDue: washDueUsers?.has(row.userId) ?? false,
      distanceKm: distances?.get(row.userId) ?? null,
    }))

    return {
      count: countReach(
        {
          audience: fields.homeAudience,
          vendorId: fields.vendorId,
          radiusKm: fields.homeAudienceRadiusKm,
          vehicleTypes: fields.homeAudienceVehicleTypes,
          vendorPublic,
        },
        customers,
        { now, targetingEnabled: targeting }
      ),
      /** Null for a Detlio-wide code; false means the card shows to nobody. */
      garagePublic: fields.vendorId ? vendorPublic : null,
      /** "Near this garage" is measured from saved addresses, not live location. */
      measuredFrom: fields.homeAudience === 'near_this_garage' ? 'saved_addresses' : null,
    }
  },
}
