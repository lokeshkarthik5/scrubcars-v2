import { Hono } from 'hono'
import * as healthController from './health.controller.js'

// For the uptime monitor. Public and unauthenticated on purpose — it says
// nothing beyond "up" and the API's version — and limited only by the global
// per-IP limiter, which a check every few minutes never comes near. There is
// no validation file: the route takes no input.
export const healthRoutes = new Hono()

healthRoutes.get('/', healthController.health)
