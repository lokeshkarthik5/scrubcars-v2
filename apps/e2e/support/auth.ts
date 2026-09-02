/**
 * Session minting for tests.
 *
 * Logging in through the UI costs a page load, two API round trips and a
 * six-box OTP entry. Doing that at the top of every spec would dominate the
 * run and would re-test the login flow dozens of times over — specs/users/
 * auth.spec.ts already covers it properly, once.
 *
 * So every other spec starts from a saved storageState. The cookies are set by
 * the API on localhost:8080 at path /api/v1 with SameSite=Lax; ports do not
 * affect same-site, so a page on :3000 sends them to :8080 normally and a
 * storageState captured here works in the browser unchanged.
 */
import { request, type APIRequestContext, type BrowserContext } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { latestOtp } from './db'
import { ADMIN } from './seed-ids'

const dir = path.dirname(fileURLToPath(import.meta.url))
export const AUTH_DIR = path.resolve(dir, '../.auth')

export const API = process.env.E2E_API_URL ?? 'http://localhost:8080'

export type Audience = 'customer' | 'vendor'

/** Where a role's storageState lives. Roles are named, not numbered, so a
 *  failing spec names the identity it was using. */
export const statePath = (role: string) => path.join(AUTH_DIR, `${role}.json`)

/**
 * Runs the real OTP exchange over HTTP and returns a context holding the
 * resulting cookies.
 *
 * This is the genuine endpoint pair, not a shortcut that forges a JWT: if
 * login breaks, every spec fails at setup, which is the correct blast radius.
 */
export async function loginViaApi(
  phone: string,
  audience: Audience = 'customer'
): Promise<APIRequestContext> {
  const ctx = await request.newContext({ baseURL: API })

  const send = await ctx.post('/api/v1/auth/otp/send', {
    data: { phone, purpose: 'login', audience },
  })
  if (!send.ok()) {
    throw new Error(`otp/send failed for ${phone}: ${send.status()} ${await send.text()}`)
  }

  const otp = await latestOtp(phone)

  const verify = await ctx.post('/api/v1/auth/otp/verify', {
    data: { phone, otp, purpose: 'login', audience },
  })
  if (!verify.ok()) {
    throw new Error(`otp/verify failed for ${phone}: ${verify.status()} ${await verify.text()}`)
  }

  return ctx
}

/** Logs in and writes the cookies to .auth/<role>.json for reuse by specs. */
export async function saveState(role: string, phone: string, audience: Audience = 'customer') {
  const ctx = await loginViaApi(phone, audience)
  fs.mkdirSync(AUTH_DIR, { recursive: true })
  await ctx.storageState({ path: statePath(role) })
  await ctx.dispose()
}

/** The admin panel uses username/password, not OTP — a separate token shape
 *  (`sub: 'admin'`) with its own 12-hour lifetime. */
export async function saveAdminState(role = 'admin') {
  const ctx = await request.newContext({ baseURL: API })
  const res = await ctx.post('/api/v1/admin/login', {
    data: { username: ADMIN.username, password: ADMIN.password },
  })
  if (!res.ok()) {
    throw new Error(`admin/login failed: ${res.status()} ${await res.text()}`)
  }
  fs.mkdirSync(AUTH_DIR, { recursive: true })
  await ctx.storageState({ path: statePath(role) })
  await ctx.dispose()
}

/**
 * Points the vendor apps at a specific tenant.
 *
 * The API reads the tenant from an X-Vendor-Id header that the client attaches
 * from `localStorage['detlio.activeVendorId']`. Without seeding it, an owner
 * with two garages lands on whichever the app picks, and a tenancy assertion
 * would be testing a coin flip.
 */
export async function setActiveVendor(context: BrowserContext, vendorId: string) {
  await context.addInitScript(
    ([key, id]) => window.localStorage.setItem(key, id),
    ['detlio.activeVendorId', vendorId] as const
  )
}
