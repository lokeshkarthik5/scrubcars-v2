import { z } from 'zod'
import {
  ADMIN_LOGIN_LIMITS,
  adminNameProblem,
  adminPasswordProblem,
  adminUsernameProblem,
  normalizeAdminName,
  normalizeAdminUsername,
} from '../../lib/admin-logins.js'

/** A rule from lib/admin-logins.ts, as a zod check with the same words. */
function ruled(problem: (value: string) => string | null) {
  return (value: string, ctx: z.RefinementCtx) => {
    const message = problem(value)
    if (message) ctx.addIssue({ code: 'custom', message })
  }
}

const username = z.string().max(100).superRefine(ruled(adminUsernameProblem)).transform(normalizeAdminUsername)
const name = z.string().max(200).superRefine(ruled(adminNameProblem)).transform(normalizeAdminName)
// Never trimmed: a space in a password is part of it.
const password = z.string().max(ADMIN_LOGIN_LIMITS.passwordMax).superRefine(ruled(adminPasswordProblem))

// Optional (0059), only for "Also send on WhatsApp" with a collection list:
// a 10-digit Indian mobile, spaces and dashes dropped. Blank or null clears it.
const phone = z
  .string()
  .transform((value) => value.replace(/[\s-]/g, ''))
  .pipe(z.string().regex(/^(?:[6-9]\d{9})?$/, 'Enter a 10-digit Indian mobile number'))
  .nullable()
  .transform((value) => (value ? value : null))

export const loginIdParamSchema = z.object({ id: z.string().uuid() })

export const createAdminLoginSchema = z.object({ username, name, password, phone: phone.optional() }).strict()

/** PATCH /admin/logins/:id (0059): only the phone today. */
export const updateAdminLoginSchema = z.object({ phone: phone.optional() }).strict()

export const resetAdminPasswordSchema = z.object({ password }).strict()

export const setAdminLoginStatusSchema = z.object({ status: z.enum(['active', 'off']) }).strict()

export const changeOwnPasswordSchema = z
  .object({ currentPassword: z.string().min(1).max(ADMIN_LOGIN_LIMITS.passwordMax), newPassword: password })
  .strict()

export type CreateAdminLoginInput = z.infer<typeof createAdminLoginSchema>
export type UpdateAdminLoginInput = z.infer<typeof updateAdminLoginSchema>
export type ResetAdminPasswordInput = z.infer<typeof resetAdminPasswordSchema>
export type SetAdminLoginStatusInput = z.infer<typeof setAdminLoginStatusSchema>
export type ChangeOwnPasswordInput = z.infer<typeof changeOwnPasswordSchema>
