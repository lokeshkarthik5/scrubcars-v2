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

export const loginIdParamSchema = z.object({ id: z.string().uuid() })

export const createAdminLoginSchema = z.object({ username, name, password }).strict()

export const resetAdminPasswordSchema = z.object({ password }).strict()

export const setAdminLoginStatusSchema = z.object({ status: z.enum(['active', 'off']) }).strict()

export const changeOwnPasswordSchema = z
  .object({ currentPassword: z.string().min(1).max(ADMIN_LOGIN_LIMITS.passwordMax), newPassword: password })
  .strict()

export type CreateAdminLoginInput = z.infer<typeof createAdminLoginSchema>
export type ResetAdminPasswordInput = z.infer<typeof resetAdminPasswordSchema>
export type SetAdminLoginStatusInput = z.infer<typeof setAdminLoginStatusSchema>
export type ChangeOwnPasswordInput = z.infer<typeof changeOwnPasswordSchema>
