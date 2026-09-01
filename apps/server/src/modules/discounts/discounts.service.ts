import { AppError } from '../../lib/errors.js'
import {
  assertRuleApplies,
  computeDiscount,
  type DiscountFundedBy,
  type DiscountRule,
} from '../../lib/discounts.js'
import { logger } from '../../lib/logger.js'
import { computeServiceAmount, sumAmounts } from '../../lib/pricing.js'
import { discountsRepository } from './discounts.repository.js'
import type {
  CreateDiscountInput,
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
}): Promise<ResolvedDiscount> {
  const discount = await discountsRepository.findByCode(input.code)

  if (!discount) {
    throw new AppError(400, "This code isn't valid.", 'DISCOUNT_NOT_FOUND')
  }

  // Everything judgeable from the row alone: active, window, vendor scope,
  // minimum order.
  assertRuleApplies(discount as DiscountRule, {
    vendorId: input.vendorId,
    subtotal: input.subtotal,
  })

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
    input.subtotal
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

  return values
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

    try {
      const created = await discountsRepository.createDiscount(
        values as Parameters<typeof discountsRepository.createDiscount>[0]
      )
      log.info({ discountId: created.id, code: created.code }, 'discount:created')
      return toDiscountResponse(created)
    } catch (err) {
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

    try {
      const updated = await discountsRepository.updateDiscount(id, values)
      log.info({ discountId: id }, 'discount:updated')
      return toDiscountResponse(updated)
    } catch (err) {
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
}
