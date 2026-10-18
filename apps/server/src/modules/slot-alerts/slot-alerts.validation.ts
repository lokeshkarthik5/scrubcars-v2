import { z } from 'zod'
import { SLOT_ALERT_WINDOWS } from '../../lib/slot-alerts.js'

// "Notify me if a slot opens" (0047). Strict: the customer is always the
// session's, so nothing in the body can name anyone else.
// Ids are checked for shape only (z.guid), like the slot list's service_id:
// seeded garages and services are not all version-4 UUIDs.
export const createSlotAlertSchema = z
  .object({
    vendorId: z.guid(),
    date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'date must be YYYY-MM-DD')
      // A real calendar day: 2026-02-31 would reach the database otherwise.
      .refine((date) => !Number.isNaN(Date.parse(`${date}T00:00:00Z`)) && new Date(`${date}T00:00:00Z`).toISOString().startsWith(date), 'date must be a real day'),
    window: z.enum(SLOT_ALERT_WINDOWS).default('any'),
    bookingType: z.enum(['dropin', 'doorstep', 'pickup']),
    // The services being booked together, as the slot picker sends them:
    // 1–10, no repeats.
    serviceIds: z
      .array(z.guid())
      .min(1)
      .max(10)
      .refine((ids) => new Set(ids).size === ids.length, 'serviceIds must not repeat'),
  })
  .strict()

export const slotAlertParamSchema = z.object({
  id: z.guid(),
})

export type CreateSlotAlertInput = z.infer<typeof createSlotAlertSchema>
