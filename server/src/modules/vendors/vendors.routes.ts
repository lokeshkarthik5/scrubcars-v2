import { zValidator } from '@hono/zod-validator'
import { Hono } from 'hono'
import {
  authMiddleware,
  requireVendor,
  type AuthVariables,
} from '../../middleware/auth.middleware.js'
import * as vendorsController from './vendors.controller.js'
import {
  createPhotoSchema,
  createPackageSchema,
  createServiceAreaSchema,
  createServiceImageSchema,
  createServiceSchema,
  createVendorSchema,
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

export const vendorsRoutes = new Hono<{ Variables: AuthVariables }>()

const ownerMiddleware = [authMiddleware, requireVendor] as const

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

vendorsRoutes.get('/me', ...ownerMiddleware, vendorsController.getMyVendor)
vendorsRoutes.patch(
  '/me',
  ...ownerMiddleware,
  zValidator('json', updateVendorSchema),
  (c) => vendorsController.updateVendor(c, c.req.valid('json'))
)
vendorsRoutes.patch(
  '/me/job-types',
  ...ownerMiddleware,
  zValidator('json', updateJobTypesSchema),
  (c) => vendorsController.updateJobTypes(c, c.req.valid('json'))
)
vendorsRoutes.patch(
  '/me/slot-interval',
  ...ownerMiddleware,
  zValidator('json', updateSlotIntervalSchema),
  (c) => vendorsController.updateSlotInterval(c, c.req.valid('json'))
)

vendorsRoutes.get(
  '/me/working-hours',
  ...ownerMiddleware,
  vendorsController.getWorkingHours
)
vendorsRoutes.put(
  '/me/working-hours',
  ...ownerMiddleware,
  zValidator('json', setWorkingHoursSchema),
  (c) => vendorsController.setWorkingHours(c, c.req.valid('json'))
)

// Drawn doorstep coverage. Overrides doorstepRadiusKm when set, because real
// coverage is rarely a circle — a river or a highway cuts it.
vendorsRoutes.get(
  '/me/doorstep-area',
  ...ownerMiddleware,
  vendorsController.getDoorstepArea
)

vendorsRoutes.put(
  '/me/doorstep-area',
  ...ownerMiddleware,
  zValidator('json', doorstepAreaSchema),
  (c) => vendorsController.setDoorstepArea(c, c.req.valid('json'))
)

vendorsRoutes.get(
  '/me/service-areas',
  ...ownerMiddleware,
  vendorsController.listServiceAreas
)
vendorsRoutes.post(
  '/me/service-areas',
  ...ownerMiddleware,
  zValidator('json', createServiceAreaSchema),
  (c) => vendorsController.createServiceArea(c, c.req.valid('json'))
)
vendorsRoutes.delete(
  '/me/service-areas/:id',
  ...ownerMiddleware,
  zValidator('param', resourceIdParamSchema),
  (c) => vendorsController.deleteServiceArea(c, c.req.valid('param').id)
)

vendorsRoutes.post(
  '/me/logo/upload-url',
  ...ownerMiddleware,
  zValidator('json', logoUploadUrlSchema),
  (c) => vendorsController.createLogoUploadUrl(c, c.req.valid('json'))
)
vendorsRoutes.put(
  '/me/logo',
  ...ownerMiddleware,
  zValidator('json', setLogoSchema),
  (c) => vendorsController.setLogo(c, c.req.valid('json'))
)
vendorsRoutes.delete('/me/logo', ...ownerMiddleware, vendorsController.deleteLogo)

vendorsRoutes.get(
  '/me/photos',
  ...ownerMiddleware,
  vendorsController.listPhotos
)
vendorsRoutes.post(
  '/me/photos/upload-url',
  ...ownerMiddleware,
  zValidator('json', photoUploadUrlSchema),
  (c) => vendorsController.createPhotoUploadUrl(c, c.req.valid('json'))
)
vendorsRoutes.post(
  '/me/photos',
  ...ownerMiddleware,
  zValidator('json', createPhotoSchema),
  (c) => vendorsController.addPhoto(c, c.req.valid('json'))
)
vendorsRoutes.patch(
  '/me/photos/order',
  ...ownerMiddleware,
  zValidator('json', reorderPhotosSchema),
  (c) => vendorsController.reorderPhotos(c, c.req.valid('json'))
)
vendorsRoutes.delete(
  '/me/photos/:id',
  ...ownerMiddleware,
  zValidator('param', resourceIdParamSchema),
  (c) => vendorsController.deletePhoto(c, c.req.valid('param').id)
)

vendorsRoutes.get(
  '/me/services',
  ...ownerMiddleware,
  vendorsController.listMyServices
)
vendorsRoutes.post(
  '/me/services',
  ...ownerMiddleware,
  zValidator('json', createServiceSchema),
  (c) => vendorsController.createService(c, c.req.valid('json'))
)
vendorsRoutes.patch(
  '/me/services/:id/active',
  ...ownerMiddleware,
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
  ...ownerMiddleware,
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
  ...ownerMiddleware,
  zValidator('param', resourceIdParamSchema),
  (c) => vendorsController.deleteService(c, c.req.valid('param').id)
)

// Service images. Registered after the plain service routes above; the extra
// path segment keeps them from colliding with /me/services/:id.
vendorsRoutes.post(
  '/me/services/:id/images/upload-url',
  ...ownerMiddleware,
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
  ...ownerMiddleware,
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
  ...ownerMiddleware,
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
  ...ownerMiddleware,
  vendorsController.listMyPackages
)
vendorsRoutes.post(
  '/me/packages',
  ...ownerMiddleware,
  zValidator('json', createPackageSchema),
  (c) => vendorsController.createPackage(c, c.req.valid('json'))
)
vendorsRoutes.patch(
  '/me/packages/:id',
  ...ownerMiddleware,
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
  ...ownerMiddleware,
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
