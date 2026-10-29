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
import { vendorFinalBillRoutes } from '../booking-charges/booking-charges.routes.js'
import { jobPhotosRoutes } from '../job-photos/job-photos.routes.js'
import { vendorTimeProposalRoutes } from '../time-proposals/time-proposals.routes.js'
import { membersRoutes } from '../members/members.routes.js'
import { vendorEarningsRoutes } from '../payouts/payouts.routes.js'
import { garageMediaRoutes } from '../service-media/service-media.routes.js'
import { garageDocumentRoutes } from '../vendor-documents/vendor-documents.routes.js'
import { garagePushRoutes } from '../push/push.routes.js'
import { garageCertificationRoutes } from '../certification/certification.routes.js'
import { garageAgreementRoutes } from '../agreements/agreements.routes.js'
import { garageTierRoutes } from '../tiers/tiers.routes.js'
import { garageGuaranteeRoutes } from '../guarantee/guarantee.routes.js'
import { garageBookingRequestRoutes } from '../booking-requests/booking-requests.routes.js'
import * as vendorsController from './vendors.controller.js'
import {
  createClosureSchema,
  createPhotoSchema,
  createPackageSchema,
  createServiceAreaSchema,
  createServiceSchema,
  createVendorSchema,
  earningsQuerySchema,
  listPublicVendorsQuerySchema,
  logoUploadUrlSchema,
  pauseBookingsSchema,
  photoUploadUrlSchema,
  reorderPhotosSchema,
  serviceImageParamSchema,
  serviceImageUploadUrlSchema,
  setLogoSchema,
  resourceIdParamSchema,
  rescheduleSlotsParamSchema,
  setWorkingHoursSchema,
  slotsQuerySchema,
  toggleServiceActiveSchema,
  updateJobTypesSchema,
  updatePackageSchema,
  updateServiceSchema,
  updateSlotIntervalSchema,
  updateVendorSchema,
  vendorIdParamSchema,
  doorstepAreaSchema,
} from './vendors.validation.js'
import { addPhotoSchema } from '../service-media/service-media.validation.js'

export const vendorsRoutes = new Hono<{ Variables: TenantVariables }>()

// Every /me route resolves the active company from the session or the
// X-Vendor-Id header before the handler runs. `/me` is unchanged as a path —
// what it means is now "the company I am acting as", not "the company I own".
//
// Default deny: the shared chain is vendor_admin-only, so a route added to this
// file is never accidentally exposed to operators. Widening is deliberate, and
// there is exactly one widened route below (plus the job records mounted under
// /me/bookings, which widen in their own files).
const tenantMiddleware = [
  authMiddleware,
  resolveTenant,
  requireVendorRole('vendor_admin'),
] as const

// Reading the company profile is the one thing an operator needs from this
// module: the vendor app renders the business name and logo in its shell on
// every screen, including the job list. Writing it (PATCH /me) stays admin-only,
// as does everything else here — money, settings, catalogue and members.
const anyMemberMiddleware = [
  authMiddleware,
  resolveTenant,
  requireVendorRole('vendor_admin', 'vendor_operator'),
] as const

vendorsRoutes.get(
  '/',
  zValidator('query', listPublicVendorsQuerySchema),
  (c) => vendorsController.listPublicVendors(c, c.req.valid('query'))
)

vendorsRoutes.post(
  '/',
  authMiddleware,
  zValidator('json', createVendorSchema),
  (c) => vendorsController.createVendor(c, c.req.valid('json'))
)

vendorsRoutes.get('/me', ...anyMemberMiddleware, vendorsController.getMyVendor)
vendorsRoutes.patch(
  '/me',
  ...tenantMiddleware,
  zValidator('json', updateVendorSchema),
  (c) => vendorsController.updateVendor(c, c.req.valid('json'))
)
vendorsRoutes.patch(
  '/me/job-types',
  ...tenantMiddleware,
  zValidator('json', updateJobTypesSchema),
  (c) => vendorsController.updateJobTypes(c, c.req.valid('json'))
)
vendorsRoutes.patch(
  '/me/slot-interval',
  ...tenantMiddleware,
  zValidator('json', updateSlotIntervalSchema),
  (c) => vendorsController.updateSlotInterval(c, c.req.valid('json'))
)

// The only endpoint that serves money. Everything an operator must not see —
// the payout split, the discount breakdown and every aggregate — lives behind
// this one role check, rather than being conditionally stripped from a shared
// booking payload.
vendorsRoutes.get(
  '/me/earnings',
  ...tenantMiddleware,
  zValidator('query', earningsQuerySchema),
  (c) => vendorsController.getEarnings(c, c.req.valid('query'))
)

// The team screen. Nested here so it inherits the /vendors/me prefix — the
// company it acts on is the one resolveTenant produced, never a path parameter.
vendorsRoutes.route('/me/members', membersRoutes)

// The Earnings statement (GET /me/earnings/statement): each booking's
// commission, share and payout. vendor_admin only in its own file, like the
// summary above, and nested for the same reason as the team screen.
vendorsRoutes.route('/me/earnings', vendorEarningsRoutes)

// A job's records: before/after photos and the final bill of an inspection
// job. Nested here for the same reason as the team screen. Both are widened
// to operators in their own files, deliberately — the people who do the work
// take the photos and write the bill.
vendorsRoutes.route('/me/bookings', jobPhotosRoutes)
vendorsRoutes.route('/me/bookings', vendorFinalBillRoutes)
vendorsRoutes.route('/me/bookings', vendorTimeProposalRoutes)

// A service's video and the photo-and-video block's config. vendor_admin only
// in its own file, like the service image routes below. Photos keep their
// /me/services/:id/images routes, which share the same rules.
vendorsRoutes.route('/me', garageMediaRoutes)

// The garage's documents for Detlio to verify (0043): owner seat only, in
// its own file, and every route but /config a 404 while R2_DOCS_BUCKET is
// unset. Nested for the same reason as the team screen.
vendorsRoutes.route('/me/documents', garageDocumentRoutes)

// New-booking alerts on this device (0044): widened to operators in its own
// file (the people at the counter need them), every route but /config a 404
// while VAPID is unset. Nested for the same reason as the team screen.
vendorsRoutes.route('/me/push', garagePushRoutes)

// Detlio Certified (0048): the garage's own standing against the standards,
// owner seat only, in its own file. Nested for the same reason as the team
// screen.
vendorsRoutes.route('/me/certification', garageCertificationRoutes)

// Bronze / Silver / Gold (0063): the garage's own tier and what the next one
// takes ("Your tier" on Home), and the garage agreement it reads and accepts.
// Owner seat only, in their own files. Nested for the same reason as the
// team screen.
vendorsRoutes.route('/me/tier', garageTierRoutes)
vendorsRoutes.route('/me/agreement', garageAgreementRoutes)

// Detlio Guarantee (0051): the garage's free redo claims, owner seat only, in
// its own file, every route a 404 while GUARANTEE_ENABLED is off. Nested for
// the same reason as the team screen.
vendorsRoutes.route('/me/guarantee', garageGuaranteeRoutes)

// Requests from customers just outside the garage's reach (customer reach,
// 0062): widened to operators in its own file (the counter answers them, as
// it does new bookings); what one earns is the owner seat's alone. Nested
// for the same reason as the team screen.
vendorsRoutes.route('/me/requests', garageBookingRequestRoutes)

vendorsRoutes.get(
  '/me/working-hours',
  ...tenantMiddleware,
  vendorsController.getWorkingHours
)
vendorsRoutes.put(
  '/me/working-hours',
  ...tenantMiddleware,
  zValidator('json', setWorkingHoursSchema),
  (c) => vendorsController.setWorkingHours(c, c.req.valid('json'))
)

// Holidays and pausing. Admin-only like every other setting: either one
// changes what customers can book, which is an owner's call.
vendorsRoutes.get(
  '/me/closures',
  ...tenantMiddleware,
  vendorsController.listMyClosures
)
vendorsRoutes.post(
  '/me/closures',
  ...tenantMiddleware,
  zValidator('json', createClosureSchema),
  (c) => vendorsController.addClosure(c, c.req.valid('json'))
)
vendorsRoutes.delete(
  '/me/closures/:id',
  ...tenantMiddleware,
  zValidator('param', resourceIdParamSchema),
  (c) => vendorsController.removeClosure(c, c.req.valid('param').id)
)
vendorsRoutes.post(
  '/me/pause',
  ...tenantMiddleware,
  zValidator('json', pauseBookingsSchema),
  (c) => vendorsController.pauseBookings(c, c.req.valid('json'))
)
vendorsRoutes.post(
  '/me/resume',
  ...tenantMiddleware,
  vendorsController.resumeBookings
)

// Drawn doorstep coverage. Overrides doorstepRadiusKm when set, because real
// coverage is rarely a circle — a river or a highway cuts it.
vendorsRoutes.get(
  '/me/doorstep-area',
  ...tenantMiddleware,
  vendorsController.getDoorstepArea
)

vendorsRoutes.put(
  '/me/doorstep-area',
  ...tenantMiddleware,
  zValidator('json', doorstepAreaSchema),
  (c) => vendorsController.setDoorstepArea(c, c.req.valid('json'))
)

vendorsRoutes.get(
  '/me/service-areas',
  ...tenantMiddleware,
  vendorsController.listServiceAreas
)
vendorsRoutes.post(
  '/me/service-areas',
  ...tenantMiddleware,
  zValidator('json', createServiceAreaSchema),
  (c) => vendorsController.createServiceArea(c, c.req.valid('json'))
)
vendorsRoutes.delete(
  '/me/service-areas/:id',
  ...tenantMiddleware,
  zValidator('param', resourceIdParamSchema),
  (c) => vendorsController.deleteServiceArea(c, c.req.valid('param').id)
)

vendorsRoutes.post(
  '/me/logo/upload-url',
  ...tenantMiddleware,
  zValidator('json', logoUploadUrlSchema),
  (c) => vendorsController.createLogoUploadUrl(c, c.req.valid('json'))
)
vendorsRoutes.put(
  '/me/logo',
  ...tenantMiddleware,
  zValidator('json', setLogoSchema),
  (c) => vendorsController.setLogo(c, c.req.valid('json'))
)
vendorsRoutes.delete('/me/logo', ...tenantMiddleware, vendorsController.deleteLogo)

vendorsRoutes.get(
  '/me/photos',
  ...tenantMiddleware,
  vendorsController.listPhotos
)
vendorsRoutes.post(
  '/me/photos/upload-url',
  ...tenantMiddleware,
  zValidator('json', photoUploadUrlSchema),
  (c) => vendorsController.createPhotoUploadUrl(c, c.req.valid('json'))
)
vendorsRoutes.post(
  '/me/photos',
  ...tenantMiddleware,
  zValidator('json', createPhotoSchema),
  (c) => vendorsController.addPhoto(c, c.req.valid('json'))
)
vendorsRoutes.patch(
  '/me/photos/order',
  ...tenantMiddleware,
  zValidator('json', reorderPhotosSchema),
  (c) => vendorsController.reorderPhotos(c, c.req.valid('json'))
)
vendorsRoutes.delete(
  '/me/photos/:id',
  ...tenantMiddleware,
  zValidator('param', resourceIdParamSchema),
  (c) => vendorsController.deletePhoto(c, c.req.valid('param').id)
)

vendorsRoutes.get(
  '/me/services',
  ...tenantMiddleware,
  vendorsController.listMyServices
)
vendorsRoutes.post(
  '/me/services',
  ...tenantMiddleware,
  zValidator('json', createServiceSchema),
  (c) => vendorsController.createService(c, c.req.valid('json'))
)
vendorsRoutes.patch(
  '/me/services/:id/active',
  ...tenantMiddleware,
  zValidator('param', resourceIdParamSchema),
  zValidator('json', toggleServiceActiveSchema),
  (c) =>
    vendorsController.toggleServiceActive(
      c,
      c.req.valid('param').id,
      c.req.valid('json')
    )
)
vendorsRoutes.patch(
  '/me/services/:id',
  ...tenantMiddleware,
  zValidator('param', resourceIdParamSchema),
  zValidator('json', updateServiceSchema),
  (c) =>
    vendorsController.updateService(
      c,
      c.req.valid('param').id,
      c.req.valid('json')
    )
)
vendorsRoutes.delete(
  '/me/services/:id',
  ...tenantMiddleware,
  zValidator('param', resourceIdParamSchema),
  (c) => vendorsController.deleteService(c, c.req.valid('param').id)
)

// Service photos. Registered after the plain service routes above; the extra
// path segment keeps them from colliding with /me/services/:id. Adding one
// needs the privacy tick (`consent: true`); the delete removes a video too.
vendorsRoutes.post(
  '/me/services/:id/images/upload-url',
  ...tenantMiddleware,
  zValidator('param', resourceIdParamSchema),
  zValidator('json', serviceImageUploadUrlSchema),
  (c) =>
    vendorsController.createServiceImageUploadUrl(
      c,
      c.req.valid('param').id,
      c.req.valid('json')
    )
)
vendorsRoutes.post(
  '/me/services/:id/images',
  ...tenantMiddleware,
  zValidator('param', resourceIdParamSchema),
  zValidator('json', addPhotoSchema),
  (c) =>
    vendorsController.addServiceImage(
      c,
      c.req.valid('param').id,
      c.req.valid('json')
    )
)
vendorsRoutes.delete(
  '/me/services/:id/images/:imageId',
  ...tenantMiddleware,
  zValidator('param', serviceImageParamSchema),
  (c) =>
    vendorsController.deleteServiceImage(
      c,
      c.req.valid('param').id,
      c.req.valid('param').imageId
    )
)

vendorsRoutes.get(
  '/me/packages',
  ...tenantMiddleware,
  vendorsController.listMyPackages
)
vendorsRoutes.post(
  '/me/packages',
  ...tenantMiddleware,
  zValidator('json', createPackageSchema),
  (c) => vendorsController.createPackage(c, c.req.valid('json'))
)
vendorsRoutes.patch(
  '/me/packages/:id',
  ...tenantMiddleware,
  zValidator('param', resourceIdParamSchema),
  zValidator('json', updatePackageSchema),
  (c) =>
    vendorsController.updatePackage(
      c,
      c.req.valid('param').id,
      c.req.valid('json')
    )
)
vendorsRoutes.delete(
  '/me/packages/:id',
  ...tenantMiddleware,
  zValidator('param', resourceIdParamSchema),
  (c) => vendorsController.deletePackage(c, c.req.valid('param').id)
)

vendorsRoutes.get(
  '/:id/slots',
  zValidator('query', slotsQuerySchema),
  zValidator('param', vendorIdParamSchema),
  (c) =>
    vendorsController.getAvailableSlots(
      c,
      c.req.valid('param').id,
      c.req.valid('query')
    )
)
// The same list for moving a booking the customer already has, which must
// not count against itself. Signed in, because it names a booking: the
// service answers 404 unless it is the caller's own, at this garage.
vendorsRoutes.get(
  '/:id/slots/reschedule/:bookingId',
  authMiddleware,
  requireCustomer,
  zValidator('query', slotsQuerySchema),
  zValidator('param', rescheduleSlotsParamSchema),
  (c) =>
    vendorsController.getRescheduleSlots(
      c,
      c.req.valid('param').id,
      c.req.valid('param').bookingId,
      c.req.valid('query')
    )
)
vendorsRoutes.get(
  '/:id/services',
  zValidator('param', vendorIdParamSchema),
  (c) => vendorsController.listPublicServices(c, c.req.valid('param').id)
)
vendorsRoutes.get(
  '/:id/packages',
  zValidator('param', vendorIdParamSchema),
  (c) => vendorsController.listPublicPackages(c, c.req.valid('param').id)
)
vendorsRoutes.get(
  '/:id/working-hours',
  zValidator('param', vendorIdParamSchema),
  (c) => vendorsController.getPublicWorkingHours(c, c.req.valid('param').id)
)
// Upcoming holidays, so the customer's picker greys them out up front. A
// sibling of working-hours rather than a field on it: that one is an array
// every client already reads as-is.
vendorsRoutes.get(
  '/:id/closures',
  zValidator('param', vendorIdParamSchema),
  (c) => vendorsController.getPublicClosures(c, c.req.valid('param').id)
)
vendorsRoutes.get('/:id', zValidator('param', vendorIdParamSchema), (c) =>
  vendorsController.getPublicVendor(c, c.req.valid('param').id)
)
