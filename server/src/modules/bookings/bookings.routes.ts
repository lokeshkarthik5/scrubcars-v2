import { zValidator } from '@hono/zod-validator'
import { Hono } from 'hono'
import {
  authMiddleware,
  requireCustomer,
  requireVendor,
  type AuthVariables,
} from '../../middleware/auth.middleware.js'
import * as bookingsController from './bookings.controller.js'
import {
  bookingIdParamSchema,
  cancelBookingSchema,
  createBookingSchema,
  listMyBookingsQuerySchema,
  listVendorBookingsQuerySchema,
  rescheduleBookingSchema,
} from './bookings.validation.js'
import type { Context } from 'hono'

export const bookingsRoutes = new Hono<{ Variables: AuthVariables }>()

// Cancel/reject can carry an optional { reason } JSON body. The body is
// optional, so parse leniently and fall back to no reason when absent.
async function parseCancelInput(c: Context) {
  const body = await c.req.json().catch(() => ({}))
  const parsed = cancelBookingSchema.safeParse(body ?? {})
  return parsed.success ? parsed.data : {}
}

bookingsRoutes.get(
  '/me',
  authMiddleware,
  requireCustomer,
  zValidator('query', listMyBookingsQuerySchema),
  (c) => bookingsController.listMyBookings(c, c.req.valid('query'))
)

bookingsRoutes.get(
  '/vendor',
  authMiddleware,
  requireVendor,
  zValidator('query', listVendorBookingsQuerySchema),
  (c) => bookingsController.listVendorBookings(c, c.req.valid('query'))
)

bookingsRoutes.post(
  '/',
  authMiddleware,
  requireCustomer,
  zValidator('json', createBookingSchema),
  (c) => bookingsController.createBooking(c, c.req.valid('json'))
)

bookingsRoutes.patch(
  '/:id/cancel',
  authMiddleware,
  requireCustomer,
  zValidator('param', bookingIdParamSchema),
  async (c) =>
    bookingsController.cancelBooking(
      c,
      c.req.valid('param').id,
      await parseCancelInput(c)
    )
)

bookingsRoutes.patch(
  '/:id/reschedule',
  authMiddleware,
  requireCustomer,
  zValidator('param', bookingIdParamSchema),
  zValidator('json', rescheduleBookingSchema),
  (c) =>
    bookingsController.rescheduleBooking(
      c,
      c.req.valid('param').id,
      c.req.valid('json')
    )
)

bookingsRoutes.patch(
  '/:id/accept',
  authMiddleware,
  requireVendor,
  zValidator('param', bookingIdParamSchema),
  (c) => bookingsController.acceptBooking(c, c.req.valid('param').id)
)

bookingsRoutes.patch(
  '/:id/reject',
  authMiddleware,
  requireVendor,
  zValidator('param', bookingIdParamSchema),
  async (c) =>
    bookingsController.rejectBooking(
      c,
      c.req.valid('param').id,
      await parseCancelInput(c)
    )
)

bookingsRoutes.patch(
  '/:id/progress',
  authMiddleware,
  requireVendor,
  zValidator('param', bookingIdParamSchema),
  (c) => bookingsController.markInProgress(c, c.req.valid('param').id)
)

bookingsRoutes.patch(
  '/:id/complete',
  authMiddleware,
  requireVendor,
  zValidator('param', bookingIdParamSchema),
  (c) => bookingsController.markCompleted(c, c.req.valid('param').id)
)

bookingsRoutes.get(
  '/:id',
  authMiddleware,
  zValidator('param', bookingIdParamSchema),
  (c) => bookingsController.getBookingDetail(c, c.req.valid('param').id)
)
