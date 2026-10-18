import { zValidator } from '@hono/zod-validator'
import { Hono } from 'hono'
import {
  authMiddleware,
  requireCustomer,
  type AuthVariables,
} from '../../middleware/auth.middleware.js'
import { carHistoryRoutes } from '../car-history/car-history.routes.js'
import { customerCertificateRoutes } from '../certificates/certificates.routes.js'
import { customerComplaintRoutes } from '../complaints/complaints.routes.js'
import { customerBypassReportRoutes } from '../bypass-reports/bypass-reports.routes.js'
import { favouritesRoutes } from '../favourites/favourites.routes.js'
import { homeRoutes } from '../home/home.routes.js'
import { customerPushRoutes } from '../push/push.routes.js'
import { customerGiftRoutes } from '../gifts/gifts.routes.js'
import { customerCreditRoutes } from '../gift-credit/gift-credit.routes.js'
import { customerGuaranteeRoutes } from '../guarantee/guarantee.routes.js'
import { slotAlertsRoutes } from '../slot-alerts/slot-alerts.routes.js'
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

// "Did the garage ask you to book directly?" (0052): /me/bypass-reports.
// Same mounting, same check; the session's own bookings only.
usersRoutes.route('/me', customerBypassReportRoutes)

// The customer's saved garages: /me/favourites. Same mounting, same check.
usersRoutes.route('/me', favouritesRoutes)

// A car's history and its coating/detailing reminders (0046):
// /me/vehicles/:vehicleId/history and /me/service-reminders/:id/{dismiss,
// snooze}. Same mounting, same check; the session's own cars only.
usersRoutes.route('/me', carHistoryRoutes)

// A car's Service History certificate and its share link (0053):
// /me/vehicles/:vehicleId/certificate and …/certificate/share. Same
// mounting, same check; the session's own cars only.
usersRoutes.route('/me', customerCertificateRoutes)

// Browser notifications on the customer's own devices, and their two
// switches: /me/push (0044). Same mounting, same check.
usersRoutes.route('/me/push', customerPushRoutes)

// "Notify me if a slot opens": /me/slot-alerts (0047). Same mounting, same
// check.
usersRoutes.route('/me', slotAlertsRoutes)

// Gift a wash (0049): the gifts the customer bought, redeeming one, and
// their Detlio credit: /me/gifts and /me/credit. Same mounting, same check;
// both are 404s while GIFTS_ENABLED is off.
usersRoutes.route('/me/gifts', customerGiftRoutes)
usersRoutes.route('/me/credit', customerCreditRoutes)
// Detlio Guarantee (0051): a free redo claim on the customer's own booking.
usersRoutes.route('/me/guarantee', customerGuaranteeRoutes)

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
