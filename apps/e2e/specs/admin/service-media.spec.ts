/**
 * Admin's sample pictures, and what customers see of them.
 *
 * "Make a picture with AI" runs against AI_FAKE: the API returns a fixed
 * small PNG for every picture and never calls OpenAI. Everything around it
 * is real: the two options are written to MinIO under the service's temp
 * prefix, the chosen one is copied into the service's own folder, and the
 * customer sees it tagged "Sample image" — never as the garage's own work.
 */
import { test, expect, asRole } from '../../support/fixtures'
import { sql } from '../../support/db'
import { SERVICES, VENDORS } from '../../support/seed-ids'

test.use({ storageState: asRole('admin') })

const GARAGE_PAGE = `http://localhost:3000/garage/${VENDORS.media.id}`

test.describe('service sample pictures', () => {
  test('admin makes an AI picture, uses it, and customers see a sample @p0', async ({
    page,
    context,
  }) => {
    const name = SERVICES.mediaAi.name
    await page.goto(`/vendors/${VENDORS.media.id}/edit`)
    await page.getByRole('tab', { name: 'Services' }).click()
    // "Photos and video" sits behind the service's ⋯ in the services editor.
    await page.getByRole('button', { name: `More for ${name}` }).click()

    const media = page.getByRole('group', { name: `Photos and video of ${name}` })
    await media.getByRole('button', { name: 'Make a picture with AI' }).click()

    const sheet = page.getByRole('dialog', { name: 'Make a picture with AI' })
    // Pre-filled from the service alone; the style is added on the server.
    await expect(sheet.getByLabel('Describe the picture')).toHaveValue(/Coating: a clean dark-grey car/)
    await expect(sheet.getByText('About ₹4 per picture')).toBeVisible()
    await sheet.getByRole('button', { name: 'Make 2 pictures' }).click()

    await expect(sheet.getByRole('radio', { name: 'AI picture 1' })).toHaveAttribute('aria-checked', 'true')
    await expect(sheet.getByRole('radio', { name: 'AI picture 2' })).toBeVisible()
    await expect(sheet.getByRole('button', { name: /Generate again/ })).toBeVisible()
    await sheet.getByRole('button', { name: 'Use this picture' }).click()
    await expect(sheet).toBeHidden()

    await expect(media.getByText('Sample', { exact: true })).toBeVisible()
    const rows = await sql<{ source: string; kind: string; storage_key: string; uploaded_by: string }[]>`
      select source, kind, storage_key, uploaded_by from service_images
       where service_id = ${SERVICES.mediaAi.id}
    `
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ source: 'ai', kind: 'image', uploaded_by: 'E2E Admin' })
    // Moved out of the temp prefix, which a lifecycle rule empties.
    expect(rows[0].storage_key).toMatch(
      new RegExp(`^vendors/${VENDORS.media.id}/services/${SERVICES.mediaAi.id}/`)
    )

    const customer = await context.newPage()
    await customer.goto(GARAGE_PAGE)
    await customer.getByRole('button', { name: `View details for ${name}` }).click()
    const details = customer.getByRole('dialog', { name: `${name} details` })
    await expect(details.getByText('Sample image')).toBeVisible()
    await expect(details.getByText(`From`, { exact: true })).toHaveCount(0)
  })

  test('a service with nothing added shows the drawn sample, said to be one @p0', async ({
    context,
  }) => {
    const customer = await context.newPage()
    await customer.goto(GARAGE_PAGE)
    const name = SERVICES.mediaBike.name
    await customer.getByRole('button', { name: `View details for ${name}` }).click()
    const details = customer.getByRole('dialog', { name: `${name} details` })
    await expect(details.getByText('Sample image')).toBeVisible()
    await expect(details.getByText('No photos from this garage yet')).toBeVisible()
  })

  test('the AI routes answer only what the service may have @p0', async ({ page }) => {
    // A use that names someone else's picture is refused.
    const res = await page.request.post(
      `http://localhost:8080/api/v1/admin/services/${SERVICES.mediaRefused.id}/ai-pictures/use`,
      { data: { url: `${process.env.R2_PUBLIC_BASE_URL}/ai-temp/${SERVICES.mediaAi.id}/00000000-0000-4000-8000-000000000000.png` } }
    )
    expect(res.status()).toBe(400)
    expect(await res.json()).toMatchObject({ success: false, code: 'INVALID_AI_PICTURE' })

    const config = await page.request.get('http://localhost:8080/api/v1/admin/ai/config')
    // Other AI features add their own flags here (describe, import); this test only owns pictures.
    expect(await config.json()).toMatchObject({ success: true, data: { pictures: true } })
  })
})
