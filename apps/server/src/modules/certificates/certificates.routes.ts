import { zValidator } from '@hono/zod-validator'
import { Hono } from 'hono'
import { authMiddleware, requireSuperAdmin, type AuthVariables } from '../../middleware/auth.middleware.js'
import { certificateLookupRateLimiter } from '../../middleware/rate-limit.middleware.js'
import * as certificatesController from './certificates.controller.js'
import {
  photoParamSchema,
  photoQuerySchema,
  shareSchema,
  updateShareSchema,
  vehicleParamSchema,
  verifySchema,
} from './certificates.validation.js'

/**
 * The Detlio Service History certificate (0053).
 *
 * Customer: GET /users/me/vehicles/:vehicleId/certificate (the certificate
 * and its link), POST …/certificate/share (a new link; any earlier one stops
 * working), PATCH …/certificate/share (photos on or off) and DELETE
 * …/certificate/share ("Stop sharing"). Mounted at /users/me inside the
 * users routes (users.routes.ts), which already require a signed-in
 * customer; no auth is added a second time here. The user is always the
 * session's: a car of anyone else's, or one removed, is a 404.
 */
export const customerCertificateRoutes = new Hono<{ Variables: AuthVariables }>()

customerCertificateRoutes.get('/vehicles/:vehicleId/certificate', zValidator('param', vehicleParamSchema), (c) =>
  certificatesController.getOwn(c, c.req.valid('param').vehicleId)
)

customerCertificateRoutes.post(
  '/vehicles/:vehicleId/certificate/share',
  zValidator('param', vehicleParamSchema),
  zValidator('json', shareSchema),
  (c) => certificatesController.share(c, c.req.valid('param').vehicleId, c.req.valid('json'))
)

customerCertificateRoutes.patch(
  '/vehicles/:vehicleId/certificate/share',
  zValidator('param', vehicleParamSchema),
  zValidator('json', updateShareSchema),
  (c) => certificatesController.updateShare(c, c.req.valid('param').vehicleId, c.req.valid('json'))
)

customerCertificateRoutes.delete(
  '/vehicles/:vehicleId/certificate/share',
  zValidator('param', vehicleParamSchema),
  (c) => certificatesController.stopSharing(c, c.req.valid('param').vehicleId)
)

/**
 * Public: /api/v1/certificates, no sign-in. `POST /verify { token }` is the
 * /verify/<token> page's one call (the token in the body, never an API URL),
 * on its own per-IP limiter. `GET /photos/:photoId?e=&s=` serves a photo of
 * a shared certificate through a path the lookup signed, valid 10 minutes
 * and only while the link stands and includes photos.
 */
export const publicCertificateRoutes = new Hono()

publicCertificateRoutes.post('/verify', certificateLookupRateLimiter, zValidator('json', verifySchema), (c) =>
  certificatesController.verify(c, c.req.valid('json').token)
)

publicCertificateRoutes.get(
  '/photos/:photoId',
  zValidator('param', photoParamSchema),
  zValidator('query', photoQuerySchema),
  (c) => {
    const { e, s } = c.req.valid('query')
    return certificatesController.sharedPhoto(c, c.req.valid('param').photoId, e, s)
  }
)

/**
 * Admin: GET /admin/stats/certificates, super-admin. Totals only (links
 * made, live now, cars shared, views), for Statistics' Overview.
 */
export const adminCertificateRoutes = new Hono<{ Variables: AuthVariables }>()

adminCertificateRoutes.get('/', authMiddleware, requireSuperAdmin, (c) => certificatesController.adminTotals(c))
