import { zValidator } from '@hono/zod-validator'
import { Hono } from 'hono'
import {
  authMiddleware,
  requireCustomer,
  type AuthVariables,
} from '../../middleware/auth.middleware.js'
import { customerComplaintRoutes } from '../complaints/complaints.routes.js'
import { homeRoutes } from '../home/home.routes.js'
import * as usersController from './users.controller.js'
import {
  avatarUploadUrlSchema,
  createAddressSchema,
  createVehicleSchema,
  resourceIdParamSchema,
  setAvatarSchema,
  updateAddressSchema,
  updateProfileSchema,
  updateVehicleSchema,
} from './users.validation.js'

export const usersRoutes = new Hono<{ Variables: AuthVariables }>()

usersRoutes.use('*', authMiddleware, requireCustomer)

// Home hub and Updates: /me/home, /me/updates, /me/notices/:id/dismiss and
// /me/offers/:id/dismiss. Mounted after the middleware above, so they get
// the same signed-in-customer check.
usersRoutes.route('/me', homeRoutes)

// The customer's complaints: /me/complaints. Same mounting, same check.
usersRoutes.route('/me', customerComplaintRoutes)

usersRoutes.get('/me', usersController.getProfile)
usersRoutes.patch('/me', zValidator('json', updateProfileSchema), (c) =>
  usersController.updateProfile(c, c.req.valid('json'))
)
usersRoutes.post(
  '/me/avatar/upload-url',
  zValidator('json', avatarUploadUrlSchema),
  (c) => usersController.createAvatarUploadUrl(c, c.req.valid('json'))
)
usersRoutes.put('/me/avatar', zValidator('json', setAvatarSchema), (c) =>
  usersController.setAvatar(c, c.req.valid('json'))
)
usersRoutes.delete('/me/avatar', usersController.deleteAvatar)

usersRoutes.delete('/me', usersController.deleteAccount)

usersRoutes.get('/me/addresses', usersController.listAddresses)
usersRoutes.post(
  '/me/addresses',
  zValidator('json', createAddressSchema),
  (c) => usersController.createAddress(c, c.req.valid('json'))
)
usersRoutes.patch(
  '/me/addresses/:id/default',
  zValidator('param', resourceIdParamSchema),
  (c) => usersController.setDefaultAddress(c, c.req.valid('param').id)
)
usersRoutes.patch(
  '/me/addresses/:id',
  zValidator('param', resourceIdParamSchema),
  zValidator('json', updateAddressSchema),
  (c) =>
    usersController.updateAddress(
      c,
      c.req.valid('param').id,
      c.req.valid('json')
    )
)
usersRoutes.delete(
  '/me/addresses/:id',
  zValidator('param', resourceIdParamSchema),
  (c) => usersController.deleteAddress(c, c.req.valid('param').id)
)

usersRoutes.get('/me/vehicles', usersController.listVehicles)
usersRoutes.post('/me/vehicles', zValidator('json', createVehicleSchema), (c) =>
  usersController.createVehicle(c, c.req.valid('json'))
)
usersRoutes.patch(
  '/me/vehicles/:id/default',
  zValidator('param', resourceIdParamSchema),
  (c) => usersController.setDefaultVehicle(c, c.req.valid('param').id)
)
usersRoutes.patch(
  '/me/vehicles/:id',
  zValidator('param', resourceIdParamSchema),
  zValidator('json', updateVehicleSchema),
  (c) =>
    usersController.updateVehicle(
      c,
      c.req.valid('param').id,
      c.req.valid('json')
    )
)
usersRoutes.delete(
  '/me/vehicles/:id',
  zValidator('param', resourceIdParamSchema),
  (c) => usersController.deleteVehicle(c, c.req.valid('param').id)
)
