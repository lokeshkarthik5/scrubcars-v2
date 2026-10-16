/**
 * Service photos and video, from the garage's own app.
 *
 * Every upload needs the privacy tick ("no number plates or faces can be
 * read, or the owner agreed"), and a video is at most 60 seconds. Photos go
 * to MinIO standing in for R2, as in photos.spec.ts. Videos go to the API's
 * fake Stream endpoint (STREAM_FAKE): nothing reaches Cloudflare, and the
 * spec plays Stream's part by firing its signed webhook (support/stream.ts).
 *
 * Each test owns one service on VENDORS.media, which nobody else reads.
 */
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { test, expect, asRole } from '../../support/fixtures'
import { loginViaApi, setActiveVendor } from '../../support/auth'
import { sql } from '../../support/db'
import { fireStreamWebhook, signStreamBody, videoUidFor } from '../../support/stream'
import { SERVICES, STAFF, VENDORS } from '../../support/seed-ids'

const FIXTURES = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../fixtures')
const PIXEL = path.join(FIXTURES, 'pixel.png')
const CLIP_45 = path.join(FIXTURES, 'clip-45s.webm')
const CLIP_72 = path.join(FIXTURES, 'clip-72s.webm')
const GARAGE_PAGE = `http://localhost:3000/garage/${VENDORS.media.id}`

test.use({ storageState: asRole('vendor-media') })

test.beforeEach(async ({ context }) => {
  await setActiveVendor(context, VENDORS.media.id)
})

const block = (page: import('@playwright/test').Page, serviceName: string) =>
  page.getByRole('group', { name: `Photos and video of ${serviceName}` })

test.describe('service photos and video', () => {
  test('a photo needs the privacy tick, then customers see it as the garage’s @p0', async ({
    page,
    context,
  }) => {
    const name = SERVICES.mediaPhoto.name
    await page.goto('/services')
    const media = block(page, name)

    // Nothing can be added before the tick.
    const addPhoto = media.getByRole('button', { name: `Add a photo of ${name}` }).first()
    await expect(addPhoto).toBeDisabled()
    // The tick is a styled box over a visually hidden input: tap its label, as a person does.
    await media.getByText('Before adding:', { exact: true }).click()
    await expect(media.getByRole('checkbox', { name: /Before adding/ })).toBeChecked()
    await expect(addPhoto).toBeEnabled()

    await media.getByLabel(`Photo file for ${name}`).setInputFiles(PIXEL)
    await expect(media.getByRole('button', { name: `Remove photo 1 of ${name}` })).toBeVisible()

    // Stored with the tick and who added it; neither ever reaches a customer.
    const [row] = await sql<
      { source: string; uploaded_by: string; consent_confirmed_at: Date | null; kind: string }[]
    >`
      select source, uploaded_by, consent_confirmed_at, kind from service_images
       where service_id = ${SERVICES.mediaPhoto.id}
    `
    expect(row).toMatchObject({ kind: 'image', source: 'upload', uploaded_by: 'garage' })
    expect(row.consent_confirmed_at).not.toBeNull()

    const customer = await context.newPage()
    await customer.goto(GARAGE_PAGE)
    await customer.getByRole('button', { name: `View details for ${name}` }).click()
    const sheet = customer.getByRole('dialog', { name: `${name} details` })
    await expect(sheet.getByText(VENDORS.media.name)).toBeVisible()
    await expect(sheet.getByText('From', { exact: true })).toBeVisible()
    await expect(sheet.getByText('Sample image')).toHaveCount(0)

    // The public payload carries no uploader or tick.
    const res = await customer.request.get(
      `http://localhost:8080/api/v1/vendors/${VENDORS.media.id}/services`
    )
    const body = await res.json()
    const service = body.data.find((s: { id: string }) => s.id === SERVICES.mediaPhoto.id)
    expect(Object.keys(service.media[0]).sort()).toEqual(
      ['durationSecs', 'id', 'kind', 'posterUrl', 'source', 'url'].sort()
    )
  })

  test('a video uploads, processes, and reaches customers once Stream says ready @p0', async ({
    page,
    context,
  }) => {
    const name = SERVICES.mediaVideo.name
    await page.goto('/services')
    const media = block(page, name)

    // The tick is a styled box over a visually hidden input: tap its label, as a person does.
    await media.getByText('Before adding:', { exact: true }).click()
    await expect(media.getByRole('checkbox', { name: /Before adding/ })).toBeChecked()
    await media.getByLabel(`Video file for ${name}`).setInputFiles(CLIP_45)
    await expect(media.getByText('Processing…')).toBeVisible()

    // Not on the garage page while processing.
    const uid = await videoUidFor(SERVICES.mediaVideo.id)
    const customer = await context.newPage()
    await customer.goto(GARAGE_PAGE)
    await customer.getByRole('button', { name: `View details for ${name}` }).click()
    await expect(customer.getByRole('button', { name: `Play video of ${name}` })).toHaveCount(0)
    await customer.close()

    // Stream finishes encoding.
    expect(await fireStreamWebhook({ uid, readyToStream: true, duration: 45 })).toBe(200)

    // The block's poll picks it up.
    await expect(media.getByText('Ready', { exact: true })).toBeVisible({ timeout: 15_000 })
    await expect(media.getByRole('button', { name: 'Replace' })).toBeVisible()

    const again = await context.newPage()
    await again.goto(GARAGE_PAGE)
    // The card's thumbnail is the poster with its length.
    await expect(again.getByText('0:45').first()).toBeVisible()
    await again.getByRole('button', { name: `View details for ${name}` }).click()
    const sheet = again.getByRole('dialog', { name: `${name} details` })
    await expect(sheet.getByRole('button', { name: `Play video of ${name}` })).toBeVisible()
    await expect(sheet.getByText('0:45')).toBeVisible()
    await again.close()

    // Replacing keeps the ready video on the garage page until the new one is
    // ready, and for good if the new one fails: a bad upload never costs the
    // garage the video it had.
    await media.getByLabel(`Video file for ${name}`).setInputFiles(CLIP_45)
    await expect(media.getByText('Processing…')).toBeVisible()
    await expect(
      media.getByText('Customers see the earlier video until the new one is ready.')
    ).toBeVisible()
    const failedUid = await videoUidFor(SERVICES.mediaVideo.id)
    expect(failedUid).not.toBe(uid)
    expect(
      await fireStreamWebhook({
        uid: failedUid,
        readyToStream: false,
        state: 'error',
        errorReasonCode: 'ERR_MALFORMED_VIDEO',
      })
    ).toBe(200)
    await expect(
      media.getByText('Customers still see the earlier video. Remove this one to go back to it.')
    ).toBeVisible({ timeout: 15_000 })

    const kept = await context.newPage()
    await kept.goto(GARAGE_PAGE)
    await kept.getByRole('button', { name: `View details for ${name}` }).click()
    await expect(
      kept
        .getByRole('dialog', { name: `${name} details` })
        .getByRole('button', { name: `Play video of ${name}` })
    ).toBeVisible()
    await kept.close()

    // Replacing the failed one; once ready, the new video takes the earlier
    // one's place and the service holds one video again.
    await media.getByLabel(`Video file for ${name}`).setInputFiles(CLIP_45)
    await expect(media.getByText('Processing…')).toBeVisible()
    const nextUid = await videoUidFor(SERVICES.mediaVideo.id)
    expect([uid, failedUid]).not.toContain(nextUid)
    expect(await fireStreamWebhook({ uid: nextUid, readyToStream: true, duration: 45 })).toBe(200)
    await expect(media.getByText('Ready', { exact: true })).toBeVisible({ timeout: 15_000 })

    const videos = await sql<{ video_uid: string; video_status: string }[]>`
      select video_uid, video_status from service_images
       where service_id = ${SERVICES.mediaVideo.id} and kind = 'video'
    `
    expect(videos).toEqual([{ video_uid: nextUid, video_status: 'ready' }])
  })

  test('a webhook without a valid signature is refused @p0', async () => {
    const uid = 'f'.repeat(32)
    expect(
      await fireStreamWebhook(
        { uid, readyToStream: true, duration: 30 },
        { signature: signStreamBody('{"uid":"something else"}') }
      )
    ).toBe(401)
    // A signature from ten minutes ago is a replay.
    const body = JSON.stringify({ uid, readyToStream: true, duration: 30, status: { state: 'ready' } })
    expect(
      await fireStreamWebhook(
        { uid, readyToStream: true, duration: 30 },
        { signature: signStreamBody(body, Math.floor(Date.now() / 1000) - 600) }
      )
    ).toBe(401)
  })

  test('a clip over 60 seconds is refused on the phone, before any upload @p0', async ({
    page,
  }) => {
    const name = SERVICES.mediaRefused.name
    await page.goto('/services')
    const media = block(page, name)

    // The tick is a styled box over a visually hidden input: tap its label, as a person does.
    await media.getByText('Before adding:', { exact: true }).click()
    await expect(media.getByRole('checkbox', { name: /Before adding/ })).toBeChecked()
    await media.getByLabel(`Video file for ${name}`).setInputFiles(CLIP_72)

    await expect(
      media.getByText('Longer than 60 seconds — trim it on the phone and upload again')
    ).toBeVisible()
    await expect(media.getByText('1:12')).toBeVisible()

    const rows = await sql`select 1 from service_images where service_id = ${SERVICES.mediaRefused.id}`
    expect(rows).toHaveLength(0)
  })

  test('without the privacy tick the API refuses every upload @p0', async () => {
    const owner = await loginViaApi(STAFF.mediaOwner.phone, 'vendor')
    const headers = { 'x-vendor-id': VENDORS.media.id }
    try {
      const video = await owner.post(
        `/api/v1/vendors/me/services/${SERVICES.mediaRefused.id}/videos`,
        { headers, data: { sizeBytes: 1000, durationSecs: 20 } }
      )
      expect(video.status()).toBe(400)
      expect(await video.json()).toMatchObject({ success: false, code: 'MEDIA_CONSENT_REQUIRED' })

      const photo = await owner.post(
        `/api/v1/vendors/me/services/${SERVICES.mediaRefused.id}/images`,
        {
          headers,
          data: {
            url: `${process.env.R2_PUBLIC_BASE_URL}/vendors/${VENDORS.media.id}/services/${SERVICES.mediaRefused.id}/00000000-0000-4000-8000-000000000000.jpg`,
            consent: false,
          },
        }
      )
      expect(photo.status()).toBe(400)
      expect(await photo.json()).toMatchObject({ success: false, code: 'MEDIA_CONSENT_REQUIRED' })
    } finally {
      await owner.dispose()
    }
  })
})
