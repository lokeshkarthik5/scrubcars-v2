/**
 * The scheduled-job endpoint: only the scheduler holding CRON_SECRET may run
 * it, and on the E2E stack it never posts (alerts are off with fake payments).
 */
import { test, expect } from '../../support/fixtures'
import { API } from '../../support/auth'

const DIGEST = `${API}/api/v1/ops/pending-digest`
const SECRET = process.env.CRON_SECRET ?? ''

test.describe('scheduled jobs @p0', () => {
  test('refuse a caller without the scheduler secret', async ({ request }) => {
    expect((await request.post(DIGEST)).status()).toBe(401)
    expect(
      (await request.post(DIGEST, { headers: { authorization: 'Bearer wrong-secret' } })).status()
    ).toBe(401)
  })

  test('the pending-booking digest runs for the scheduler and posts nothing here', async ({
    request,
  }) => {
    test.skip(SECRET.length < 32, 'CRON_SECRET is not set for this run')
    const response = await request.post(`${DIGEST}?dryRun=1`, {
      headers: { authorization: `Bearer ${SECRET}` },
    })
    expect(response.status()).toBe(200)
    const { data } = await response.json()
    expect(data.posted).toBe(false)
    expect(typeof data.waiting).toBe('number')
    expect(typeof data.missed).toBe('number')
  })
})
