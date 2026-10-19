/**
 * Personal admin logins (0058): Settings → Team logins, signing in with your
 * own login, and the panel signing every action with it.
 *
 * The shared env login (ADMIN, the 'admin-shared' state) is the bootstrap:
 * it signs as 'admin' and is how the first logins are made. Every other
 * admin spec runs as ADMIN_LOGINS.e2e ("E2E Admin"). The logins turned off
 * or reset here (ADMIN_LOGINS.resetMe, turnMeOff, changer) are this spec's
 * alone; nobody else signs in as them.
 */
import { request, type APIRequestContext } from '@playwright/test'
import { test, expect, asRole } from '../../support/fixtures'
import { API } from '../../support/auth'
import { sql } from '../../support/db'
import { ADMIN, ADMIN_LOGINS } from '../../support/seed-ids'

const ME = `${API}/api/v1/admin/me`

/** A fresh API session for one login, or the status its sign-in got. */
async function signIn(username: string, password: string): Promise<{ status: number; ctx: APIRequestContext }> {
  const ctx = await request.newContext({ baseURL: API, storageState: { cookies: [], origins: [] } })
  const res = await ctx.post('/api/v1/admin/login', { data: { username, password } })
  return { status: res.status(), ctx }
}

test.describe('your own login @p0', () => {
  test('signs in through the form, shows who you are, and signs what you do', async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: { cookies: [], origins: [] } })
    const page = await ctx.newPage()
    await page.goto('/login')
    await page.getByLabel('Username').fill(` ${ADMIN_LOGINS.e2e.username.toUpperCase()} `)
    await page.getByLabel('Password').fill(ADMIN_LOGINS.e2e.password)
    await page.getByRole('button', { name: 'Sign in' }).click()
    await expect(page).not.toHaveURL(/\/login/)
    await expect(page.getByText(ADMIN_LOGINS.e2e.name, { exact: true }).first()).toBeVisible()

    // A typed name is ignored: the session signs it.
    const me = await ctx.request.get(ME)
    expect((await me.json()).data).toEqual({
      isSuperAdmin: true,
      kind: 'personal',
      name: ADMIN_LOGINS.e2e.name,
      username: ADMIN_LOGINS.e2e.username,
    })
    await ctx.close()
  })

  test('the shared login still gets in, and signs as admin', async () => {
    const { status, ctx } = await signIn(ADMIN.username, ADMIN.password)
    expect(status).toBe(200)
    expect((await (await ctx.get('/api/v1/admin/me')).json()).data).toMatchObject({ kind: 'shared', name: 'admin', username: null })
    await ctx.dispose()
  })

  test('a login that is off, or a wrong password, is refused alike', async () => {
    for (const [username, password] of [
      [ADMIN_LOGINS.off.username, ADMIN_LOGINS.off.password],
      [ADMIN_LOGINS.e2e.username, 'not-the-password'],
      ['nobody-here', 'not-the-password'],
    ] as const) {
      const { status, ctx } = await signIn(username, password)
      expect({ username, status }).toEqual({ username, status: 401 })
      await ctx.dispose()
    }
  })
})

test.describe('Team logins', () => {
  test.use({ storageState: asRole('admin-shared') })

  test('the shared login adds a login for a person, who can then sign in', async ({ page }) => {
    await page.goto('/settings')
    await page.getByRole('link', { name: /Team logins/ }).click()
    await expect(page).toHaveURL(/\/settings\/team$/)
    await expect(
      page.getByText('You’re on the shared login. Add a login for each person, then sign in with your own.')
    ).toBeVisible()

    await page.getByLabel('Name', { exact: true }).fill('Kavya E2E')
    await page.getByLabel('Username', { exact: true }).fill('e2e-kavya')
    await page.getByLabel('Temporary password', { exact: true }).fill('kavya-e2e-password')
    await page.getByRole('button', { name: 'Add login' }).click()

    const list = page.getByRole('list', { name: 'Team logins' })
    await expect(list.getByRole('listitem').filter({ hasText: 'Kavya E2E' })).toBeVisible()
    await expect(list.getByRole('listitem').filter({ hasText: '@e2e-kavya' })).toBeVisible()

    const { status, ctx } = await signIn('e2e-kavya', 'kavya-e2e-password')
    expect(status).toBe(200)
    await ctx.dispose()
    // Who made it is in the history; never the password.
    const [audit] = await sql<{ actor_name: string; summary: string; detail: string }[]>`
      select actor_name, summary::text, detail::text from admin_audit_log
       where action = 'admin_login_created' and summary->>'username' = 'e2e-kavya'
    `
    expect(audit.actor_name).toBe('admin')
    expect(audit.summary + audit.detail).not.toContain('kavya-e2e-password')
  })

  test('turning a login off signs that person out at once', async ({ page }) => {
    const login = ADMIN_LOGINS.turnMeOff
    const { ctx } = await signIn(login.username, login.password)
    expect((await ctx.get('/api/v1/admin/me')).status()).toBe(200)

    await page.goto('/settings/team')
    const row = page.getByRole('list', { name: 'Team logins' }).getByRole('listitem').filter({ hasText: login.name })
    await row.getByRole('button', { name: 'Turn off' }).click()
    await page.getByRole('dialog').getByRole('button', { name: 'Turn off' }).click()
    await expect(row.getByText('Off', { exact: true })).toBeVisible()

    const ended = await ctx.get('/api/v1/admin/me')
    expect(ended.status()).toBe(401)
    expect((await ended.json()).code).toBe('ADMIN_SESSION_ENDED')
    expect((await signIn(login.username, login.password)).status).toBe(401)
    await ctx.dispose()
  })

  test('a password reset signs the person out; the new password works', async ({ page }) => {
    const login = ADMIN_LOGINS.resetMe
    const { ctx } = await signIn(login.username, login.password)

    await page.goto('/settings/team')
    const row = page.getByRole('list', { name: 'Team logins' }).getByRole('listitem').filter({ hasText: login.name })
    await row.getByRole('button', { name: 'Reset password' }).click()
    const sheet = page.getByRole('dialog')
    await sheet.getByLabel('New password', { exact: true }).fill('raga-new-password')
    await sheet.getByRole('button', { name: 'Set new password' }).click()
    await expect(sheet).toBeHidden()

    expect((await ctx.get('/api/v1/admin/me')).status()).toBe(401)
    await ctx.dispose()
    expect((await signIn(login.username, login.password)).status).toBe(401)
    const fresh = await signIn(login.username, 'raga-new-password')
    expect(fresh.status).toBe(200)
    await fresh.ctx.dispose()
  })
})

test.describe('your password', () => {
  test('a person changes their own password with the current one', async ({ browser }) => {
    const login = ADMIN_LOGINS.changer
    const ctx = await browser.newContext({ storageState: { cookies: [], origins: [] } })
    const page = await ctx.newPage()
    await page.goto('/login')
    await page.getByLabel('Username').fill(login.username)
    await page.getByLabel('Password').fill(login.password)
    await page.getByRole('button', { name: 'Sign in' }).click()
    await expect(page).not.toHaveURL(/\/login/)

    await page.goto('/settings/team')
    // Their own row: no turning themselves off.
    const mine = page.getByRole('list', { name: 'Team logins' }).getByRole('listitem').filter({ hasText: login.name })
    await expect(mine.getByText('You', { exact: true })).toBeVisible()
    await expect(mine.getByRole('button', { name: 'Turn off' })).toHaveCount(0)

    await page.getByLabel('Current password', { exact: true }).fill(login.password)
    await page.getByLabel('Your new password', { exact: true }).fill('owner-new-password')
    await page.getByRole('button', { name: 'Change password' }).click()
    await expect(page.getByText('Password changed. Your other sessions are signed out.')).toBeVisible()

    // This session carries on; the old password no longer works.
    expect((await ctx.request.get(ME)).status()).toBe(200)
    expect((await signIn(login.username, login.password)).status).toBe(401)
    expect((await signIn(login.username, 'owner-new-password')).status).toBe(200)
    await ctx.close()
  })
})
