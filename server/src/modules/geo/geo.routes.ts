import { zValidator } from '@hono/zod-validator'
import { Hono } from 'hono'
import { geoAutocompleteRateLimiter } from '../../middleware/rate-limit.middleware.js'
import * as geoController from './geo.controller.js'
import {
  autocompleteQuerySchema,
  geocodeQuerySchema,
  resolveQuerySchema,
  reverseQuerySchema,
  routeQuerySchema,
  mapsLinkQuerySchema,
} from './geo.validation.js'

/**
 * Map-provider proxy. Deliberately unauthenticated: the vendor onboarding
 * address picker runs before a vendor record exists, and the customer address
 * picker runs during signup. The protection is the rate limiter plus the fact
 * that nothing here reads or writes application data.
 */
export const geoRoutes = new Hono()

geoRoutes.get(
  '/autocomplete',
  geoAutocompleteRateLimiter,
  zValidator('query', autocompleteQuerySchema),
  (c) => geoController.autocomplete(c, c.req.valid('query'))
)

geoRoutes.get('/reverse', zValidator('query', reverseQuerySchema), (c) =>
  geoController.reverse(c, c.req.valid('query'))
)

geoRoutes.get('/geocode', zValidator('query', geocodeQuerySchema), (c) =>
  geoController.geocode(c, c.req.valid('query'))
)

geoRoutes.get('/resolve', zValidator('query', resolveQuerySchema), (c) =>
  geoController.resolve(c, c.req.valid('query'))
)

// Resolve a Google Maps link a vendor pasted. Rate-limited with the other
// outbound-heavy endpoints: it makes a redirect chain and often a geocode.
geoRoutes.get(
  '/maps-link',
  geoAutocompleteRateLimiter,
  zValidator('query', mapsLinkQuerySchema),
  (c) => geoController.mapsLink(c, c.req.valid('query'))
)

// Driving time for ONE garage, on demand. Rate-limited alongside autocomplete
// because it is the other endpoint whose volume tracks browsing rather than
// saves — the two things that could actually burn the provider's free tier.
geoRoutes.get(
  '/route',
  geoAutocompleteRateLimiter,
  zValidator('query', routeQuerySchema),
  (c) => geoController.route(c, c.req.valid('query'))
)
