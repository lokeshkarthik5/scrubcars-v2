import type { Context } from 'hono'
import { deleteCookie, getCookie, setCookie } from 'hono/cookie'
import { env } from '../../lib/env.js'
import { AppError } from '../../lib/errors.js'
import type { AuthVariables } from '../../middleware/auth.middleware.js'
import { authService } from './auth.service.js'
import type { SendOtpInput, VerifyOtpInput } from './auth.validation.js'

type AuthContext = Context<{ Variables: AuthVariables }>

const REFRESH_COOKIE = 'refresh_token'
const ACCESS_COOKIE = 'access_token'

function setRefreshCookie(c: AuthContext, token: string) {
  setCookie(c, REFRESH_COOKIE, token, {
    httpOnly: true,
    secure: !env.isDev,
    sameSite: 'Lax',
    path: '/api/v1/auth',
    maxAge: env.refreshTokenExpiresDays * 24 * 60 * 60,
  })
}

function clearRefreshCookie(c: AuthContext) {
  deleteCookie(c, REFRESH_COOKIE, {
    path: '/api/v1/auth',
  })
}

function setAccessCookie(c: AuthContext, token: string) {
  setCookie(c, ACCESS_COOKIE, token, {
    httpOnly: true,
    secure: !env.isDev,
    sameSite: 'Lax',
    path: '/api/v1',
    maxAge: 15 * 60,
  })
}

function clearAccessCookie(c: AuthContext) {
  deleteCookie(c, ACCESS_COOKIE, {
    path: '/api/v1',
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
      vendor: session.vendor,
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
  setRefreshCookie(c, session.refreshToken)
  setAccessCookie(c, session.accessToken)

  return c.json({
    success: true,
    data: {
      user: session.user,
      vendor: session.vendor,
    },
  })
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
