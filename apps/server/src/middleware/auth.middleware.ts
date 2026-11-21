import { zValidator } from '@hono/zod-validator'
import type { Context } from 'hono'
import { createMiddleware } from 'hono/factory'
import { getCookie } from 'hono/cookie'
import type { ZodType } from 'zod'
import {
  BREAK_GLASS_NAME,
  BREAK_GLASS_SUBJECT,
  canDeleteAnything,
  userIdFromSubject,
  type AdminActor,
} from '../lib/admin-actor.js'
import { AppError } from '../lib/errors.js'
import { verifyAccessToken, type AccessTokenPayload } from '../lib/jwt.js'
import { adminLoginsService } from '../modules/admin-logins/admin-logins.service.js'
import { membersRepository } from '../modules/members/members.repository.js'

export type AuthVariables = {
  auth: AccessTokenPayload
  /** How the session arrived: the websites use the cookie, the native apps Bearer. */
  authVia?: 'cookie' | 'bearer'
  /** The signed-in admin; set by requireSuperAdmin, so only on admin routes. */
  adminActor?: AdminActor
}

/**
 * The access token, from the cookie the websites send or the Authorization
 * header the native apps send. The cookie is read first, so a browser session
 * behaves exactly as it did before Bearer existed. A browser cannot send the
 * header across sites at all: CORS leaves Authorization out of allowHeaders.
 */
function readAccessToken(c: Context): { token: string; via: 'cookie' | 'bearer' } | null {
  const cookie = getCookie(c, 'access_token')
  if (cookie) return { token: cookie, via: 'cookie' }
  const bearer = /^Bearer ([^\s]+)$/i.exec(c.req.header('Authorization') ?? '')?.[1]
  return bearer ? { token: bearer, via: 'bearer' } : null
}

export const authMiddleware = createMiddleware<{ Variables: AuthVariables }>(
  async (c, next) => {
    const found = readAccessToken(c)

    if (!found) {
      throw new AppError(401, 'Authentication required', 'UNAUTHORIZED')
    }

    try {
      const payload = await verifyAccessToken(found.token)
      c.set('auth', payload)
      c.set('authVia', found.via)
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

/**
 * The session when there is one, and nothing when there is not: for a route
 * open to everyone that only notes who is signed in (POST /events). Never
 * refuses; a missing, expired or forged token is the same as none.
 */
export const optionalAuthMiddleware = createMiddleware<{ Variables: Partial<AuthVariables> }>(
  async (c, next) => {
    const found = readAccessToken(c)
    if (found) {
      try {
        c.set('auth', await verifyAccessToken(found.token))
      } catch {
        // Treated as signed out.
      }
    }
    await next()
  }
)

export const requireCustomer =createMiddleware<{ Variables: AuthVariables }>(
  async (c, next) => {
    const auth = c.get('auth')

    if (!auth.isCustomer) {
      throw new AppError(403, 'Customer access required', 'CUSTOMER_REQUIRED')
    }

    await next()
  }
)

/**
 * Platform admin. Three ways in, and only three (lib/admin-actor.ts):
 *
 *   1. the env-credential break-glass token, which has no users row at all;
 *   2. a personal admin login (0058), 'admin:<id>', still on and minted at
 *      or after its `sessions_from`; or
 *   3. an active `super_admin` row in user_member_mapping.
 *
 * Each sets `adminActor`: who is signed in and the name every action they
 * take is signed with (see adminSignedJson).
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

    // Admin stays on the web: a token handed to a native app never opens it,
    // even for a person who is also a platform admin.
    if (c.get('authVia') === 'bearer') {
      throw new AppError(403, 'Admin access required', 'ADMIN_REQUIRED')
    }

    if (auth.sub === BREAK_GLASS_SUBJECT) {
      c.set('adminActor', {
        sub: auth.sub,
        kind: 'shared',
        name: BREAK_GLASS_NAME,
        username: null,
        loginId: null,
        isOwner: false,
      })
      await next()
      return
    }

    if (auth.sub.startsWith('admin:')) {
      const actor = await adminLoginsService.sessionActor(auth.sub, auth.mintedAt)
      // 401, not 403: the panel sends the person back to sign in.
      if (!actor) {
        throw new AppError(401, 'Your admin session has ended. Sign in again.', 'ADMIN_SESSION_ENDED')
      }
      c.set('adminActor', actor)
      await next()
      return
    }

    // Any other non-UUID subject would make the lookup below a 500 rather than
    // a refusal.
    const userId = userIdFromSubject(auth.sub)
    if (!userId) {
      throw new AppError(403, 'Admin access required', 'ADMIN_REQUIRED')
    }

    const platformRow = await membersRepository.findActivePlatformRow(userId)

    if (platformRow?.role !== 'super_admin') {
      throw new AppError(403, 'Admin access required', 'ADMIN_REQUIRED')
    }

    const user = await membersRepository.findUserById(userId)
    c.set('adminActor', {
      sub: auth.sub,
      kind: 'member',
      // Never the phone: the name lands in records and alerts.
      name: (user?.name?.trim() || BREAK_GLASS_NAME).slice(0, 100),
      username: null,
      loginId: null,
      isOwner: false,
    })

    await next()
  }
)

/** The signed-in admin, behind requireSuperAdmin. */
export function signedInAdmin(c: Context<{ Variables: AuthVariables }>): AdminActor {
  const actor = c.get('adminActor')
  if (!actor) throw new Error('signedInAdmin: requireSuperAdmin did not run on this route')
  return actor
}

/**
 * The owner's own deletes (10 Nov 2026), behind requireSuperAdmin: the
 * owner's login or the shared break-glass login (`canDeleteAnything`).
 * Anyone else signed in to admin is 403 ADMIN_OWNER_ONLY, as Team logins
 * answers them: they are known admins, so nothing is given away by saying so.
 */
export const requireOwner = ownerOnly('Only the owner can delete this.')

/**
 * Back up all garages (18 Nov 2026): the same owner check as the deletes,
 * worded for the backup. Everyone else is 403 ADMIN_OWNER_ONLY.
 */
export const requireOwnerForBackup = ownerOnly('Only the owner can back up all garages.')

function ownerOnly(message: string) {
  return createMiddleware<{ Variables: AuthVariables }>(async (c, next) => {
    if (!canDeleteAnything(signedInAdmin(c))) {
      throw new AppError(403, message, 'ADMIN_OWNER_ONLY')
    }
    await next()
  })
}

/**
 * zValidator('json', schema) for an admin write that is signed: once the body
 * is valid, its `actorName` is the signed-in admin's name (0058), whatever
 * the client sent. The schemas declare it with `signedActorName`, so a panel
 * from before personal logins, which still sends a typed name, is accepted
 * and the typed name ignored. Behind requireSuperAdmin only.
 */
export function adminSignedJson<T extends ZodType>(schema: T, field: 'actorName' | 'loggedBy' = 'actorName') {
  return zValidator('json', schema, (result, c) => {
    if (result.success && typeof result.data === 'object' && result.data !== null) {
      const actor = signedInAdmin(c as unknown as Context<{ Variables: AuthVariables }>)
      ;(result.data as Record<string, unknown>)[field] = actor.name
    }
  })
}
