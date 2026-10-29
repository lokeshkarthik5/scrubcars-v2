import { zValidator } from '@hono/zod-validator'
import { Hono } from 'hono'
import * as reachController from './reach.controller.js'
import { listZonesQuerySchema } from './reach.validation.js'

/**
 * Customer reach (0062): `GET /api/v1/zones`, public. The garage list's reach
 * figures and "Just outside their area" group ride on `GET /vendors`
 * (vendors.controller.ts → reachService.withReach), not on a route of their
 * own, so a screen gets them in the same call as the garages.
 */
export const zonesRoutes = new Hono()

zonesRoutes.get('/', zValidator('query', listZonesQuerySchema), reachController.listZones)
