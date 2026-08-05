import type { Context } from 'hono'
import { deleteCookie, setCookie } from 'hono/cookie'
import { env } from '../../lib/env.js'
import type { AuthVariables } from '../../middleware/auth.middleware.js'
import { adminService } from './admin.service.js'
import type {
  CreateVendorInput,
  ListBookingsQuery,
  LoginInput,
  UpdateVendorInput,
} from './admin.validation.js'

type AdminContext = Context<{ Variables: AuthVariables }>

const ACCESS_COOKIE = 'access_token'
const COOKIE_SAME_SITE = 'Lax'
const ADMIN_TOKEN_MAX_AGE = 12 * 60 * 60 // keep in sync with env.adminTokenExpiresIn

function setAccessCookie(c: AdminContext, token: string) {
  setCookie(c, ACCESS_COOKIE, token, {
    httpOnly: true,
    secure: !env.isDev,
    sameSite: COOKIE_SAME_SITE,
    path: '/api/v1',
    maxAge: ADMIN_TOKEN_MAX_AGE,
  })
}

function clearAccessCookie(c: AdminContext) {
  deleteCookie(c, ACCESS_COOKIE, {
    path: '/api/v1',
    secure: !env.isDev,
    sameSite: COOKIE_SAME_SITE,
  })
}

export async function login(c: AdminContext, input: LoginInput) {
  const { accessToken } = await adminService.login(input)
  setAccessCookie(c, accessToken)
  return c.json({ success: true, data: { isAdmin: true } })
}

export async function logout(c: AdminContext) {
  clearAccessCookie(c)
  return c.json({ success: true })
}

export async function getMe(c: AdminContext) {
  return c.json({ success: true, data: { isAdmin: true } })
}

export async function listVendors(c: AdminContext) {
  const vendors = await adminService.listVendors()
  return c.json({ success: true, data: vendors })
}

export async function getVendor(c: AdminContext, id: string) {
  const vendor = await adminService.getVendor(id)
  return c.json({ success: true, data: vendor })
}

export async function updateVendor(
  c: AdminContext,
  id: string,
  input: UpdateVendorInput
) {
  const vendor = await adminService.updateVendor(id, input)
  return c.json({ success: true, data: vendor })
}

export async function verifyVendor(c: AdminContext, id: string) {
  const vendor = await adminService.verifyVendor(id)
  return c.json({ success: true, data: vendor })
}

export async function archiveVendor(c: AdminContext, id: string) {
  const vendor = await adminService.archiveVendor(id)
  return c.json({ success: true, data: vendor })
}

export async function unarchiveVendor(c: AdminContext, id: string) {
  const vendor = await adminService.unarchiveVendor(id)
  return c.json({ success: true, data: vendor })
}

export async function deleteVendor(c: AdminContext, id: string) {
  await adminService.deleteVendor(id)
  return c.json({ success: true })
}

export async function createVendor(c: AdminContext, input: CreateVendorInput) {
  const vendor = await adminService.createVendor(input)
  return c.json({ success: true, data: vendor }, 201)
}

export async function listBookings(c: AdminContext, query: ListBookingsQuery) {
  const bookings = await adminService.listBookings(query)
  return c.json({ success: true, data: bookings })
}
