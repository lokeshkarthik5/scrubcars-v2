import { zValidator } from '@hono/zod-validator'
import { Hono } from 'hono'
import { z } from 'zod'
import {
  authMiddleware,
  requireSuperAdmin,
  type AuthVariables,
} from '../../middleware/auth.middleware.js'
import { rateLimiter } from '../../middleware/rate-limit.middleware.js'
import { adminDiscountRoutes } from '../discounts/discounts.routes.js'
import { adminNoticeRoutes } from '../notices/notices.routes.js'
import { adminRefundRoutes } from '../refunds/refunds.routes.js'
import {
  addMemberSchema,
  updateMemberSchema,
} from '../members/members.validation.js'
import * as adminController from './admin.controller.js'
import {
  adminCancelBookingSchema,
  bookingIdParamSchema,
  createBookingNoteSchema,
  createVendorSchema,
  grantSuperAdminSchema,
  listBookingsQuerySchema,
  markNoShowSchema,
  pilotStatsQuerySchema,
  superAdminIdParamSchema,
  loginSchema,
  mediaUrlSchema,
  pauseVendorSchema,
  updateVendorSchema,
  uploadUrlSchema,
} from './admin.validation.js'

export const adminRoutes = new Hono<{ Variables: AuthVariables }>()

const adminMiddleware = [authMiddleware, requireSuperAdmin] as const

const vendorIdParamSchema = z.object({ id: z.string().uuid() })

adminRoutes.post('/login', rateLimiter, zValidator('json', loginSchema), (c) =>
  adminController.login(c, c.req.valid('json'))
)
adminRoutes.post('/logout', adminController.logout)
adminRoutes.get('/me', ...adminMiddleware, adminController.getMe)

// Platform admin grants. Reachable only by an existing super-admin (or the
// break-glass session), never self-serve.
adminRoutes.get(
  '/super-admins',
  ...adminMiddleware,
  adminController.listSuperAdmins
)
adminRoutes.post(
  '/super-admins',
  ...adminMiddleware,
  zValidator('json', grantSuperAdminSchema),
  (c) => adminController.grantSuperAdmin(c, c.req.valid('json'))
)
adminRoutes.delete(
  '/super-admins/:id',
  ...adminMiddleware,
  zValidator('param', superAdminIdParamSchema),
  (c) => adminController.revokeSuperAdmin(c, c.req.valid('param').id)
)

adminRoutes.get('/vendors', ...adminMiddleware, adminController.listVendors)

// Supply-vs-demand by geographic cell: where customers are booking doorstep
// work with no garage nearby, i.e. where to recruit next.
adminRoutes.get(
  '/demand-supply',
  ...adminMiddleware,
  adminController.getDemandSupply
)
// The pilot's numbers for the last 7 or 30 days (?days=7|30).
adminRoutes.get(
  '/stats/pilot',
  ...adminMiddleware,
  zValidator('query', pilotStatsQuerySchema),
  (c) => adminController.getPilotStats(c, c.req.valid('query'))
)
adminRoutes.post(
  '/vendors',
  ...adminMiddleware,
  zValidator('json', createVendorSchema),
  (c) => adminController.createVendor(c, c.req.valid('json'))
)
adminRoutes.get(
  '/vendors/:id',
  ...adminMiddleware,
  zValidator('param', vendorIdParamSchema),
  (c) => adminController.getVendor(c, c.req.valid('param').id)
)
adminRoutes.patch(
  '/vendors/:id',
  ...adminMiddleware,
  zValidator('param', vendorIdParamSchema),
  zValidator('json', updateVendorSchema),
  (c) => adminController.updateVendor(c, c.req.valid('param').id, c.req.valid('json'))
)
adminRoutes.patch(
  '/vendors/:id/verify',
  ...adminMiddleware,
  zValidator('param', vendorIdParamSchema),
  (c) => adminController.verifyVendor(c, c.req.valid('param').id)
)
adminRoutes.patch(
  '/vendors/:id/archive',
  ...adminMiddleware,
  zValidator('param', vendorIdParamSchema),
  (c) => adminController.archiveVendor(c, c.req.valid('param').id)
)
adminRoutes.patch(
  '/vendors/:id/unarchive',
  ...adminMiddleware,
  zValidator('param', vendorIdParamSchema),
  (c) => adminController.unarchiveVendor(c, c.req.valid('param').id)
)
adminRoutes.delete(
  '/vendors/:id',
  ...adminMiddleware,
  zValidator('param', vendorIdParamSchema),
  (c) => adminController.deleteVendor(c, c.req.valid('param').id)
)
// Pause / resume new bookings on a garage's behalf. POST rather than the
// PATCH of verify/archive: these are actions with a body (the reason), not a
// flip of a column the list already shows.
adminRoutes.post(
  '/vendors/:id/pause',
  ...adminMiddleware,
  zValidator('param', vendorIdParamSchema),
  zValidator('json', pauseVendorSchema),
  (c) =>
    adminController.pauseVendor(c, c.req.valid('param').id, c.req.valid('json'))
)
adminRoutes.post(
  '/vendors/:id/resume',
  ...adminMiddleware,
  zValidator('param', vendorIdParamSchema),
  (c) => adminController.resumeVendor(c, c.req.valid('param').id)
)

// Vendor team. Ownership transfer is deliberately absent: adding, removing and
// changing roles is admin work, but reassigning who *owns* a business is a
// heavier act that stays owner-only.
const memberParamSchema = z.object({
  id: z.string().uuid(),
  memberId: z.string().uuid(),
})

adminRoutes.get(
  '/vendors/:id/members',
  ...adminMiddleware,
  zValidator('param', vendorIdParamSchema),
  (c) => adminController.listVendorMembers(c, c.req.valid('param').id)
)
adminRoutes.post(
  '/vendors/:id/members',
  ...adminMiddleware,
  zValidator('param', vendorIdParamSchema),
  zValidator('json', addMemberSchema),
  (c) =>
    adminController.addVendorMember(
      c,
      c.req.valid('param').id,
      c.req.valid('json')
    )
)
adminRoutes.patch(
  '/vendors/:id/members/:memberId',
  ...adminMiddleware,
  zValidator('param', memberParamSchema),
  zValidator('json', updateMemberSchema),
  (c) =>
    adminController.updateVendorMember(
      c,
      c.req.valid('param').id,
      c.req.valid('param').memberId,
      c.req.valid('json')
    )
)
adminRoutes.delete(
  '/vendors/:id/members/:memberId',
  ...adminMiddleware,
  zValidator('param', memberParamSchema),
  (c) =>
    adminController.removeVendorMember(
      c,
      c.req.valid('param').id,
      c.req.valid('param').memberId
    )
)

// Vendor media. Registered before the catch-all vendor routes above only in
// spirit — the extra path segments keep them distinct either way.
const photoParamSchema = z.object({
  id: z.string().uuid(),
  photoId: z.string().uuid(),
})
const serviceIdParamSchema = z.object({ serviceId: z.string().uuid() })
const serviceImageParamSchema = z.object({
  serviceId: z.string().uuid(),
  imageId: z.string().uuid(),
})

adminRoutes.post(
  '/vendors/:id/logo/upload-url',
  ...adminMiddleware,
  zValidator('param', vendorIdParamSchema),
  zValidator('json', uploadUrlSchema),
  (c) =>
    adminController.createVendorLogoUploadUrl(
      c,
      c.req.valid('param').id,
      c.req.valid('json')
    )
)
adminRoutes.put(
  '/vendors/:id/logo',
  ...adminMiddleware,
  zValidator('param', vendorIdParamSchema),
  zValidator('json', mediaUrlSchema),
  (c) =>
    adminController.setVendorLogo(c, c.req.valid('param').id, c.req.valid('json'))
)
adminRoutes.delete(
  '/vendors/:id/logo',
  ...adminMiddleware,
  zValidator('param', vendorIdParamSchema),
  (c) => adminController.deleteVendorLogo(c, c.req.valid('param').id)
)

// No list route: the vendor detail response already carries photos, so the
// editor never needs to fetch them separately.
adminRoutes.post(
  '/vendors/:id/photos/upload-url',
  ...adminMiddleware,
  zValidator('param', vendorIdParamSchema),
  zValidator('json', uploadUrlSchema),
  (c) =>
    adminController.createVendorPhotoUploadUrl(
      c,
      c.req.valid('param').id,
      c.req.valid('json')
    )
)
adminRoutes.post(
  '/vendors/:id/photos',
  ...adminMiddleware,
  zValidator('param', vendorIdParamSchema),
  zValidator('json', mediaUrlSchema),
  (c) =>
    adminController.addVendorPhoto(
      c,
      c.req.valid('param').id,
      c.req.valid('json')
    )
)
adminRoutes.delete(
  '/vendors/:id/photos/:photoId',
  ...adminMiddleware,
  zValidator('param', photoParamSchema),
  (c) =>
    adminController.deleteVendorPhoto(
      c,
      c.req.valid('param').id,
      c.req.valid('param').photoId
    )
)

// Service images are keyed by service alone: the admin editor already knows the
// service id, and the owning vendor is resolved from the row.
adminRoutes.post(
  '/services/:serviceId/images/upload-url',
  ...adminMiddleware,
  zValidator('param', serviceIdParamSchema),
  zValidator('json', uploadUrlSchema),
  (c) =>
    adminController.createServiceImageUploadUrl(
      c,
      c.req.valid('param').serviceId,
      c.req.valid('json')
    )
)
adminRoutes.post(
  '/services/:serviceId/images',
  ...adminMiddleware,
  zValidator('param', serviceIdParamSchema),
  zValidator('json', mediaUrlSchema),
  (c) =>
    adminController.addServiceImage(
      c,
      c.req.valid('param').serviceId,
      c.req.valid('json')
    )
)
adminRoutes.delete(
  '/services/:serviceId/images/:imageId',
  ...adminMiddleware,
  zValidator('param', serviceImageParamSchema),
  (c) =>
    adminController.deleteServiceImage(
      c,
      c.req.valid('param').serviceId,
      c.req.valid('param').imageId
    )
)

// Discount CRUD. Nested here rather than mounted at the app root because the
// admin session cookie is scoped to path=/api/v1/admin — anywhere else and the
// browser never sends it.
adminRoutes.route('/discounts', adminDiscountRoutes)

// Refunds owed and done, and recording one. Nested here for the same cookie
// reason as discounts.
adminRoutes.route('/refunds', adminRefundRoutes)

// Team notices on the customer Home and Updates. Nested here for the same
// cookie reason as discounts.
adminRoutes.route('/notices', adminNoticeRoutes)

adminRoutes.get(
  '/bookings',
  ...adminMiddleware,
  zValidator('query', listBookingsQuerySchema),
  (c) => adminController.listBookings(c, c.req.valid('query'))
)
adminRoutes.get(
  '/bookings/:id',
  ...adminMiddleware,
  zValidator('param', bookingIdParamSchema),
  (c) => adminController.getBooking(c, c.req.valid('param').id)
)

// Booking actions. Each one leaves an internal note behind, so the notes are a
// complete record of what ops did to a booking and who did it.
adminRoutes.post(
  '/bookings/:id/cancel',
  ...adminMiddleware,
  zValidator('param', bookingIdParamSchema),
  zValidator('json', adminCancelBookingSchema),
  (c) =>
    adminController.cancelBooking(c, c.req.valid('param').id, c.req.valid('json'))
)
adminRoutes.post(
  '/bookings/:id/no-show',
  ...adminMiddleware,
  zValidator('param', bookingIdParamSchema),
  zValidator('json', markNoShowSchema),
  (c) =>
    adminController.markBookingNoShow(
      c,
      c.req.valid('param').id,
      c.req.valid('json')
    )
)
adminRoutes.post(
  '/bookings/:id/notes',
  ...adminMiddleware,
  zValidator('param', bookingIdParamSchema),
  zValidator('json', createBookingNoteSchema),
  (c) =>
    adminController.addBookingNote(c, c.req.valid('param').id, c.req.valid('json'))
)
