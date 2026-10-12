import type { Context } from 'hono'
import type { AuthVariables } from '../../middleware/auth.middleware.js'
import { noticesService } from './notices.service.js'
import type {
  AudienceCountQuery,
  CreateNoticeInput,
  ListNoticesQuery,
  UpdateNoticeInput,
} from './notices.validation.js'

type NoticesContext = Context<{ Variables: AuthVariables }>

export async function listNotices(c: NoticesContext, query: ListNoticesQuery) {
  const data = await noticesService.listNotices(query)
  return c.json({ success: true, data })
}

export async function getNotice(c: NoticesContext, id: string) {
  const data = await noticesService.getNotice(id)
  return c.json({ success: true, data })
}

// Takes the token's subject so the notice names whoever wrote it.
export async function createNotice(c: NoticesContext, input: CreateNoticeInput) {
  const data = await noticesService.createNotice(c.get('auth').sub, input)
  return c.json({ success: true, data }, 201)
}

export async function updateNotice(c: NoticesContext, id: string, input: UpdateNoticeInput) {
  const data = await noticesService.updateNotice(id, input)
  return c.json({ success: true, data })
}

export async function endNotice(c: NoticesContext, id: string) {
  const data = await noticesService.endNotice(id)
  return c.json({ success: true, data })
}

export async function audienceCount(c: NoticesContext, query: AudienceCountQuery) {
  const data = await noticesService.audienceCount(query)
  return c.json({ success: true, data })
}
