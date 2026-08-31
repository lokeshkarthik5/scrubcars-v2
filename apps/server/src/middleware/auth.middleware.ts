import { createMiddleware } from 'hono/factory'
import { getCookie } from 'hono/cookie'
import { AppError } from '../lib/errors.js'
import { verifyAccessToken, type AccessTokenPayload } from '../lib/jwt.js'
import { membersRepository } from '../modules/members/members.repository.js'

export type AuthVariables = {
  auth: AccessTokenPayload
}

/**
 * The subject minted by the env-credential break-glass login. It has no `users`
 * row, so it can never be resolved through the mapping table.
 */
const BREAK_GLASS_SUBJECT = 'admin'

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export const authMiddleware = createMiddleware<{ Variables: AuthVariables }>(
  async (c, next) => {
    const token = getCookie(c, 'access_token')

    if (!token) {
      throw new AppError(401, 'Authentication required', 'UNAUTHORIZED')
    }

    try {
      const payload = await verifyAccessToken(token)
      c.set('auth', payload)
      await next()
    } catch {
      throw new AppError(
        401,
        'Invalid or expired access token',
        'INVALID_TOKEN'
      )
    }
  }
)

export const requireCustomer = createMiddleware<{ Variables: AuthVariables }>(
  async (c, next) => {
    const auth = c.get('auth')

    if (!auth.isCustomer) {
      throw new AppError(403, 'Customer access required', 'CUSTOMER_REQUIRED')
    }

    await next()
  }
)

/**
 * Platform admin. Two ways in, and only two:
 *
 *   1. the env-credential break-glass token, which has no users row at all; or
 *   2. an active `super_admin` row in user_member_mapping.
 *
 * Deliberately not a JWT claim. A role read from a token cannot be revoked
 * until it expires, and a platform-admin grant you cannot revoke for 12 hours
 * is worse than one indexed lookup per request. The `is_admin` column it
 * replaces was never written by anything, but it *was* copied into every
 * OTP-issued session token — a dormant second path into /admin that one
 * `UPDATE users` would have opened. It no longer exists.
 */
export const requireSuperAdmin = createMiddleware<{ Variables: AuthVariables }>(
  async (c, next) => {
    const auth = c.get('auth')

    if (auth.sub === BREAK_GLASS_SUBJECT) {
      await next()
      return
    }

    // Any other non-UUID subject would make the lookup below a 500 rather than
    // a refusal.
    if (!UUID_RE.test(auth.sub)) {
      throw new AppError(403, 'Admin access required', 'ADMIN_REQUIRED')
    }

    const platformRow = await membersRepository.findActivePlatformRow(auth.sub)

    if (platformRow?.role !== 'super_admin') {
      throw new AppError(403, 'Admin access required', 'ADMIN_REQUIRED')
    }

    await next()
  }
)
