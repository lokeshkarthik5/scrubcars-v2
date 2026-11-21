/**
 * Car condition check at handover (0075), across the garage portal, the
 * customer app and the API, at CONDITION_CHECK's garage (ids 7500–7549).
 *
 * The check is off for every other garage in E2E (CONDITION_CHECK_ENABLED=off
 * in .env.e2e) and on for this one (CONDITION_CHECK_GARAGES). AI_FAKE marks
 * every car-check photo with one "Scratch – rear left door" and every after
 * photo with one possible "Dent – rear bumper" (lib/condition-check-ai.ts).
 * Storage is the suite's MinIO, so every upload is a real presigned PUT.
 *
 *  1. A doorstep job: Start waits for the 8-angle walk-round, taken in the
 *     portal; "Check the marks" removes a mark, undoes it, adds one Detlio
 *     missed and sends; Start opens. The customer says "Looks right".
 *  2. "Something's wrong": the customer's note reaches the garage's page.
 *  3. After the job: a possible new mark warns above Complete job (it does
 *     not block), the garage says "It was there", and once the job is done
 *     the customer sees "New mark found", raises a complaint (filled in) and
 *     says it was already there.
 *  4. Pickup & drop: Picked up waits for the walk-round, and the API holds
 *     the same rule.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { APIRequestContext } from '@playwright/test'
import { test, expect } from '../../support/fixtures'
import { API } from '../../support/auth'
import {
  complaintsForBooking,
  countConditionReads,
  getBooking,
  getConditionCheck,
  getConditionMarks,
  getJobPhotos,
} from '../../support/db'
import { openActors } from '../../support/journey'
import { CONDITION_CHECK } from '../../support/seed-ids'

const PIXEL = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../fixtures/pixel.png')

test.describe.configure({ mode: 'serial' })

const C = CONDITION_CHECK
const GARAGE = C.garage.id
const NAME = C.customer.name
const FIRST = NAME.split(' ')[0]
const ANGLES = ['front', 'back', 'left', 'right', 'front_left', 'front_right', 'back_left', 'back_right'] as const
/** The tiles' words, as the portal names each camera input. */
const ANGLE_WORDS: Record<(typeof ANGLES)[number], string> = {
  front: 'front',
  back: 'back',
  left: 'left side',
  right: 'right side',
  front_left: 'front left',
  front_right: 'front right',
  back_left: 'back left',
  back_right: 'back right',
}

const garageHeaders = { 'X-Vendor-Id': GARAGE }
const garagePhotos = async (bookingId: string) =>
  (await getJobPhotos(bookingId)).filter((photo) => photo.uploaded_by_role === 'garage')

/** The garage takes one photo through the API: presign, PUT to storage, record. */
async function takePhoto(
  request: APIRequestContext,
  bookingId: string,
  stage: 'before' | 'after',
  angle: (typeof ANGLES)[number]
): Promise<string> {
  const base = `${API}/api/v1/vendors/me/bookings/${bookingId}/photos`
  const presign = await request.post(`${base}/upload-url`, {
    headers: garageHeaders,
    data: { stage, contentType: 'image/png' },
  })
  expect(presign.status()).toBe(200)
  const { uploadUrl, key } = (await presign.json()).data as { uploadUrl: string; key: string }
  const put = await request.put(uploadUrl, {
    data: fs.readFileSync(PIXEL),
    headers: { 'Content-Type': 'image/png' },
  })
  expect(put.ok()).toBe(true)
  const recorded = await request.post(base, { headers: garageHeaders, data: { stage, key, angle } })
  expect(recorded.status()).toBe(201)
  return ((await recorded.json()).data as { id: string }).id
}

/** The walk-round through the API, then "Send to customer". */
async function walkRoundAndSend(request: APIRequestContext, bookingId: string) {
  for (const angle of ANGLES) await takePhoto(request, bookingId, 'before', angle)
  const sent = await request.post(`${API}/api/v1/vendors/me/bookings/${bookingId}/condition/send`, {
    headers: garageHeaders,
  })
  expect(sent.status()).toBe(200)
}

test.describe('car condition check @p0', () => {
  test('the walk-round holds Start; the garage checks the marks and sends; the customer says it looks right', async ({
    browser,
  }) => {
    const { customer, vendor, vendorCtx, close } = await openActors(
      browser,
      'customer-condition',
      GARAGE,
      'vendor-condition'
    )
    const job = C.walkRound

    // ── the garage: Start waits for the walk-round ─────────────────────────
    await vendor.goto(`/bookings/${job}`)
    await expect(vendor.getByRole('heading', { name: 'Car check · before' })).toBeVisible()
    const start = vendor.getByRole('button', { name: `Start job for ${NAME}` })
    await expect(start).toBeDisabled()
    const stillToDo = vendor.getByRole('list', { name: 'Still to do' })
    await expect(stillToDo.getByText('Take 8 more car check photos', { exact: true })).toBeVisible()
    await expect(stillToDo.getByText('Send the car check to the customer', { exact: true })).toBeVisible()

    // The API holds the same rule.
    const early = await vendorCtx.request.patch(`${API}/api/v1/bookings/${job}/progress`, {
      headers: garageHeaders,
    })
    expect(early.status()).toBe(409)
    expect(await early.json()).toMatchObject({
      code: 'CONDITION_CHECK_REQUIRED',
      message: 'Take 8 more car check photos, then send the car check to the customer.',
    })

    // ── the eight angles, each from its own tile ───────────────────────────
    for (const [i, angle] of ANGLES.entries()) {
      await vendor.getByLabel(`Add ${ANGLE_WORDS[angle]} before photo for ${NAME}`).setInputFiles(PIXEL)
      await expect.poll(async () => (await garagePhotos(job)).length).toBe(i + 1)
    }
    expect((await garagePhotos(job)).map((photo) => photo.angle).sort()).toEqual([...ANGLES].sort())
    await expect(vendor.getByText('8 of 8', { exact: true })).toBeVisible()
    // Detlio looks at each photo as it comes in (the fake: one scratch each).
    await expect.poll(() => countConditionReads(job), { timeout: 20_000 }).toBe(8)
    await expect(stillToDo.getByText('Send the car check to the customer', { exact: true })).toBeVisible()
    await expect(start).toBeDisabled()

    // ── Check the marks ────────────────────────────────────────────────────
    await vendor.getByRole('link', { name: 'Check the marks' }).click()
    await expect(vendor).toHaveURL(new RegExp(`/bookings/${job}/condition$`))
    await expect(vendor.getByRole('heading', { name: 'Check the marks' })).toBeVisible()
    await expect(vendor.getByText(`Detlio found 8 marks on ${FIRST}’s Creta. Remove any that are wrong, then send.`)).toBeVisible()
    const marks = vendor.getByRole('list', { name: 'Marks' })
    await expect(marks.getByRole('button', { name: 'Remove Scratch – rear left door' })).toHaveCount(8)

    // Remove one, then Undo.
    await marks.getByRole('button', { name: 'Remove Scratch – rear left door' }).first().click()
    await expect(marks.getByRole('button', { name: 'Undo removing Scratch – rear left door' })).toBeVisible()
    await expect.poll(async () => (await getConditionMarks(job)).filter((m) => m.removed_at).length).toBe(1)
    await marks.getByRole('button', { name: 'Undo removing Scratch – rear left door' }).click()
    await expect(marks.getByRole('button', { name: 'Remove Scratch – rear left door' })).toHaveCount(8)
    await expect.poll(async () => (await getConditionMarks(job)).filter((m) => m.removed_at).length).toBe(0)

    // Add one Detlio missed.
    await vendor.getByRole('button', { name: 'Add a mark Detlio missed' }).click()
    const sheet = vendor.getByRole('dialog', { name: 'Add a mark Detlio missed' })
    await sheet.getByRole('button', { name: 'Dent' }).click()
    await sheet.getByLabel('Where on the car').fill('bonnet')
    await sheet.getByRole('button', { name: 'Add mark' }).click()
    await expect(marks.getByRole('button', { name: 'Remove Dent – bonnet' })).toBeVisible()
    await expect(marks.getByText('Added by you')).toBeVisible()
    expect((await getConditionMarks(job)).find((m) => m.source === 'garage')).toMatchObject({
      kind: 'dent',
      part: 'bonnet',
    })

    // Send.
    await vendor.getByRole('button', { name: 'Send to customer' }).click()
    await expect(vendor).toHaveURL(new RegExp(`/bookings/${job}$`))
    await expect(vendor.getByText(new RegExp(`^Car check sent to ${FIRST} at `))).toBeVisible()
    await expect(vendor.getByText(`${FIRST} hasn't answered yet. The job can go ahead.`)).toBeVisible()
    expect((await getConditionCheck(job))?.sent_by).toBe(C.owner.id)
    await expect(start).toBeEnabled()

    // Sent, the walk-round stays: no removing one of its photos.
    const [front] = await garagePhotos(job)
    const remove = await vendorCtx.request.delete(`${API}/api/v1/vendors/me/bookings/${job}/photos/${front.id}`, {
      headers: garageHeaders,
    })
    expect(remove.status()).toBe(409)
    expect((await remove.json()).code).toBe('CONDITION_CHECK_SENT')

    // "See the marks" opens the screen to look, with nothing to change.
    await vendor.getByRole('link', { name: 'See the marks' }).click()
    await expect(vendor.getByText(new RegExp(`^Sent to ${FIRST} at `))).toBeVisible()
    await expect(vendor.getByRole('button', { name: 'Send to customer' })).toHaveCount(0)
    await expect(vendor.getByRole('button', { name: 'Remove Dent – bonnet' })).toHaveCount(0)
    await vendor.getByRole('link', { name: 'Go back' }).click()
    await expect(vendor).toHaveURL(new RegExp(`/bookings/${job}$`))

    // ── the customer: the walk-round with its marks, and "Looks right" ─────
    await customer.goto(`/bookings/${job}`)
    await expect(customer.getByRole('heading', { name: "Your car's condition before the job" })).toBeVisible()
    await expect(customer.getByText('Detlio marked 9 things already there.', { exact: false })).toBeVisible()
    const already = customer.getByRole('list', { name: 'Marks already there' })
    await expect(already.getByRole('button', { name: 'Dent – bonnet' })).toBeVisible()
    await expect(customer.getByRole('list', { name: 'Car check photos' }).getByRole('button')).toHaveCount(8)
    await customer.getByRole('button', { name: 'Show the back left photo' }).click()
    await expect(customer.getByRole('button', { name: 'Show the back left photo' })).toHaveAttribute('aria-pressed', 'true')
    await customer.getByRole('button', { name: 'Looks right' }).click()
    await expect(customer.getByText(/^You said it looks right, at /)).toBeVisible()
    await expect.poll(async () => (await getConditionCheck(job))?.customer_answer).toBe('looks_right')
    expect((await getConditionCheck(job))?.customer_answered_by).toBe(C.customer.id)

    // The garage reads the answer.
    await vendor.reload()
    await expect(vendor.getByText(`${FIRST} said it looks right.`)).toBeVisible()

    await close()
  })

  test("Something's wrong: the customer's note reaches the garage", async ({ browser }) => {
    const { customer, vendor, vendorCtx, close } = await openActors(
      browser,
      'customer-condition',
      GARAGE,
      'vendor-condition'
    )
    const job = C.wrong
    await walkRoundAndSend(vendorCtx.request, job)

    await customer.goto(`/bookings/${job}`)
    await customer.getByRole('button', { name: "Something's wrong" }).click()
    const sheet = customer.getByRole('dialog', { name: "Something's wrong" })
    const send = sheet.getByRole('button', { name: 'Send to the garage' })
    await expect(send).toBeDisabled()
    await sheet.getByLabel("What's wrong?").fill('The dent on the bonnet was not there')
    await send.click()
    await expect(customer.getByText(`You told ${C.garage.name} something is wrong. The Detlio team can see it too.`)).toBeVisible()
    expect(await getConditionCheck(job)).toMatchObject({
      customer_answer: 'something_wrong',
      customer_note: 'The dent on the bonnet was not there',
    })

    await vendor.goto(`/bookings/${job}`)
    await expect(vendor.getByText(`${FIRST} says something's wrong`)).toBeVisible()
    await expect(vendor.getByText('“The dent on the bonnet was not there”')).toBeVisible()
    // It holds nothing up.
    await expect(vendor.getByRole('button', { name: `Start job for ${NAME}` })).toBeEnabled()

    await close()
  })

  test('after the job: a possible new mark warns the garage, and the customer can raise a complaint', async ({
    browser,
  }) => {
    const { customer, vendor, vendorCtx, close } = await openActors(
      browser,
      'customer-condition',
      GARAGE,
      'vendor-condition'
    )
    const job = C.newMark
    await walkRoundAndSend(vendorCtx.request, job)
    const started = await vendorCtx.request.patch(`${API}/api/v1/bookings/${job}/progress`, { headers: garageHeaders })
    expect(started.status()).toBe(200)

    // An after photo of the back, compared with the before one.
    const after = await takePhoto(vendorCtx.request, job, 'after', 'back')
    const read = await vendorCtx.request.post(
      `${API}/api/v1/vendors/me/bookings/${job}/condition/photos/${after}/read`,
      { headers: garageHeaders }
    )
    expect(read.status()).toBe(200)
    expect((await getConditionMarks(job)).filter((m) => m.stage === 'after')).toMatchObject([
      { kind: 'dent', part: 'rear bumper' },
    ])

    // ── the garage: a warning above Complete job, never a block ────────────
    await vendor.goto(`/bookings/${job}`)
    const warning = vendor.getByRole('region', { name: 'Possible new mark – rear bumper' })
    await expect(warning).toBeVisible()
    await expect(warning.getByText("It wasn't in the before photos. Check it now: the customer will see it.")).toBeVisible()
    await expect(vendor.getByRole('button', { name: `Complete job for ${NAME}` })).toBeEnabled()
    await vendor.getByRole('button', { name: 'It was there: Dent – rear bumper' }).click()
    await expect(warning).toHaveCount(0)
    await expect.poll(async () => (await getConditionMarks(job)).find((m) => m.stage === 'after')?.garage_answer).toBe(
      'was_there'
    )

    const completed = await vendorCtx.request.patch(`${API}/api/v1/bookings/${job}/complete`, { headers: garageHeaders })
    expect(completed.status()).toBe(200)
    expect((await getBooking(job))?.status).toBe('completed')

    // ── the customer: New mark found, a complaint, and "already there" ─────
    await customer.goto(`/bookings/${job}`)
    const card = customer.getByRole('region', { name: 'New mark found – rear bumper' })
    await expect(card).toBeVisible()
    await expect(card.getByText(/^It isn't in the photos from before the job\./)).toBeVisible()
    await card.getByRole('button', { name: 'Raise a complaint' }).click()
    const form = customer.getByRole('dialog', { name: 'Raise a complaint' })
    await expect(form.getByRole('button', { name: 'Damage to my car' })).toHaveAttribute('aria-pressed', 'true')
    await expect(form.getByLabel('What happened?')).toHaveValue(
      'Dent – rear bumper: it is not in the car check photos from before the job.'
    )
    await form.getByRole('button', { name: 'Submit complaint' }).click()
    await expect(customer.getByRole('dialog', { name: 'Complaint received' })).toBeVisible()
    await expect.poll(async () => (await complaintsForBooking(job))[0]?.category).toBe('damage')
    expect((await complaintsForBooking(job))[0]).toMatchObject({ user_id: C.customer.id })
    await customer.getByRole('dialog', { name: 'Complaint received' }).getByRole('button', { name: 'Done' }).click()

    await card.getByRole('button', { name: 'It was already there' }).click()
    await expect(card).toHaveCount(0)
    await expect.poll(async () => (await getConditionMarks(job)).find((m) => m.stage === 'after')?.customer_answer).toBe(
      'already_there'
    )

    await close()
  })

  test('pickup & drop: Picked up waits for the walk-round', async ({ browser }) => {
    const { vendor, vendorCtx, close } = await openActors(browser, 'customer-condition', GARAGE, 'vendor-condition')
    const job = C.pickup

    await vendor.goto(`/bookings/${job}`)
    await expect(vendor.getByRole('heading', { name: 'Car check · before' })).toBeVisible()
    await vendor.getByLabel("Customer's pickup code").fill(C.pickupCode)
    await expect(vendor.getByRole('button', { name: `Mark Picked up for ${NAME}` })).toBeDisabled()
    await expect(
      vendor.getByRole('list', { name: 'Still to do' }).getByText('Take 8 more car check photos', { exact: true })
    ).toBeVisible()

    const early = await vendorCtx.request.patch(`${API}/api/v1/bookings/${job}/picked-up`, {
      headers: garageHeaders,
      data: { code: C.pickupCode },
    })
    expect(early.status()).toBe(409)
    expect((await early.json()).code).toBe('CONDITION_CHECK_REQUIRED')

    // With the walk-round sent, the car can go.
    await walkRoundAndSend(vendorCtx.request, job)
    await vendor.reload()
    await vendor.getByLabel("Customer's pickup code").fill(C.pickupCode)
    await expect(vendor.getByRole('button', { name: `Mark Picked up for ${NAME}` })).toBeEnabled()

    await close()
  })
})
