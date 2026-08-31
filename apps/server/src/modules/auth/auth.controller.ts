import type { Context } from 'hono'
import { deleteCookie, getCookie, setCookie } from 'hono/cookie'
import { env } from '../../lib/env.js'
import { AppError } from '../../lib/errors.js'
import type { TenantVariables } from '../../middleware/tenant.middleware.js'
import { authService } from './auth.service.js'
import type { SendOtpInput, VerifyOtpInput } from './auth.validation.js'

type AuthContext = Context<{ Variables: TenantVariables }>

const REFRESH_COOKIE = 'refresh_token'
const ACCESS_COOKIE = 'access_token'

const COOKIE_SAME_SITE = 'Lax'

function setRefreshCookie(c: AuthContext, token: string) {
  setCookie(c, REFRESH_COOKIE, token, {
    httpOnly: true,
    secure: !env.isDev,
    sameSite: COOKIE_SAME_SITE,
    path: '/api/v1/auth',
    maxAge: env.refreshTokenExpiresDays * 24 * 60 * 60,
  })
}

function clearRefreshCookie(c: AuthContext) {
  deleteCookie(c, REFRESH_COOKIE, {
    path: '/api/v1/auth',
    secure: !env.isDev,
    sameSite: COOKIE_SAME_SITE,
  })
}

function setAccessCookie(c: AuthContext, token: string) {
  setCookie(c, ACCESS_COOKIE, token, {
    httpOnly: true,
    secure: !env.isDev,
    sameSite: COOKIE_SAME_SITE,
    path: '/api/v1',
    maxAge: 15 * 60,
  })
}

function clearAccessCookie(c: AuthContext) {
  deleteCookie(c, ACCESS_COOKIE, {
    path: '/api/v1',
    secure: !env.isDev,
    sameSite: COOKIE_SAME_SITE,
  })
}

function sessionResponse(
  c: AuthContext,
  session: Awaited<ReturnType<typeof authService.verifyOtp>>
) {
  setRefreshCookie(c, session.refreshToken)
  setAccessCookie(c, session.accessToken)

  return c.json({
    success: true,
    data: {
      user: session.user,
      // `vendor` is the active company and is null the moment there are two of
      // them — `vendors` is the real answer. Dropping it here told a
      // multi-company user they had no garage at all, which the vendor app
      // reads as "not onboarded yet".
      vendor: session.vendor,
      vendors: session.vendors,
    },
  })
}

export async function sendOtp(c: AuthContext, input: SendOtpInput) {
  const data = await authService.sendOtp(input)

  return c.json({
    success: true,
    message: 'OTP sent successfully',
    data,
  })
}

export async function verifyOtp(c: AuthContext, input: VerifyOtpInput) {
  const session = await authService.verifyOtp(input)

  return sessionResponse(c, session)
}

export async function refresh(c: AuthContext) {
  const refreshToken = getCookie(c, REFRESH_COOKIE)

  if (!refreshToken) {
    throw new AppError(401, 'Refresh token missing', 'REFRESH_TOKEN_MISSING')
  }

  const session = await authService.refreshSession(refreshToken)

  // Shares sessionResponse rather than rebuilding the payload: the duplicate is
  // how `vendors` came to be missing from one of the two in the first place.
  return sessionResponse(c, session)
}

export async function logout(c: AuthContext) {
  const refreshToken = getCookie(c, REFRESH_COOKIE)
  await authService.logout(refreshToken)
  clearRefreshCookie(c)
  clearAccessCookie(c)

  return c.json({
    success: true,
    message: 'Logged out successfully',
  })
}

export async function getMe(c: AuthContext) {
  const auth = c.get('auth')
  const data = await authService.getMe(auth.sub, auth.aud)

  return c.json({
    success: true,
    data,
  })
}

export async function getMeCustomer(c: AuthContext) {
  const auth = c.get('auth')
  const data = await authService.getMe(auth.sub, 'customer')

  return c.json({
    success: true,
    data,
  })
}

export async function getMeVendor(c: AuthContext) {
  const auth = c.get('auth')
  const data = await authService.getMe(auth.sub, 'vendor')

  return c.json({
    success: true,
    data,
  })
}

export async function getMyVendors(c: AuthContext) {
  const vendors = await authService.listMyVendors(c.get('auth').sub)

  return c.json({
    success: true,
    data: vendors,
  })
}
