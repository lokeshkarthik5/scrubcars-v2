import { z } from 'zod'
import { signedActorName } from '../../lib/admin-actor.js'
import { PICKUP_FEE_MODES } from '../../lib/pickup-fee.js'

const rupees = z.number().int().min(0).max(10_000)
const km = z.number().min(0).max(100)

/** A fee choice: the mode and its numbers (an empty distance number is Detlio's). */
export const garageFeeSchema = z
  .object({
    mode: z.enum(PICKUP_FEE_MODES),
    fixed: rupees.nullable().optional(),
    freeKm: km.nullable().optional(),
    perKm: rupees.nullable().optional(),
    minCharge: rupees.nullable().optional(),
    maxCharge: rupees.nullable().optional(),
  })
  .strict()
  .transform((fee) => ({
    mode: fee.mode,
    fixed: fee.fixed ?? null,
    freeKm: fee.freeKm ?? null,
    perKm: fee.perKm ?? null,
    minCharge: fee.minCharge ?? null,
    maxCharge: fee.maxCharge ?? null,
  }))

const range = z.object({ min: z.number(), max: z.number() }).strict()

/** Admin Settings → Pickup fee: the whole page, saved on tap. Checked against the hard caps by the service. */
export const pickupFeeSettingsSchema = z
  .object({
    suggested: z
      .object({
        freeKm: z.number(),
        perKm: z.number(),
        minCharge: z.number(),
        maxCharge: z.number(),
        roundTo: z.number(),
        roadFactor: z.number(),
      })
      .strict(),
    limits: z
      .object({
        freeKm: range,
        perKm: range,
        minCharge: range,
        maxCharge: z.number(),
        fixedMax: z.number(),
        askRaisePct: z.number(),
        changeEveryDays: z.number(),
      })
      .strict(),
    convenienceFee: z.number(),
    actorName: signedActorName,
  })
  .strict()

export const adminGarageFeeSchema = z
  .object({ fee: garageFeeSchema, actorName: signedActorName })
  .strict()

export const lockSchema = z.object({ locked: z.boolean(), actorName: signedActorName }).strict()

export const decideSchema = z
  .object({
    decision: z.enum(['approved', 'kept']),
    reason: z.string().trim().max(300).optional(),
    actorName: signedActorName,
  })
  .strict()

export const vendorIdParamSchema = z.object({ vendorId: z.uuid() })
export const changeIdParamSchema = z.object({ changeId: z.uuid() })
export const listQuerySchema = z.object({ show: z.enum(['waiting', 'approved', 'kept']).default('waiting') })

export type GarageFeeInput = z.infer<typeof garageFeeSchema>
export type PickupFeeSettingsInput = z.infer<typeof pickupFeeSettingsSchema>
