import type { Context } from 'hono'
import type { AuthVariables } from '../../middleware/auth.middleware.js'
import { homeService } from './home.service.js'
import type { HomeQuery, MarkUpdatesSeenInput } from './home.validation.js'

type HomeContext = Context<{ Variables: AuthVariables }>

function getUserId(c: HomeContext): string {
  return c.get('auth').sub
}

export async function getHome(c: HomeContext, query: HomeQuery) {
  const data = await homeService.getHome(getUserId(c), query)
  return c.json({ success: true, data })
}

export async function getUpdates(c: HomeContext) {
  const data = await homeService.getUpdates(getUserId(c))
  return c.json({ success: true, data })
}

export async function markUpdatesSeen(c: HomeContext, input: MarkUpdatesSeenInput) {
  await homeService.markUpdatesSeen(getUserId(c), input)
  return c.body(null, 204)
}

export async function dismissNotice(c: HomeContext, noticeId: string) {
  await homeService.dismissNotice(getUserId(c), noticeId)
  return c.body(null, 204)
}

export async function dismissOffer(c: HomeContext, discountId: string) {
  await homeService.dismissOffer(getUserId(c), discountId)
  return c.body(null, 204)
}
