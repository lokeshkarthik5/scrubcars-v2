import { zValidator } from '@hono/zod-validator'
import { Hono } from 'hono'
import { authMiddleware } from '../../middleware/auth.middleware.js'
import {
  requireVendorRole,
  resolveTenant,
  type TenantVariables,
} from '../../middleware/tenant.middleware.js'
import { membersRoutes } from '../members/members.routes.js'
import * as vendorsController from './vendors.controller.js'
import {
  createPhotoSchema,
  createPackageSchema,
  createServiceAreaSchema,
  createServiceImageSchema,
  createServiceSchema,
  createVendorSchema,
  earningsQuerySchema,
  listPublicVendorsQuerySchema,
  logoUploadUrlSchema,
  photoUploadUrlSchema,
  reorderPhotosSchema,
  serviceImageParamSchema,
  serviceImageUploadUrlSchema,
  setLogoSchema,
  resourceIdParamSchema,
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

export const vendorsRoutes = new Hono<{ Variables: TenantVariables }>()

// Every /me route resolves the active company from the session or the
// X-Vendor-Id header before the handler runs. `/me` is unchanged as a path —
// what it means is now "the company I am acting as", not "the company I own".
//
// Default deny: the shared chain is vendor_admin-only, so a route added to this
// file is never accidentally exposed to operators. Widening is deliberate, and
// there is exactly one widened route below.
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

// Service images. Registered after the plain service routes above; the extra
// path segment keeps them from colliding with /me/services/:id.
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
  zValidator('json', createServiceImageSchema),
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
vendorsRoutes.get('/:id', zValidator('param', vendorIdParamSchema), (c) =>
  vendorsController.getPublicVendor(c, c.req.valid('param').id)
)
