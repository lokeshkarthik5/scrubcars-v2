/**
 * "Not in your area yet" (customer reach, part 2, 0062): the free-wash card
 * on the garage list when the customer's area has no garage, its sheet
 * ("Which area are you in?", the free wash, the two switches, "Save my free
 * wash"), the first-50 cap, the × that hides the card for 7 days, the slim
 * line once on the list, and recommending a garage.
 *
 * Areas (FREE_WASH_AREAS): Tambaram has no list yet and no garage;
 * Chromepet's 50 free washes are taken (AREA_WAITLIST). Launch day is
 * specs/platform/area-launch.spec.ts. Fixtures 4400–4599.
 */
import type { Page } from '@playwright/test'
import { test, expect, asRole } from '../../support/fixtures'
import { API, loginViaApi } from '../../support/auth'
import { sql } from '../../support/db'
import { CUSTOMERS, FREE_WASH_AREAS } from '../../support/seed-ids'

type Area = (typeof FREE_WASH_AREAS)[keyof typeof FREE_WASH_AREAS]

/** The customer picked this area's chip (an area, no GPS). */
async function standInArea(page: Page, area: Area) {
  await page.context().addInitScript((zone) => {
    window.localStorage.setItem(
      'detlio-location',
      JSON.stringify({
        state: {
          location: { lat: zone.lat, lng: zone.lng, label: zone.name, source: 'area', zone: zone.slug, updatedAt: Date.now() },
          promptDismissedAt: Date.now(),
        },
        version: 0,
      })
    )
  }, area)
}

const card = (page: Page, area: Area) => page.getByRole('region', { name: `Free wash when we reach ${area.name}` })

async function signupOf(userId: string, slug: string) {
  const [row] = await sql<{ position: number; free_wash: boolean; push_opt_in: boolean; whatsapp_opt_in: boolean }[]>`
    select s.position, s.free_wash, s.push_opt_in, s.whatsapp_opt_in
      from zone_signups s join zones z on z.id = s.zone_id
     where s.user_id = ${userId} and z.slug = ${slug}
  `
  return row
}

test.describe('the free wash, signing up @p0', () => {
  test.use({ storageState: asRole('customer-freeWashSign') })

  test('the card in an area with no garage → Claim → Save my free wash → recommend a garage → one slim line', async ({ page }) => {
    const area = FREE_WASH_AREAS.signUp
    await standInArea(page, area)
    await page.goto('/garages')

    const freeWash = card(page, area)
    await expect(freeWash).toBeVisible()
    // Honest counts: under 10 waiting, no number.
    await expect(freeWash.getByText(`Be the first in ${area.name}`)).toBeVisible()
    await freeWash.getByRole('button', { name: 'Claim' }).click()

    const sheet = page.getByRole('dialog', { name: 'Which area are you in?' })
    await expect(sheet).toBeVisible()
    // Pre-filled from where they are.
    await expect(sheet.getByRole('group', { name: 'Your area' }).getByRole('button', { name: area.name, exact: true })).toHaveAttribute(
      'aria-pressed',
      'true'
    )
    await expect(sheet.getByRole('heading', { name: 'Your first car wash, free' })).toBeVisible()
    // Notifications are on by default; off here, as a headless browser can't take them. WhatsApp: on, stored only.
    await sheet.getByRole('switch', { name: 'App notification' }).click()
    await expect(sheet.getByRole('switch', { name: 'App notification' })).toHaveAttribute('aria-checked', 'false')
    await sheet.getByRole('switch', { name: 'WhatsApp' }).click()
    await expect(sheet.getByRole('switch', { name: 'WhatsApp' })).toHaveAttribute('aria-checked', 'true')
    await sheet.getByRole('button', { name: 'Save my free wash' }).click()

    const done = page.getByRole('dialog', { name: "You're on the list" })
    await expect(done.getByRole('heading', { name: "You're on the list" })).toBeVisible()
    await expect(done.getByText('Your free wash is saved.', { exact: false })).toBeVisible()
    expect(await signupOf(CUSTOMERS.freeWashSign.id, area.slug)).toMatchObject({
      position: 1,
      free_wash: true,
      push_opt_in: false,
      whatsapp_opt_in: true,
    })

    // Asked once, straight after: recommend a garage.
    await expect(done.getByText('Know a good garage here?', { exact: false })).toBeVisible()
    await done.getByRole('button', { name: 'Recommend a garage' }).click()
    const form = page.getByRole('dialog', { name: 'Recommend a garage' })
    await form.getByLabel('Garage name').fill('Tambaram Shine Point')
    await form.getByLabel('Google Maps link').fill('https://maps.app.goo.gl/AbC123xyz')
    await form.getByLabel("Why they're good (optional)").fill('Quick and careful')
    await form.getByRole('button', { name: 'Send recommendation' }).click()
    await expect(page.getByText('Thanks! We’ll get in touch with them.')).toBeVisible()
    await expect(form).toBeHidden()

    const recs = await sql<{ name: string; maps_link: string | null; phone: string | null; status: string; zone: string | null }[]>`
      select r.name, r.maps_link, r.phone, r.status, z.slug as zone
        from garage_recommendations r left join zones z on z.id = r.zone_id
       where r.user_id = ${CUSTOMERS.freeWashSign.id} order by r.created_at
    `
    expect(recs[0]).toMatchObject({ name: 'Tambaram Shine Point', maps_link: 'https://maps.app.goo.gl/AbC123xyz', status: 'new', zone: area.slug })

    // From now on, one slim line instead of the card, with a small Recommend link.
    await page.reload()
    await expect(card(page, area)).toHaveCount(0)
    const line = page.locator('[data-on-the-list]').first()
    await expect(line).toContainText(`On the list for ${area.name}`)
    await line.getByRole('button', { name: 'Recommend' }).click()
    const again = page.getByRole('dialog', { name: 'Recommend a garage' })
    await again.getByLabel('Garage name').fill('Tambaram Foam Works')
    await again.getByLabel('Or their phone').fill('9840011122')
    await again.getByRole('button', { name: 'Send recommendation' }).click()
    await expect(again).toBeHidden()
    const [count] = await sql<{ n: number }[]>`select count(*)::int as n from garage_recommendations where user_id = ${CUSTOMERS.freeWashSign.id}`
    expect(count.n).toBe(2)

    // Home's live status.
    await page.goto('/home')
    await expect(page.locator('[data-reach-status]').getByText(`On the list for ${area.name}`)).toBeVisible()

    // Once per area; and a recommendation needs a Maps link or a phone.
    const api = await loginViaApi(CUSTOMERS.freeWashSign.phone)
    const twice = await api.post(`${API}/api/v1/users/me/area/signups`, { data: { zoneSlug: area.slug } })
    expect(twice.status()).toBe(409)
    expect((await twice.json()).code).toBe('ALREADY_SIGNED_UP')
    const noWay = await api.post(`${API}/api/v1/users/me/area/recommendations`, { data: { name: 'Nowhere Garage' } })
    expect(noWay.status()).toBe(400)
    const badLink = await api.post(`${API}/api/v1/users/me/area/recommendations`, {
      data: { name: 'Odd Link Garage', mapsLink: 'https://example.com/x' },
    })
    expect(badLink.status()).toBe(400)
    // An area with a garage takes no sign-ups.
    const live = await api.post(`${API}/api/v1/users/me/area/signups`, { data: { zoneSlug: 'egmore' } })
    expect(live.status()).toBe(409)
    expect((await live.json()).code).toBe('AREA_LIVE')
    await api.dispose()
  })
})

test.describe('the free wash, the 50 cap @p0', () => {
  test.use({ storageState: asRole('customer-freeWashLate') })

  test('an area whose 50 free washes are taken says how many wait, and offers "Notify me" only', async ({ page }) => {
    const area = FREE_WASH_AREAS.full
    await standInArea(page, area)
    await page.goto('/garages')

    const freeWash = card(page, area)
    await expect(freeWash.getByText('50 waiting here')).toBeVisible()
    await freeWash.getByRole('button', { name: 'Claim' }).click()

    const sheet = page.getByRole('dialog', { name: 'Which area are you in?' })
    await expect(sheet.getByRole('heading', { name: `Be told when we reach ${area.name}` })).toBeVisible()
    await expect(sheet.getByRole('heading', { name: 'Your first car wash, free' })).toHaveCount(0)
    await sheet.getByRole('switch', { name: 'App notification' }).click()
    await sheet.getByRole('button', { name: 'Notify me' }).click()

    const done = page.getByRole('dialog', { name: "You're on the list" })
    await expect(done.getByRole('heading', { name: "You're on the list" })).toBeVisible()
    await expect(done.getByText('Your free wash is saved.', { exact: false })).toHaveCount(0)
    await done.getByRole('button', { name: 'Not now' }).click()
    await expect(done).toBeHidden()

    expect(await signupOf(CUSTOMERS.freeWashLate.id, area.slug)).toMatchObject({ position: 51, free_wash: false })
  })
})

test.describe('the free wash card, signed out @p0', () => {
  test('× hides it (back after 7 days, at most 3 times); Claim asks a guest to sign in first', async ({ page }) => {
    const area = FREE_WASH_AREAS.signUp
    await standInArea(page, area)
    await page.goto('/garages?mode=doorstep')

    await expect(card(page, area)).toBeVisible()
    await card(page, area).getByRole('button', { name: 'Close the free wash card' }).click()
    await expect(card(page, area)).toHaveCount(0)
    const closes = await page.evaluate((key) => window.localStorage.getItem(key), `detlio:free-wash-closed:${area.slug}`)
    expect(JSON.parse(closes!)).toMatchObject({ count: 1 })
    await page.reload()
    await expect(card(page, area)).toHaveCount(0)

    // Eight days later it is back.
    await page.evaluate((key) => {
      window.localStorage.setItem(key, JSON.stringify({ count: 1, lastAt: Date.now() - 8 * 24 * 60 * 60 * 1000 }))
    }, `detlio:free-wash-closed:${area.slug}`)
    await page.reload()
    await expect(card(page, area)).toBeVisible()

    // Claim, signed out: the in-page sign-in, nothing saved without it.
    await card(page, area).getByRole('button', { name: 'Claim' }).click()
    const sheet = page.getByRole('dialog', { name: 'Which area are you in?' })
    await expect(sheet.getByRole('region', { name: 'Your phone number' })).toBeVisible()
    await expect(sheet.getByRole('button', { name: 'Save my free wash' })).toHaveCount(0)

    // Pickup & drop: the same piece, at the bottom instead of the top.
    await page.keyboard.press('Escape')
    await page.goto('/garages?mode=pickup')
    await expect(async () => {
      await page.mouse.wheel(0, 20_000)
      await expect(page.locator('[data-free-wash-card]')).toBeVisible({ timeout: 1_000 })
    }).toPass({ timeout: 30_000 })
  })
})
