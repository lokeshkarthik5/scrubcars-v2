import { zValidator } from '@hono/zod-validator'
import { Hono } from 'hono'
import {
  authMiddleware,
  requireCustomer,
} from '../../middleware/auth.middleware.js'
import {
  requireVendorRole,
  resolveTenant,
  type TenantVariables,
} from '../../middleware/tenant.middleware.js'
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

export const bookingsRoutes = new Hono<{ Variables: TenantVariables }>()

// Cancel/reject can carry an optional { reason } JSON body. The body is
// optional, so parse leniently and fall back to no reason when absent.
// Jobs are the operator's whole job. Someone who can accept a booking but
// cannot mark it complete cannot do the work, so all four transitions — and the
// list they act on — are open to both roles. What operators do not get is the
// money: see the earnings boundary and the vendor booking mapper.
const jobMiddleware = [
  resolveTenant,
  requireVendorRole('vendor_admin', 'vendor_operator'),
] as const

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
  ...jobMiddleware,
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
  ...jobMiddleware,
  zValidator('param', bookingIdParamSchema),
  (c) => bookingsController.acceptBooking(c, c.req.valid('param').id)
)

bookingsRoutes.patch(
  '/:id/reject',
  authMiddleware,
  ...jobMiddleware,
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
  ...jobMiddleware,
  zValidator('param', bookingIdParamSchema),
  (c) => bookingsController.markInProgress(c, c.req.valid('param').id)
)

bookingsRoutes.patch(
  '/:id/complete',
  authMiddleware,
  ...jobMiddleware,
  zValidator('param', bookingIdParamSchema),
  (c) => bookingsController.markCompleted(c, c.req.valid('param').id)
)

// The customer's payment receipt. Customer-only and owner-only: unlike
// GET /:id, no garage member or support session reads it — it is the
// customer's own record of what they paid.
bookingsRoutes.get(
  '/:id/receipt',
  authMiddleware,
  requireCustomer,
  zValidator('param', bookingIdParamSchema),
  (c) => bookingsController.getReceipt(c, c.req.valid('param').id)
)

// × on Home's "Rate your wash" card. Owner-only: anyone else's booking is a
// 404, as for receipts and bills.
bookingsRoutes.post(
  '/:id/review-prompt/dismiss',
  authMiddleware,
  requireCustomer,
  zValidator('param', bookingIdParamSchema),
  (c) => bookingsController.dismissReviewPrompt(c, c.req.valid('param').id)
)

bookingsRoutes.get(
  '/:id',
  authMiddleware,
  zValidator('param', bookingIdParamSchema),
  (c) => bookingsController.getBookingDetail(c, c.req.valid('param').id)
)
