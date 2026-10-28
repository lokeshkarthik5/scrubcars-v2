import { z } from 'zod'
import { MAX_SERVICES_PER_BOOKING } from '../bookings/bookings.validation.js'
import { WINDOW_PARTS } from '../../lib/booking-requests.js'

const dateKey = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'A date as YYYY-MM-DD')

export const requestModeSchema = z.enum(['doorstep', 'pickup'])

/** `GET /booking-requests/windows`: the windows a garage can be asked for, for a job this long. */
export const windowsQuerySchema = z.object({
  vendorId: z.string().uuid(),
  mode: requestModeSchema,
  durationMins: z.coerce.number().int().min(5).max(24 * 60),
})

/** `POST /users/me/requests`: the customer's own car and saved address, never anyone else's. */
export const createRequestSchema = z
  .object({
    vendorId: z.string().uuid(),
    bookingType: requestModeSchema,
    serviceIds: z
      .array(z.string().uuid())
      .min(1)
      .max(MAX_SERVICES_PER_BOOKING)
      .transform((ids) => Array.from(new Set(ids))),
    vehicleId: z.string().uuid(),
    addressId: z.string().uuid(),
    window: z.object({ date: dateKey, part: z.enum(WINDOW_PARTS) }).strict(),
  })
  .strict()

export const requestIdParamSchema = z.object({ id: z.string().uuid() })

export const garageRequestsQuerySchema = z.object({
  scope: z.enum(['open', 'closed']).default('open'),
})

/** The garage's yes: a start time from its list and a travel fee of ₹0, ₹100 or ₹200. */
export const acceptRequestSchema = z
  .object({
    startAt: z.string().datetime(),
    travelFee: z.union([z.literal(0), z.literal(100), z.literal(200)]),
  })
  .strict()

export type WindowsQuery = z.infer<typeof windowsQuerySchema>
export type CreateRequestInput = z.infer<typeof createRequestSchema>
export type GarageRequestsQuery = z.infer<typeof garageRequestsQuerySchema>
export type AcceptRequestInput = z.infer<typeof acceptRequestSchema>
