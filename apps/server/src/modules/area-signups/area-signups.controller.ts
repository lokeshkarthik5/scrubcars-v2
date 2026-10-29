import type { Context } from 'hono'
import type { AuthVariables } from '../../middleware/auth.middleware.js'
import { areaSignupsService } from './area-signups.service.js'
import type { RecommendInput, SignUpInput } from './area-signups.validation.js'

type CustomerContext = Context<{ Variables: AuthVariables }>

/** The signed-in customer: the only user a sign-up or recommendation is ever made for. */
function customerId(c: CustomerContext): string {
  return c.get('auth').sub
}

export async function status(c: CustomerContext) {
  const data = await areaSignupsService.status(customerId(c))
  c.header('Cache-Control', 'no-store')
  return c.json({ success: true, data })
}

export async function signUp(c: CustomerContext, input: SignUpInput) {
  const data = await areaSignupsService.signUp(customerId(c), input)
  return c.json({ success: true, data }, 201)
}

export async function bannerSeen(c: CustomerContext, zoneSlug: string) {
  const data = await areaSignupsService.bannerSeen(customerId(c), zoneSlug)
  return c.json({ success: true, data })
}

export async function recommend(c: CustomerContext, input: RecommendInput) {
  const data = await areaSignupsService.recommend(customerId(c), input)
  return c.json({ success: true, data }, 201)
}
