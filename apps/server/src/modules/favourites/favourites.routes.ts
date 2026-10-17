import { zValidator } from '@hono/zod-validator'
import { Hono } from 'hono'
import type { AuthVariables } from '../../middleware/auth.middleware.js'
import * as favouritesController from './favourites.controller.js'
import { favouriteVendorParamSchema } from './favourites.validation.js'

// A customer's saved garages: GET /users/me/favourites, PUT and DELETE
// /users/me/favourites/:vendorId. Mounted at /users/me inside the users
// routes (users.routes.ts), which already require a signed-in customer for
// everything under them; no auth is added a second time here. The user is
// always the session's, never a parameter.
export const favouritesRoutes = new Hono<{ Variables: AuthVariables }>()

favouritesRoutes.get('/favourites', favouritesController.listFavourites)

favouritesRoutes.put('/favourites/:vendorId', zValidator('param', favouriteVendorParamSchema), (c) =>
  favouritesController.saveFavourite(c, c.req.valid('param').vendorId)
)

favouritesRoutes.delete('/favourites/:vendorId', zValidator('param', favouriteVendorParamSchema), (c) =>
  favouritesController.removeFavourite(c, c.req.valid('param').vendorId)
)
