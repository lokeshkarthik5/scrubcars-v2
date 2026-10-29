import type { Context } from 'hono'
import { deleteCookie } from 'hono/cookie'
import { userIdFromSubject } from '../../lib/admin-actor.js'
import { env } from '../../lib/env.js'
import { AppError } from '../../lib/errors.js'
import type { AuthVariables } from '../../middleware/auth.middleware.js'
import { accountService } from './account.service.js'

type AccountContext = Context<{ Variables: AuthVariables }>

/** The signed-in person's own users row; an admin login has none. */
function ownUserId(c: AccountContext): string {
  const userId = userIdFromSubject(c.get('auth').sub)
  if (!userId) throw new AppError(404, 'User not found', 'USER_NOT_FOUND')
  return userId
}

/**
 * This browser's session goes with the account: both cookies are cleared in
 * the answer (the same paths and flags the sign-in set them with).
 */
export function clearSessionCookies(c: Context) {
  const flags = { secure: !env.isDev, sameSite: 'Lax' as const }
  deleteCookie(c, 'refresh_token', { path: '/api/v1/auth', ...flags })
  deleteCookie(c, 'access_token', { path: '/api/v1', ...flags })
}

export async function deletionPreview(c: AccountContext) {
  const data = await accountService.deletionPreview(ownUserId(c))
  return c.json({ success: true, data })
}

export async function deleteAccount(c: AccountContext) {
  await accountService.deleteAccount(ownUserId(c))
  clearSessionCookies(c)
  return c.json({ success: true, message: 'Account deleted' })
}
