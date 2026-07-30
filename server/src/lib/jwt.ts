import { sign, verify } from 'hono/jwt'
import { env } from './env.js'

export type TokenAudience = 'customer' | 'vendor'

export type AccessTokenPayload = {
  sub: string
  aud: TokenAudience
  isCustomer: boolean
  isVendorOwner: boolean
  isAdmin: boolean
}

type JwtPayload = AccessTokenPayload & {
  exp: number
  iat: number
}

function parseExpiryToSeconds(expiry: string): number {
  const match = expiry.match(/^(\d+)([smhd])$/)
  if (!match) {
    throw new Error(`Invalid JWT expiry format: ${expiry}`)
  }

  const value = Number(match[1])
  const unit = match[2]

  switch (unit) {
    case 's':
      return value
    case 'm':
      return value * 60
    case 'h':
      return value * 60 * 60
    case 'd':
      return value * 24 * 60 * 60
    default:
      throw new Error(`Unsupported JWT expiry unit: ${unit}`)
  }
}

export async function signAccessToken(
  payload: AccessTokenPayload
): Promise<string> {
  const exp = Math.floor(
    Date.now() / 1000 + parseExpiryToSeconds(env.jwtAccessExpiresIn)
  )

  return sign(
    {
      ...payload,
      exp,
    },
    env.jwtSecret
  )
}

// Env-based admin auth has no `users` row / refresh-token session, so we mint a
// standalone longer-lived access token instead of relying on the refresh flow.
export async function signAdminToken(): Promise<string> {
  const exp = Math.floor(
    Date.now() / 1000 + parseExpiryToSeconds(env.adminTokenExpiresIn)
  )

  return sign(
    {
      sub: 'admin',
      aud: 'customer',
      isCustomer: false,
      isVendorOwner: false,
      isAdmin: true,
      exp,
    },
    env.jwtSecret
  )
}

export async function verifyAccessToken(
  token: string
): Promise<AccessTokenPayload> {
  const payload = (await verify(token, env.jwtSecret, 'HS256')) as JwtPayload

  return {
    sub: payload.sub,
    aud: payload.aud,
    isCustomer: payload.isCustomer,
    isVendorOwner: payload.isVendorOwner,
    isAdmin: payload.isAdmin,
  }
}
