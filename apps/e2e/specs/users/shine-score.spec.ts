/**
 * Shine Score (0078), as SHINE.customer: Home's tile opens the guided photos;
 * four photos (the 1-pixel fixture, so the on-device check warns before
 * scoring), Get my score, and the result: the fake reading's 59, the summary
 * from the numbers, a score per area, what was noticed, the seeded garage's
 * "Interior + exterior wash" with Next free times that open checkout, Share,
 * and the footnote. Then a finished booking's "Your Shine went 46 → 92",
 * from the seeded garage photos and score.
 *
 * SHINE_SCORE_ENABLED=on and AI_FAKE=1 in .env.e2e. The customer's scans are
 * deleted first, so a retry has its three free scans back. The phone is put
 * at the seeded garage (near Nagpur, far from every other fixture), so the
 * suggestions list only it. Fixture ids 7600–7699 only (seedShineRows).
 */
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { test, expect, asRole } from '../../support/fixtures'
import { API } from '../../support/auth'
import { sql } from '../../support/db'
import { SHINE } from '../../support/seed-ids'

const dir = path.dirname(fileURLToPath(import.meta.url))
const PIXEL = path.resolve(dir, '../../fixtures/pixel.png')

test.use({
  storageState: asRole('customer-shine'),
  // Should Home ask the phone where it is, the phone is at the seeded garage too.
  geolocation: { latitude: SHINE.garage.lat, longitude: SHINE.garage.lng },
})

test.beforeEach(async ({ context }) => {
  await sql`delete from shine_scans where user_id = ${SHINE.customer.id}`
  // The phone at the seeded garage, and a share sheet that records what it was given.
  await context.addInitScript(
    ({ lat, lng }) => {
      window.localStorage.setItem(
        'detlio-location',
        JSON.stringify({
          state: {
            location: { lat, lng, label: 'E2E Shine', source: 'gps', updatedAt: Date.now() },
            promptDismissedAt: Date.now(),
          },
          version: 0,
        })
      )
      const shared: unknown[] = []
      ;(window as unknown as { __shared: unknown[] }).__shared = shared
      Object.defineProperty(navigator, 'share', {
        configurable: true,
        value: async (data: unknown) => {
          shared.push(data)
        },
      })
      Object.defineProperty(navigator, 'canShare', { configurable: true, value: () => false })
    },
    { lat: SHINE.garage.lat, lng: SHINE.garage.lng }
  )
})

test.describe('Shine Score', () => {
  test('the config says it is on', async ({ request }) => {
    const response = await request.get(`${API}/api/v1/shine/config`)
    expect(response.ok()).toBe(true)
    expect((await response.json()).data).toEqual({ enabled: true, scansPerDay: 3, keepDays: 30 })
  })

  test('Home tile → four guided photos → check → score, suggestions and share @p0', async ({ page }) => {
    await page.goto('/home')
    const tile = page.getByRole('link', { name: /How clean is your car\?.*Shine Score/ })
    await expect(tile).toContainText('Free · 4 photos')
    await tile.click()
    await expect(page).toHaveURL(/\/shine$/)

    // Step by step: the progress, the guide, Choose from gallery.
    const gallery = page.getByTestId('shine-gallery-input')
    await expect(page.getByText('Photo 1 of 4')).toBeVisible()
    await expect(page.getByText('Outside · front', { exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Take photo' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Choose from gallery' })).toBeVisible()
    await gallery.setInputFiles(PIXEL)
    await expect(page.getByText('Photo 2 of 4')).toBeVisible()
    await expect(page.getByText('Outside · side', { exact: true })).toBeVisible()
    await expect(page.getByText('Stand three big steps back, side on, with the whole car in view. Daylight works best.')).toBeVisible()
    await gallery.setInputFiles(PIXEL)
    await expect(page.getByText('Photo 3 of 4')).toBeVisible()
    await gallery.setInputFiles(PIXEL)
    await expect(page.getByText('Photo 4 of 4')).toBeVisible()
    await gallery.setInputFiles(PIXEL)

    // Check and retake: four photos, the on-device warning, the day's count.
    await expect(page.getByRole('heading', { name: 'Check your photos' })).toBeVisible()
    await expect(page.getByRole('list', { name: 'Your photos' }).getByRole('listitem')).toHaveCount(4)
    await expect(page.getByText(/^(Front|Side|Dashboard|Seats & floor) looks (dark|blurry)\.$/)).toBeVisible()
    await expect(page.getByText('Free · 3 of 3 scans left today · your photos stay private')).toBeVisible()

    // Retake one from the big view: back to that step, then straight back to the check.
    await page.getByRole('button', { name: 'View dashboard' }).click()
    await page.getByRole('dialog').getByRole('button', { name: 'Retake' }).click()
    await expect(page.getByText('Photo 3 of 4')).toBeVisible()
    await gallery.setInputFiles(PIXEL)
    await expect(page.getByRole('heading', { name: 'Check your photos' })).toBeVisible()

    await page.getByRole('button', { name: 'Get my score' }).click()
    await expect(page).toHaveURL(/\/shine\/[0-9a-f-]{36}$/)

    // The result (FAKE_SCAN_READING: 70, 66, 58, 41).
    await expect(page.getByRole('heading', { name: 'Your Shine Score' })).toBeVisible()
    await expect(page.getByLabel('Score 59 out of 100')).toBeVisible()
    await expect(page.getByText('Fairly clean outside, the inside needs work.')).toBeVisible()
    await expect(page.getByText('An interior and exterior wash would lift it most.')).toBeVisible()
    const areas = page.getByRole('list', { name: 'Score by area' }).getByRole('listitem')
    await expect(areas).toHaveCount(4)
    await expect(areas.nth(0)).toContainText('Outside · front')
    await expect(areas.nth(0)).toContainText('70')
    await expect(areas.nth(3)).toContainText('Seats & floor')
    await expect(areas.nth(3)).toContainText('41')
    await expect(page.getByRole('heading', { name: 'What we noticed' })).toBeVisible()
    await expect(page.getByText('Floor mats muddy')).toBeVisible()
    await expect(page.getByText('Scores are suggestions from your photos, not a check by a garage.')).toBeVisible()

    // Share: the share sheet gets the score and nothing about the customer.
    await page.getByRole('button', { name: 'Share my score' }).click()
    await expect
      .poll(() => page.evaluate(() => JSON.stringify((window as unknown as { __shared: unknown[] }).__shared)))
      .toContain('Shine Score is 59/100')
    const shared = await page.evaluate(() => JSON.stringify((window as unknown as { __shared: unknown[] }).__shared))
    expect(shared).not.toContain(SHINE.customer.name)
    expect(shared).not.toContain('TN09SH0076')

    // Suggested for you: the seeded garage's interior + exterior wash, a time opens checkout.
    // Read again so the phone's place is the seeded one, whatever Home did with it on the way.
    await page.reload()
    await expect(page.getByLabel('Score 59 out of 100')).toBeVisible()
    const suggested = page.getByRole('region', { name: 'Suggested for you' })
    await expect(suggested).toContainText(SHINE.garage.full.name)
    await expect(suggested).toContainText(SHINE.garage.name)
    await expect(suggested).toContainText('₹649')
    const time = suggested.getByRole('link', { name: new RegExp(`^Book ${SHINE.garage.name}, `) }).first()
    await expect(time).toBeVisible()
    await time.click()
    await expect(page).toHaveURL(new RegExp(`/book/${SHINE.garage.id}\\?.*service=${SHINE.garage.full.id}.*slot=`))
  })

  test('the service name opens checkout with it picked', async ({ page }) => {
    // A scan straight through the API, then its result page.
    const response = await page.request.post(`${API}/api/v1/users/me/shine/scans`, {
      data: {
        photos: ['front', 'side', 'dashboard', 'seats'].map((area) => ({
          area,
          mimeType: 'image/jpeg',
          // A JPEG's first bytes, padded: the server checks the type, the fake AI reads nothing.
          dataBase64: Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(300, 7)]).toString('base64'),
        })),
      },
    })
    expect(response.status()).toBe(201)
    const { data } = await response.json()
    expect(data.scansLeft).toBe(2)
    await page.goto(`/shine/${data.scan.id}`)
    await page.getByRole('link', { name: new RegExp(SHINE.garage.full.name.replace('+', '\\+')) }).click()
    await expect(page).toHaveURL(new RegExp(`/book/${SHINE.garage.id}\\?service=${SHINE.garage.full.id}`))
  })

  test('a finished booking shows how much the Shine went up, from the garage photos', async ({ page }) => {
    await page.goto(`/bookings/${SHINE.bookings.done}`)
    const card = page.getByRole('heading', { name: 'Shine Score, from the garage’s photos' }).locator('..')
    await expect(card).toContainText('Your Shine went 46 → 92.')
    await expect(card).toContainText('Biggest change: seats & floor.')
    await expect(card).toContainText('Before · 46')
    await expect(card).toContainText('After · 92')
    await expect(card).toContainText('Scored from the before & after job photos.')
    await card.getByRole('button', { name: 'Share' }).click()
    await expect
      .poll(() => page.evaluate(() => JSON.stringify((window as unknown as { __shared: unknown[] }).__shared)))
      .toContain('Shine went 46 → 92')
  })
})
