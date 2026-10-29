/**
 * Personal admin logins (0058): Settings → Team logins, signing in with your
 * own login, and the panel signing every action with it.
 *
 * Only the owner's login adds logins, resets other people's passwords and
 * turns logins on or off (owner decision); everyone changes their own. The
 * owner here is ADMIN_LOGINS.e2e ("E2E Admin", the 'admin' state every admin
 * spec runs as). The shared env login (ADMIN, 'admin-shared') signs as
 * 'admin'; it makes the first login, the owner, only while there is none,
 * which the server's unit tests cover (here there is always one). The logins
 * turned off, reset or looked through here (resetMe, turnMeOff, changer,
 * viewer) are this spec's alone; nobody else signs in as them.
 */
import { request, type APIRequestContext } from '@playwright/test'
import { answerCookieQuestion } from '../../support/consent'
import { test, expect, asRole } from '../../support/fixtures'
import { API } from '../../support/auth'
import { sql } from '../../support/db'
import { ADMIN, ADMIN_LOGINS } from '../../support/seed-ids'
import { hashPassword } from '../../../server/src/lib/passwords'

const ME = `${API}/api/v1/admin/me`

/**
 * Puts one of this spec's logins back as seeded (on, its own password, old
 * sessions allowed), so a retry starts where the first try did.
 */
async function restore(login: { id: string; password: string }) {
  await sql`
    update admin_logins
       set status = 'active', password_hash = ${await hashPassword(login.password)},
           sessions_from = now() - interval '30 days'
     where id = ${login.id}
  `
}

/** A fresh API session for one login, or the status its sign-in got. */
async function signIn(username: string, password: string): Promise<{ status: number; ctx: APIRequestContext }> {
  const ctx = await request.newContext({ baseURL: API, storageState: { cookies: [], origins: [] } })
  const res = await ctx.post('/api/v1/admin/login', { data: { username, password } })
  return { status: res.status(), ctx }
}

test.describe('your own login @p0', () => {
  test('signs in through the form, shows who you are, and signs what you do', async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: { cookies: [], origins: [] } })
    await answerCookieQuestion(ctx)
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
      isOwner: true,
      // Whose typed booking notes are whose (0065).
      sub: `admin:${ADMIN_LOGINS.e2e.id}`,
    })
    await ctx.close()
  })

  test('the shared login still gets in, and signs as admin', async () => {
    const { status, ctx } = await signIn(ADMIN.username, ADMIN.password)
    expect(status).toBe(200)
    expect((await (await ctx.get('/api/v1/admin/me')).json()).data).toMatchObject({ kind: 'shared', name: 'admin', username: null, isOwner: false })
    // There is an owner, so the shared login can no longer add logins.
    const add = await ctx.post('/api/v1/admin/logins', { data: { username: 'e2e-sneaky', name: 'Sneaky E2E', password: 'sneaky-e2e-password' } })
    expect(add.status()).toBe(403)
    expect((await add.json()).code).toBe('ADMIN_OWNER_ONLY')
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

test.describe('Team logins: the owner', () => {
  test.use({ storageState: asRole('admin') })

  test('the owner adds a login for a person, who can then sign in', async ({ page }) => {
    await page.goto('/settings')
    await page.getByRole('link', { name: /Team logins/ }).click()
    await expect(page).toHaveURL(/\/settings\/team$/)
    const owner = page.getByRole('list', { name: 'Team logins' }).getByRole('listitem').filter({ hasText: ADMIN_LOGINS.e2e.name })
    await expect(owner.getByText('Owner', { exact: true })).toBeVisible()

    // A new name each try: a retry finds the first try's login still there.
    const tag = String(Date.now()).slice(-6)
    const name = `Kavya E2E ${tag}`
    const username = `e2e-kavya-${tag}`
    await page.getByLabel('Name', { exact: true }).fill(name)
    await page.getByLabel('Username', { exact: true }).fill(username)
    await page.getByLabel('Temporary password', { exact: true }).fill('kavya-e2e-password')
    await page.getByRole('button', { name: 'Add login' }).click()

    const list = page.getByRole('list', { name: 'Team logins' })
    await expect(list.getByRole('listitem').filter({ hasText: name })).toBeVisible()
    await expect(list.getByRole('listitem').filter({ hasText: `@${username}` })).toBeVisible()

    const { status, ctx } = await signIn(username, 'kavya-e2e-password')
    expect(status).toBe(200)
    await ctx.dispose()
    // Who made it is in the history; never the password.
    const [audit] = await sql<{ actor_name: string; summary: string; detail: string }[]>`
      select actor_name, summary::text, detail::text from admin_audit_log
       where action = 'admin_login_created' and summary->>'username' = ${username}
    `
    expect(audit.actor_name).toBe(ADMIN_LOGINS.e2e.name)
    expect(audit.summary + audit.detail).not.toContain('kavya-e2e-password')
  })

  test('turning a login off signs that person out at once', async ({ page }) => {
    const login = ADMIN_LOGINS.turnMeOff
    await restore(login)
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

  test('the owner resets a password: the person is signed out, the new password works @p0', async ({ page }) => {
    const login = ADMIN_LOGINS.resetMe
    await restore(login)
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

test.describe('Team logins: anyone but the owner @p0', () => {
  test('sees the list with no controls, and the API refuses them', async ({ browser }) => {
    const login = ADMIN_LOGINS.viewer
    const ctx = await browser.newContext({ storageState: { cookies: [], origins: [] } })
    await answerCookieQuestion(ctx)
    const page = await ctx.newPage()
    await page.goto('/login')
    await page.getByLabel('Username').fill(login.username)
    await page.getByLabel('Password').fill(login.password)
    await page.getByRole('button', { name: 'Sign in' }).click()
    await expect(page).not.toHaveURL(/\/login/)

    await page.goto('/settings/team')
    await expect(page.getByText('Only the owner can add logins, reset passwords or turn logins on or off.')).toBeVisible()
    const list = page.getByRole('list', { name: 'Team logins' })
    await expect(list.getByRole('listitem').filter({ hasText: ADMIN_LOGINS.resetMe.name })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Reset password' })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Turn off' })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Add login' })).toHaveCount(0)
    await expect(page.getByLabel('Temporary password')).toHaveCount(0)
    // Their own password is still theirs to change.
    await expect(page.getByRole('button', { name: 'Change password' })).toBeVisible()

    // Hidden buttons are not the rule: the server refuses them too.
    for (const [path, data] of [
      [`/api/v1/admin/logins/${ADMIN_LOGINS.resetMe.id}/password`, { password: 'taken-over-e2e' }],
      [`/api/v1/admin/logins/${ADMIN_LOGINS.e2e.id}/status`, { status: 'off' }],
      ['/api/v1/admin/logins', { username: 'e2e-sneaky', name: 'Sneaky E2E', password: 'sneaky-e2e-password' }],
    ] as const) {
      const res = await ctx.request.post(`${API}${path}`, { data })
      expect({ path, status: res.status(), code: (await res.json()).code }).toEqual({ path, status: 403, code: 'ADMIN_OWNER_ONLY' })
    }
    expect((await signIn(ADMIN_LOGINS.resetMe.username, 'taken-over-e2e')).status).toBe(401)
    await ctx.close()
  })
})

test.describe('your password', () => {
  test('a person changes their own password with the current one', async ({ browser }) => {
    const login = ADMIN_LOGINS.changer
    await restore(login)
    const ctx = await browser.newContext({ storageState: { cookies: [], origins: [] } })
    await answerCookieQuestion(ctx)
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
