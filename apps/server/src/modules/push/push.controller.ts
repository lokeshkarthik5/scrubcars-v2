import type { Context } from 'hono'
import { AppError } from '../../lib/errors.js'
import type { AuthVariables } from '../../middleware/auth.middleware.js'
import { getTenant, type TenantVariables } from '../../middleware/tenant.middleware.js'
import { pushService } from './push.service.js'
import type { EndpointInput, PreferencesInput, SubscribeInput } from './push.validation.js'

type CustomerContext = Context<{ Variables: AuthVariables }>
type GarageContext = Context<{ Variables: TenantVariables }>

/** The customer's own subscriptions: the session's person, never a parameter. */
function customerScope(c: CustomerContext) {
  return { userId: c.get('auth').sub, audience: 'customer' as const, vendorId: null }
}

/**
 * A garage seat's subscriptions: the session's person and the garage
 * resolveTenant produced, never a parameter. A Detlio support session acts
 * as the garage but is not one of its people, so it cannot attach a device
 * to the garage's alerts.
 */
function garageScope(c: GarageContext) {
  const tenant = getTenant(c)
  return { userId: c.get('auth').sub, audience: 'garage' as const, vendorId: tenant.vendorId }
}

function refuseSupportSession(c: GarageContext) {
  if (getTenant(c).viaSuperAdmin) {
    throw new AppError(
      403,
      "Alerts go to the garage's own team. A Detlio support session can't turn them on.",
      'PUSH_SUPPORT_SESSION'
    )
  }
}

// ─── Customer (/users/me/push) ───────────────────────────────────────────────

export async function getCustomerConfig(c: CustomerContext) {
  return c.json({ success: true, data: await pushService.config(customerScope(c)) })
}

export async function subscribeCustomer(c: CustomerContext, input: SubscribeInput) {
  const data = await pushService.subscribe(customerScope(c), input, c.req.header('user-agent'))
  return c.json({ success: true, data })
}

export async function unsubscribeCustomer(c: CustomerContext, input: EndpointInput) {
  return c.json({ success: true, data: await pushService.unsubscribe(customerScope(c), input) })
}

export async function customerStatus(c: CustomerContext, input: EndpointInput) {
  return c.json({ success: true, data: await pushService.status(customerScope(c), input) })
}

export async function setCustomerPreferences(c: CustomerContext, input: PreferencesInput) {
  return c.json({ success: true, data: await pushService.setPreferences(c.get('auth').sub, input) })
}

export async function testCustomer(c: CustomerContext, input: EndpointInput) {
  return c.json({ success: true, data: await pushService.sendTest(customerScope(c), input) })
}

// ─── Garage seat (/vendors/me/push) ──────────────────────────────────────────

export async function getGarageConfig(c: GarageContext) {
  return c.json({ success: true, data: await pushService.config(garageScope(c)) })
}

export async function subscribeGarage(c: GarageContext, input: SubscribeInput) {
  refuseSupportSession(c)
  const data = await pushService.subscribe(garageScope(c), input, c.req.header('user-agent'))
  return c.json({ success: true, data })
}

export async function unsubscribeGarage(c: GarageContext, input: EndpointInput) {
  return c.json({ success: true, data: await pushService.unsubscribe(garageScope(c), input) })
}

export async function garageStatus(c: GarageContext, input: EndpointInput) {
  return c.json({ success: true, data: await pushService.status(garageScope(c), input) })
}

export async function testGarage(c: GarageContext, input: EndpointInput) {
  refuseSupportSession(c)
  return c.json({ success: true, data: await pushService.sendTest(garageScope(c), input) })
}
