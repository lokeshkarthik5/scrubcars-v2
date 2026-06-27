import { createMiddleware } from 'hono/factory'
import { AppError } from '../lib/errors.js'
import { verifyAccessToken, type AccessTokenPayload } from '../lib/jwt.js'

export type AuthVariables = {
  auth: AccessTokenPayload
}

function extractBearerToken(authorization: string | undefined): string | null {
  if (!authorization?.startsWith('Bearer ')) {
    return null
  }

  return authorization.slice('Bearer '.length).trim() || null
}

export const authMiddleware = createMiddleware<{ Variables: AuthVariables }>(
  async (c, next) => {
    const token = extractBearerToken(c.req.header('Authorization'))

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

export const requireVendor = createMiddleware<{ Variables: AuthVariables }>(
  async (c, next) => {
    const auth = c.get('auth')

    if (!auth.isVendorOwner) {
      throw new AppError(403, 'Vendor access required', 'VENDOR_REQUIRED')
    }

    await next()
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
