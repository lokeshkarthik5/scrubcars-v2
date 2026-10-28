/**
 * Statistics → Behaviour, at the admin API (0061): exact figures from the
 * seeded visits, and the refusals.
 *
 * The only usage events in the E2E database are the seed's (BEHAVIOUR in
 * e2e-ids.ts, which says what each group of visits did and what they add
 * up to): E2E builds record none of their own. Two days ago is well inside
 * the last 7 days, and the Test visit (eight days ago) inside the last 30.
 */
import { test, expect, asRole } from '../../support/fixtures'
import { API, loginViaApi } from '../../support/auth'
import { CUSTOMERS } from '../../support/seed-ids'

const BEHAVIOUR_API = `${API}/api/v1/admin/stats/behaviour`

const todayIst = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })
const daysBefore = (day: string, days: number) =>
  new Date(Date.parse(`${day}T00:00:00Z`) - days * 86_400_000).toISOString().slice(0, 10)

type Report = {
  visits: number
  leftOut: { team: number; test: number }
  funnel: {
    steps: Array<{ key: string; label: string; count: number | null; lost: number | null }>
    biggestLeak: { key: string; from: string; lost: number } | null
  }
  lastSteps: { leavers: number; rows: Array<{ event: string; label: string; sessions: number }> }
}

const counts = (report: Report) =>
  Object.fromEntries(report.funnel.steps.map((step) => [step.key, step.count]))

test.use({ storageState: asRole('admin') })

test.describe('behaviour API @p0', () => {
  const to = todayIst()
  const last7 = `from=${daysBefore(to, 6)}&to=${to}`
  const last30 = `from=${daysBefore(to, 29)}&to=${to}`

  async function report(page: import('@playwright/test').Page, query: string): Promise<Report> {
    const response = await page.request.get(`${BEHAVIOUR_API}?${query}`)
    expect(response.status()).toBe(200)
    const body = await response.json()
    expect(body.success).toBe(true)
    return body.data as Report
  }

  test('the funnel by visits, the last steps, and who is left out', async ({ page }) => {
    const data = await report(page, last7)
    expect(data.visits).toBe(14)
    expect(data.leftOut).toEqual({ team: 2, test: 0 })
    expect(counts(data)).toEqual({
      landed: 10,
      garageSeen: 5,
      // Nothing picks an area yet: not measured, not zero.
      area: null,
      garage: 5,
      service: 2,
      booking: 2,
      number: 2,
      paid: 1,
    })
    expect(data.funnel.steps.map((step) => step.label)).toEqual([
      'Landed',
      'Saw a garage',
      'Picked an area',
      'Opened a garage',
      'Opened a service',
      'Started booking',
      'Gave a number',
      'Paid',
    ])
    expect(data.funnel.biggestLeak).toEqual({ key: 'garageSeen', from: 'landed', lost: 5 })
    expect(data.lastSteps.leavers).toBe(9)
    expect(data.lastSteps.rows.map(({ event, sessions }) => ({ event, sessions }))).toEqual([
      { event: 'landing_view', sessions: 5 },
      { event: 'garage_view', sessions: 3 },
      { event: 'otp_sent', sessions: 1 },
    ])
  })

  test('the last 30 days also leave out the visit that made a Test booking', async ({ page }) => {
    const data = await report(page, last30)
    expect(data.leftOut).toEqual({ team: 2, test: 1 })
    expect(counts(data).landed).toBe(10)
    expect(counts(data).paid).toBe(1)
  })

  test('the Source and Device filters', async ({ page }) => {
    const instagram = await report(page, `${last7}&source=instagram`)
    expect(instagram.visits).toBe(12)
    expect(counts(instagram)).toMatchObject({ landed: 8, garageSeen: 3, paid: 0 })

    const google = await report(page, `${last7}&source=google`)
    expect(counts(google)).toMatchObject({ landed: 1, number: 1, paid: 0 })

    const direct = await report(page, `${last7}&source=direct`)
    expect(counts(direct)).toMatchObject({ landed: 1, paid: 1 })
    expect(direct.leftOut.team).toBe(2)

    const other = await report(page, `${last7}&source=other`)
    expect(other.visits).toBe(0)

    const phone = await report(page, `${last7}&device=phone`)
    expect(counts(phone)).toMatchObject({ landed: 9, paid: 1 })

    const desktop = await report(page, `${last7}&device=desktop`)
    expect(counts(desktop)).toMatchObject({ landed: 1, number: 1 })
  })

  test('refuses what the page never sends, and anyone but the team', async ({ page }) => {
    for (const query of [
      `${last7}&source=tiktok`,
      `${last7}&device=tablet`,
      `from=${to}&to=${daysBefore(to, 6)}`,
      `from=${daysBefore(to, 120)}&to=${to}`,
    ]) {
      expect((await page.request.get(`${BEHAVIOUR_API}?${query}`)).status()).toBe(400)
    }

    const customer = await loginViaApi(CUSTOMERS.stats.phone)
    const response = await customer.get(`${BEHAVIOUR_API}?${last7}`)
    expect(response.status()).toBe(403)
    expect(await response.json()).toEqual({
      success: false,
      message: 'Admin access required',
      code: 'ADMIN_REQUIRED',
    })
    await customer.dispose()
  })
})
