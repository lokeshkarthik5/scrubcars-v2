import { zValidator } from '@hono/zod-validator'
import { Hono } from 'hono'
import { z } from 'zod'
import {
  authMiddleware,
  requireSuperAdmin,
  type AuthVariables,
  adminSignedJson,
} from '../../middleware/auth.middleware.js'
import { rateLimiter } from '../../middleware/rate-limit.middleware.js'
import { adminAiRoutes } from '../ai/ai.routes.js'
import { adminAlertRoutes } from '../alerts/alerts.routes.js'
import { adminCreditRoutes } from '../gift-credit/gift-credit.routes.js'
import { adminGiftRoutes } from '../gifts/gifts.routes.js'
import { adminCertificateRoutes } from '../certificates/certificates.routes.js'
import { adminRewardRoutes } from '../rewards/rewards.routes.js'
import { adminRewardExtrasRoutes } from '../reward-extras/reward-extras.routes.js'
import { adminGarageRoutes } from '../garage/garage.routes.js'
import { adminComplaintRoutes } from '../complaints/complaints.routes.js'
import { adminGuaranteeRoutes } from '../guarantee/guarantee.routes.js'
import { adminDataResetRoutes } from '../data-reset/data-reset.routes.js'
import { adminDiscountRoutes } from '../discounts/discounts.routes.js'
import { adminCouponRoutes } from '../coupons/coupons.routes.js'
import { adminNoticeRoutes } from '../notices/notices.routes.js'
import { adminRefundRoutes } from '../refunds/refunds.routes.js'
import { adminVendorBinRoutes } from '../vendor-bin/vendor-bin.routes.js'
import { adminOnboardingMarkRoutes } from '../onboarding-marks/onboarding-marks.routes.js'
import { adminCollectionListRoutes } from '../collection-lists/collection-lists.routes.js'
import { adminMediaRoutes } from '../service-media/service-media.routes.js'
import { addPhotoSchema } from '../service-media/service-media.validation.js'
import { adminStatsRoutes } from '../stats/stats.routes.js'
import { adminPayoutRoutes } from '../payouts/payouts.routes.js'
import { adminDocumentRoutes } from '../vendor-documents/vendor-documents.routes.js'
import { adminCertificationRoutes } from '../certification/certification.routes.js'
import { adminVendorImportRoutes } from '../vendor-imports/vendor-imports.routes.js'
import {
  addMemberSchema,
  updateMemberSchema,
} from '../members/members.validation.js'
import { adminBypassReportRoutes } from '../bypass-reports/bypass-reports.routes.js'
import { adminTodayRoutes } from '../today/today.routes.js'
import * as adminController from './admin.controller.js'
import {
  adminCancelBookingSchema,
  bookingIdParamSchema,
  bookingViewCountsQuerySchema,
  createBookingNoteSchema,
  createVendorSchema,
  grantSuperAdminSchema,
  listBookingsQuerySchema,
  markNoShowSchema,
  pickupStepOverrideSchema,
  waiveJobPhotosSchema,
  pilotStatsQuerySchema,
  superAdminIdParamSchema,
  loginSchema,
  mediaUrlSchema,
  pauseVendorSchema,
  setServiceActiveSchema,
  updateVendorSchema,
  uploadUrlSchema,
} from './admin.validation.js'
import { adminLoginRoutes, adminOwnPasswordRoutes } from '../admin-logins/admin-logins.routes.js'

export const adminRoutes = new Hono<{ Variables: AuthVariables }>()

const adminMiddleware = [authMiddleware, requireSuperAdmin] as const

const vendorIdParamSchema = z.object({ id: z.string().uuid() })

adminRoutes.post('/login', rateLimiter, zValidator('json', loginSchema), (c) =>
  adminController.login(c, c.req.valid('json'))
)
adminRoutes.post('/logout', adminController.logout)
adminRoutes.get('/me', ...adminMiddleware, adminController.getMe)
// Personal admin logins (0058): Settings → Team logins, and your own password.
adminRoutes.route('/me/password', adminOwnPasswordRoutes)
adminRoutes.route('/logins', adminLoginRoutes)

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
// The pilot's numbers for the last 7 or 30 days (?days=7|30). Shown on the
// Statistics page's Overview, beside the routes mounted below.
adminRoutes.get(
  '/stats/pilot',
  ...adminMiddleware,
  zValidator('query', pilotStatsQuerySchema),
  (c) => adminController.getPilotStats(c, c.req.valid('query'))
)
// Service History certificates shared and viewed (0053): totals only, on
// Statistics' Overview.
adminRoutes.route('/stats/certificates', adminCertificateRoutes)
// Statistics: overview, breakdown and commission over a range of days.
// Nested here for the same cookie reason as discounts (below).
adminRoutes.route('/stats', adminStatsRoutes)
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
  (c) =>
    adminController.updateVendor(
      c,
      c.req.valid('param').id,
      c.req.valid('json')
    )
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
// The Bin: GET /vendors/:id/bin-preview, POST /vendors/:id/bin and
// /restore, GET /vendors/:id/delete-preview, and DELETE /vendors/:id (delete
// forever, only from the Bin). Their own module; mounted at the root for the
// cookie's sake, like the media routes below.
adminRoutes.route('/', adminVendorBinRoutes)
// Onboarding marks (0059): GET/POST /vendors/:id/marks, PATCH/DELETE
// /vendors/:id/marks/:markId and POST /onboarding-marks/asked. Collection
// lists ("Send to team"): /collection-lists, /collection-lists/:id/close and
// PATCH /collection-items/:id. Their own modules; mounted at the root for
// the cookie's sake, like the Bin.
adminRoutes.route('/', adminOnboardingMarkRoutes)
adminRoutes.route('/', adminCollectionListRoutes)

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

// Hidden services, hiding or showing one again, and deleting one. The editor
// loads only the garage's live services, so without these a service switched
// off — on purpose, or by an old editor bug that dropped rows it could not
// price — was out of admin's sight for good. Saved immediately, like Pause; packages stay
// the garage app's to manage.
const vendorServiceParamSchema = z.object({
  id: z.string().uuid(),
  serviceId: z.string().uuid(),
})

adminRoutes.get(
  '/vendors/:id/services/hidden',
  ...adminMiddleware,
  zValidator('param', vendorIdParamSchema),
  (c) => adminController.listHiddenServices(c, c.req.valid('param').id)
)
adminRoutes.patch(
  '/vendors/:id/services/:serviceId/active',
  ...adminMiddleware,
  zValidator('param', vendorServiceParamSchema),
  zValidator('json', setServiceActiveSchema),
  (c) =>
    adminController.setServiceActive(
      c,
      c.req.valid('param').id,
      c.req.valid('param').serviceId,
      c.req.valid('json')
    )
)
adminRoutes.delete(
  '/vendors/:id/services/:serviceId',
  ...adminMiddleware,
  zValidator('param', vendorServiceParamSchema),
  (c) =>
    adminController.deleteService(
      c,
      c.req.valid('param').id,
      c.req.valid('param').serviceId
    )
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
    adminController.setVendorLogo(
      c,
      c.req.valid('param').id,
      c.req.valid('json')
    )
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

// Service photos are keyed by service alone: the admin editor already knows the
// service id, and the owning vendor is resolved from the row. Adding one needs
// the privacy tick (`consent: true`); the delete removes a video too. Each
// answers with the service's media, as the upload block shows it.
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
  zValidator('json', addPhotoSchema),
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
// Printed coupons (0056): batches, their print sheets and codes, tracking,
// and void. Nested here for the same cookie reason as discounts.
adminRoutes.route('/coupons', adminCouponRoutes)

// Refunds owed and done, and recording one. Nested here for the same cookie
// reason as discounts.
adminRoutes.route('/refunds', adminRefundRoutes)
// Garage payouts: balances, Record payout, history and payout details.
adminRoutes.route('/payouts', adminPayoutRoutes)
// Garage documents (0043): view, approve or reject, upload on a garage's
// behalf. Nested here for the same cookie reason as discounts; every route
// but /config is a 404 while R2_DOCS_BUCKET is unset.
adminRoutes.route('/documents', adminDocumentRoutes)
// Detlio Certified (0048): a garage's standards, quality checks, Certify
// and Revoke. Nested here for the same cookie reason as discounts.
adminRoutes.route('/certification', adminCertificationRoutes)

// Telegram: whether the team's alerts are set up, and "Send test alert".
// Nested here for the same cookie reason as discounts.
adminRoutes.route('/alerts', adminAlertRoutes)

// Gift a wash (0049): gifts sold and redeemed, what Detlio still owes, and
// customers' credit with manual adjustments. Nested here for the same cookie
// reason as discounts; every route but /gifts/config is a 404 while
// GIFTS_ENABLED is off.
adminRoutes.route('/gifts/credit', adminCreditRoutes)
adminRoutes.route('/gifts', adminGiftRoutes)

// Detlio Rewards (0050): tracking, the CSV ledger, a customer's rewards and
// adjustments, and the settings form. Super-admin; a 404 (but /config)
// while REWARDS_ENABLED is off.
adminRoutes.route('/rewards', adminRewardRoutes)
// 0054: Achievements, Challenges (with the results CSV) and Wrapped stats.
adminRoutes.route('/rewards', adminRewardExtrasRoutes)
// 0057: the Detlio Garage: series, cars, art, figures, CSV.
adminRoutes.route('/rewards/garage', adminGarageRoutes)

// Team notices on the customer Home and Updates. Nested here for the same
// cookie reason as discounts.
adminRoutes.route('/notices', adminNoticeRoutes)

// Customers' complaints, with their numbers and the 24-hour / 7-day clock.
// Nested here for the same cookie reason as discounts.
adminRoutes.route('/complaints', adminComplaintRoutes)

// "Did the garage ask you to book directly?" reports, garage strikes and
// customer drop-off (0052). Nested here for the same cookie reason.
adminRoutes.route('/bypass-reports', adminBypassReportRoutes)

// Detlio Guarantee (0051): free redo claims, Detlio's decisions.
adminRoutes.route('/guarantee', adminGuaranteeRoutes)

// The Today inbox and the menu's counts: every open task, read from the
// pages' own services. Nested here for the same cookie reason as discounts.
adminRoutes.route('/today', adminTodayRoutes)

// Add garage's import from a poster, photo, PDF or Tally file, and the
// owner-phone lookup. Nested here for the same cookie reason as discounts.
adminRoutes.route('/vendor-imports', adminVendorImportRoutes)

// AI helpers: GET /ai/config (describe, pictures and import) and POST
// /services/describe. Mounted at the root rather than under a prefix because
// the describe route sits with the other /services ones; it has no
// :serviceId, so it never meets the image routes.
adminRoutes.route('/', adminAiRoutes)

// "Start pilot clean": the test-data reset. Nested here for the same cookie
// reason; every route is a 404 unless ADMIN_DATA_RESET is on.
adminRoutes.route('/data-reset', adminDataResetRoutes)

// A service's video, AI sample pictures and the upload block's config
// (/media-config, /services/:serviceId/{videos,media,ai-pictures}).
// Mounted at the root of /admin for the same cookie reason.
adminRoutes.route('/', adminMediaRoutes)

adminRoutes.get(
  '/bookings',
  ...adminMiddleware,
  zValidator('query', listBookingsQuerySchema),
  (c) => adminController.listBookings(c, c.req.valid('query'))
)
// The saved views' counts (0059). Before /bookings/:id, which would read
// "views" as an id.
adminRoutes.get(
  '/bookings/views',
  ...adminMiddleware,
  zValidator('query', bookingViewCountsQuerySchema),
  (c) => adminController.bookingViewCounts(c, c.req.valid('query'))
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
    adminController.cancelBooking(
      c,
      c.req.valid('param').id,
      c.req.valid('json')
    )
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
// The "Test" mark: on the whole reschedule chain, with a note. Works whether
// or not the test-data reset is switched on; only deleting needs that.
adminRoutes.post(
  '/bookings/:id/mark-test',
  ...adminMiddleware,
  zValidator('param', bookingIdParamSchema),
  (c) => adminController.setBookingTestMark(c, c.req.valid('param').id, true)
)
adminRoutes.delete(
  '/bookings/:id/mark-test',
  ...adminMiddleware,
  zValidator('param', bookingIdParamSchema),
  (c) => adminController.setBookingTestMark(c, c.req.valid('param').id, false)
)
// Pickup & drop: Detlio confirms Picked up or Delivered for a customer who
// cannot give the code. Leaves a note with the reason, like the rest.
adminRoutes.post(
  '/bookings/:id/pickup-step',
  ...adminMiddleware,
  zValidator('param', bookingIdParamSchema),
  zValidator('json', pickupStepOverrideSchema),
  (c) =>
    adminController.overridePickupStep(
      c,
      c.req.valid('param').id,
      c.req.valid('json')
    )
)
// The photo standard (0045): Detlio waives it on one booking, with the typed
// name and a reason, for a genuine case.
adminRoutes.post(
  '/bookings/:id/photos-waiver',
  ...adminMiddleware,
  zValidator('param', bookingIdParamSchema),
  adminSignedJson(waiveJobPhotosSchema),
  (c) =>
    adminController.waiveJobPhotos(
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
    adminController.addBookingNote(
      c,
      c.req.valid('param').id,
      c.req.valid('json')
    )
)
