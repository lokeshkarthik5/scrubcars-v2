/**
 * The Detlio Service History certificate (0053).
 *
 * CUSTOMERS.certificate's Maruti Baleno (plate TN09AB3301) has two completed,
 * paid jobs at VENDORS.certificate (a machine polish ~60 days ago, a wash ~12
 * days ago) and one cancelled wash. The owner shares the certificate, a
 * stranger opens /verify/<token> signed out and sees both jobs and a masked
 * plate with none of the owner's details; once the owner stops sharing, the
 * same link says so. Fixture ids 3300–3399 only (seedCertificateRows).
 */
import { test, expect, asRole } from '../../support/fixtures'
import { answerCookieQuestion } from '../../support/consent'
import { CUSTOMERS, VENDORS } from '../../support/seed-ids'

test.use({ storageState: asRole('customer-certificate') })

const CAR = CUSTOMERS.certificate.vehicleId

test.describe('service history certificate', () => {
  test('share, check it signed out, then stop sharing @p0', async ({ page, browser }) => {
    await page.goto(`/profile/cars/${CAR}/certificate`)

    // The owner's copy: two completed jobs, newest first; the cancelled one is not there.
    const jobs = page.getByRole('list', { name: /Jobs on this Maruti Baleno/ })
    await expect(jobs.getByRole('listitem')).toHaveCount(2)
    await expect(jobs.getByRole('listitem').nth(0)).toContainText('Record Foam Wash')
    await expect(jobs.getByRole('listitem').nth(1)).toContainText('Record Machine Polish')
    await expect(page.getByText('TN09 ** ** 3301')).toBeVisible()

    // Share: a link (and a QR code on the certificate).
    await page.getByRole('button', { name: 'Share link' }).click()
    const shortLink = page.getByText(/\/verify\/[A-Za-z0-9_-]{32}$/).first()
    await expect(shortLink).toBeVisible()
    await expect(page.getByRole('img', { name: 'QR code to check this certificate on Detlio' })).toBeVisible()
    const token = (await shortLink.innerText()).match(/\/verify\/([A-Za-z0-9_-]{32})/)![1]

    // A stranger, signed out.
    const stranger = await browser.newContext({ baseURL: new URL(page.url()).origin })
    await answerCookieQuestion(stranger)
    const publicPage = await stranger.newPage()
    await publicPage.goto(`/verify/${token}`)
    await expect(publicPage.getByText('Genuine Detlio record')).toBeVisible()
    const publicJobs = publicPage.getByRole('list', { name: /Jobs on this Maruti Baleno/ })
    await expect(publicJobs.getByRole('listitem')).toHaveCount(2)
    await expect(publicJobs).toContainText(VENDORS.certificate.name)
    await expect(publicPage.getByText('TN09 ** ** 3301')).toBeVisible()
    const text = await publicPage.locator('main').innerText()
    for (const personal of [CUSTOMERS.certificate.name, CUSTOMERS.certificate.phone, 'TN09AB3301', '₹']) {
      expect(text).not.toContain(personal)
    }
    // No photos unless the owner includes them.
    await expect(publicPage.getByRole('img', { name: /^Before:/ })).toHaveCount(0)

    // Stop sharing: the same link says so.
    await page.getByRole('button', { name: 'Stop sharing' }).click()
    await page.getByRole('alert').getByRole('button', { name: 'Stop sharing' }).click()
    await expect(page.getByRole('button', { name: 'Share link' })).toBeVisible()

    await publicPage.reload()
    await expect(publicPage.getByRole('heading', { name: 'This certificate is no longer shared' })).toBeVisible()
    await expect(publicPage.getByText('Record Foam Wash')).toHaveCount(0)
    await stranger.close()
  })

  test('the car’s history page links to it', async ({ page }) => {
    await page.goto(`/profile/cars/${CAR}`)
    await page.getByRole('link', { name: /Service history certificate/ }).click()
    await expect(page).toHaveURL(new RegExp(`/profile/cars/${CAR}/certificate$`))
  })
})
