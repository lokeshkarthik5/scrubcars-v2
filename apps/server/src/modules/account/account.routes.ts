import { Hono } from 'hono'
import { authMiddleware, type AuthVariables } from '../../middleware/auth.middleware.js'
import * as accountController from './account.controller.js'

/**
 * The signed-in person's own account, from either app (0066): the customer
 * app's Profile → Delete account and a garage staff login's "Delete my
 * account". Any session with a users row (a customer, a garage seat); the
 * account is always the session's own, never one named in the request.
 * DELETE /users/me (customers) runs the same service.
 */
export const accountRoutes = new Hono<{ Variables: AuthVariables }>()

accountRoutes.use('*', authMiddleware)

accountRoutes.get('/deletion', accountController.deletionPreview)
accountRoutes.delete('/', accountController.deleteAccount)
