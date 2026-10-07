import { z } from 'zod'
import { createBookingSchema } from '../bookings/bookings.validation.js'

// An intent is priced from exactly the same request body a booking used to be
// created from, so the schema is shared rather than restated — the two must not
// drift, or checkout would validate one thing and book another.
export const createBookingIntentSchema = createBookingSchema

export type CreateBookingIntentInput = z.infer<typeof createBookingIntentSchema>

export const intentIdParamSchema = z.object({ id: z.string().uuid() })
