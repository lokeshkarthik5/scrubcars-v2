/**
 * Admin → Alerts: whether the team's Telegram alerts are set up, and "Send
 * test alert". On the E2E stack TELEGRAM_BOT_TOKEN and TELEGRAM_OPS_CHAT_ID
 * are empty (.env.e2e), so the page says Telegram is not set up and the test
 * says so too; nothing is ever posted from here.
 */
import { test, expect, asRole } from '../../support/fixtures'
import { API, loginViaApi } from '../../support/auth'
import { CUSTOMERS } from '../../support/seed-ids'

const STATUS = `${API}/api/v1/admin/alerts/telegram`

test.use({ storageState: asRole('admin') })

test.describe('Telegram test alert @p0', () => {
  test('the page says Telegram is not set up, and so does the test button', async ({ page }) => {
    await page.goto('/alerts')
    await expect(page.getByRole('heading', { name: 'Alerts', exact: true })).toBeVisible()
    await expect(page.getByText('Telegram not set up', { exact: false }).first()).toBeVisible()

    // Signed by the session (0058): there is no name to type.
    await expect(page.getByLabel('Your name')).toHaveCount(0)
    await page.getByRole('button', { name: 'Send test alert' }).click()
    await expect(page.getByRole('status').filter({ hasText: 'Telegram not set up' })).toBeVisible()
  })

  test('the API answers an admin, and nobody else', async ({ page }) => {
    const response = await page.request.get(STATUS)
    expect(response.status()).toBe(200)
    expect((await response.json()).data).toEqual({ configured: false, liveHere: false })

    const customer = await loginViaApi(CUSTOMERS.pushOutsider.phone)
    expect((await customer.get(STATUS)).status()).toBe(403)
    expect((await customer.post(`${STATUS}/test`, { data: {} })).status()).toBe(403)
    await customer.dispose()
  })
})
