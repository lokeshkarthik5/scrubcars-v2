import type { Context } from 'hono'
import { signAdminToken } from '../../lib/jwt.js'
import { signedInAdmin, type AuthVariables } from '../../middleware/auth.middleware.js'
import { setAccessCookie } from '../admin/admin.controller.js'
import { adminLoginsService } from './admin-logins.service.js'
import type {
  ChangeOwnPasswordInput,
  CreateAdminLoginInput,
  ResetAdminPasswordInput,
  SetAdminLoginStatusInput,
} from './admin-logins.validation.js'

type AdminContext = Context<{ Variables: AuthVariables }>

export async function list(c: AdminContext) {
  return c.json({ success: true, data: await adminLoginsService.list(signedInAdmin(c)) })
}

export async function create(c: AdminContext, input: CreateAdminLoginInput) {
  return c.json({ success: true, data: await adminLoginsService.create(signedInAdmin(c), input) }, 201)
}

export async function resetPassword(c: AdminContext, id: string, input: ResetAdminPasswordInput) {
  return c.json({ success: true, data: await adminLoginsService.resetPassword(signedInAdmin(c), id, input) })
}

export async function setStatus(c: AdminContext, id: string, input: SetAdminLoginStatusInput) {
  return c.json({ success: true, data: await adminLoginsService.setStatus(signedInAdmin(c), id, input) })
}

/** Every other session of theirs ends; this one carries on with a fresh token. */
export async function changeOwnPassword(c: AdminContext, input: ChangeOwnPasswordInput) {
  const sub = await adminLoginsService.changeOwnPassword(signedInAdmin(c), input)
  setAccessCookie(c, await signAdminToken(sub))
  return c.json({ success: true })
}
