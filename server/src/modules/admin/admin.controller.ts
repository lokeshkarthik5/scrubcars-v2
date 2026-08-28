import type { Context } from 'hono'
import { deleteCookie, setCookie } from 'hono/cookie'
import { env } from '../../lib/env.js'
import type { AuthVariables } from '../../middleware/auth.middleware.js'
import { membersService } from '../members/members.service.js'
import { adminService } from './admin.service.js'
import type {
  AddMemberInput,
  UpdateMemberInput,
} from '../members/members.validation.js'
import type {
  GrantSuperAdminInput,
  CreateVendorInput,
  ListBookingsQuery,
  LoginInput,
  MediaUrlInput,
  UpdateVendorInput,
  UploadUrlInput,
} from './admin.validation.js'

type AdminContext = Context<{ Variables: AuthVariables }>

const ACCESS_COOKIE = 'access_token'
const COOKIE_SAME_SITE = 'Lax'
const ADMIN_TOKEN_MAX_AGE = 12 * 60 * 60 // keep in sync with env.adminTokenExpiresIn
// Scope the admin token to /api/v1/admin only. A broader path (e.g. /api/v1)
// leaks the admin cookie into /api/v1/auth/me, where the customer/vendor
// AuthProvider on the admin subdomain then hits authService.getMe('admin', …)
// → findUserById('admin') → invalid UUID → 500.
const ADMIN_COOKIE_PATH = '/api/v1/admin'

function setAccessCookie(c: AdminContext, token: string) {
  setCookie(c, ACCESS_COOKIE, token, {
    httpOnly: true,
    secure: !env.isDev,
    sameSite: COOKIE_SAME_SITE,
    path: ADMIN_COOKIE_PATH,
    maxAge: ADMIN_TOKEN_MAX_AGE,
  })
}

function clearAccessCookie(c: AdminContext) {
  deleteCookie(c, ACCESS_COOKIE, {
    path: ADMIN_COOKIE_PATH,
    secure: !env.isDev,
    sameSite: COOKIE_SAME_SITE,
  })
}

export async function login(c: AdminContext, input: LoginInput) {
  const { accessToken } = await adminService.login(input)
  setAccessCookie(c, accessToken)
  return c.json({ success: true, data: { isSuperAdmin: true } })
}

export async function logout(c: AdminContext) {
  clearAccessCookie(c)
  return c.json({ success: true })
}

export async function getMe(c: AdminContext) {
  return c.json({ success: true, data: { isSuperAdmin: true } })
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

// ─── Media ───────────────────────────────────────────────────────────────────

export async function createVendorLogoUploadUrl(
  c: AdminContext,
  vendorId: string,
  input: UploadUrlInput
) {
  const data = await adminService.createVendorLogoUploadUrl(vendorId, input)
  return c.json({ success: true, data })
}

export async function setVendorLogo(
  c: AdminContext,
  vendorId: string,
  input: MediaUrlInput
) {
  const vendor = await adminService.setVendorLogo(vendorId, input)
  return c.json({ success: true, data: vendor })
}

export async function deleteVendorLogo(c: AdminContext, vendorId: string) {
  const vendor = await adminService.deleteVendorLogo(vendorId)
  return c.json({ success: true, data: vendor })
}

export async function createVendorPhotoUploadUrl(
  c: AdminContext,
  vendorId: string,
  input: UploadUrlInput
) {
  const data = await adminService.createVendorPhotoUploadUrl(vendorId, input)
  return c.json({ success: true, data })
}

export async function addVendorPhoto(
  c: AdminContext,
  vendorId: string,
  input: MediaUrlInput
) {
  const photo = await adminService.addVendorPhoto(vendorId, input)
  return c.json({ success: true, data: photo }, 201)
}

export async function deleteVendorPhoto(
  c: AdminContext,
  vendorId: string,
  photoId: string
) {
  const photo = await adminService.deleteVendorPhoto(vendorId, photoId)
  return c.json({ success: true, data: photo })
}

export async function createServiceImageUploadUrl(
  c: AdminContext,
  serviceId: string,
  input: UploadUrlInput
) {
  const data = await adminService.createServiceImageUploadUrl(serviceId, input)
  return c.json({ success: true, data })
}

export async function addServiceImage(
  c: AdminContext,
  serviceId: string,
  input: MediaUrlInput
) {
  const images = await adminService.addServiceImage(serviceId, input)
  return c.json({ success: true, data: images }, 201)
}

export async function deleteServiceImage(
  c: AdminContext,
  serviceId: string,
  imageId: string
) {
  const images = await adminService.deleteServiceImage(serviceId, imageId)
  return c.json({ success: true, data: images })
}

// ─── Platform admins ─────────────────────────────────────────────────────────

export async function listSuperAdmins(c: AdminContext) {
  const admins = await adminService.listSuperAdmins()
  return c.json({ success: true, data: admins })
}

export async function grantSuperAdmin(
  c: AdminContext,
  input: GrantSuperAdminInput
) {
  // The env-credential session has no users row, so it cannot be attributed.
  const sub = c.get('auth').sub
  const grantedBy = sub === 'admin' ? null : sub

  const grant = await adminService.grantSuperAdmin(input, grantedBy)
  return c.json({ success: true, data: grant }, 201)
}

export async function revokeSuperAdmin(c: AdminContext, id: string) {
  await adminService.revokeSuperAdmin(id)
  return c.json({ success: true })
}

// ─── Vendor team ─────────────────────────────────────────────────────────────
//
// The same service the vendor-facing team screen uses. It takes the vendorId as
// an argument and never reads a tenant, so mounting it here needs no new
// business logic — and the owner-immutability rules come along with it rather
// than having to be restated.

/**
 * Who made this change. The break-glass session has no `users` row, so its
 * changes land with `added_by = null` — "someone with the admin password". A
 * named super-admin is attributable; the shared credential is not.
 */
function getAdminActorId(c: AdminContext): string | null {
  const sub = c.get('auth').sub
  return sub === 'admin' ? null : sub
}

export async function listVendorMembers(c: AdminContext, vendorId: string) {
  const members = await membersService.listMembers(vendorId)
  return c.json({ success: true, data: members })
}

export async function addVendorMember(
  c: AdminContext,
  vendorId: string,
  input: AddMemberInput
) {
  const member = await membersService.addMember(
    vendorId,
    getAdminActorId(c),
    input
  )
  return c.json({ success: true, data: member }, 201)
}

export async function updateVendorMember(
  c: AdminContext,
  vendorId: string,
  membershipId: string,
  input: UpdateMemberInput
) {
  const member = await membersService.updateMember(
    vendorId,
    getAdminActorId(c),
    membershipId,
    input
  )
  return c.json({ success: true, data: member })
}

export async function removeVendorMember(
  c: AdminContext,
  vendorId: string,
  membershipId: string
) {
  await membersService.removeMember(vendorId, getAdminActorId(c), membershipId)
  return c.json({ success: true })
}
