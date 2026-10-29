/**
 * Profile's Edit sheets (0066): the name and email, a car's make, model,
 * plate and colour, and an address's label, street and city, each through
 * its PATCH route. PREIOS.editor, whose number this file alone uses.
 */
import type { BrowserContext } from '@playwright/test'
import { test, expect } from '../../support/fixtures'
import { loginViaApi } from '../../support/auth'
import { sql } from '../../support/db'
import { PREIOS } from '../../support/seed-ids'

async function signIn(context: BrowserContext, phone: string) {
  const api = await loginViaApi(phone)
  await context.addCookies((await api.storageState()).cookies)
  await api.dispose()
}

const E = PREIOS.editor

test.describe.serial('profile edit sheets', () => {
  test('the name and email', async ({ page, context }) => {
    await signIn(context, E.phone)
    await page.goto('/profile')
    await page.getByRole('button', { name: 'Edit name and email' }).click()

    const sheet = page.getByRole('dialog', { name: 'Edit your details' })
    await sheet.getByLabel('Name').fill('Ezhil Arasan')
    // A malformed email is said, and Save waits.
    await sheet.getByLabel('Email (optional)').fill('ezhil@')
    await expect(sheet.getByRole('alert')).toContainText('name@example.com')
    await expect(sheet.getByRole('button', { name: 'Save' })).toBeDisabled()
    await sheet.getByLabel('Email (optional)').fill('ezhil@example.com')
    await sheet.getByRole('button', { name: 'Save' }).click()

    await expect(page.getByText('Profile updated')).toBeVisible()
    await expect(sheet).toHaveCount(0)
    await expect(page.getByText('Ezhil Arasan', { exact: true })).toBeVisible()
    const [row] = await sql<{ name: string; email: string | null; phone: string }[]>`
      select name, email, phone from users where id = ${E.id}
    `
    // The phone is the sign-in: never changed here.
    expect(row).toEqual({ name: 'Ezhil Arasan', email: 'ezhil@example.com', phone: E.phone })
  })

  test("a car's make, model, plate and colour", async ({ page, context }) => {
    await signIn(context, E.phone)
    await page.goto('/profile')
    await page.getByRole('button', { name: 'Edit Honda Amaze' }).click()

    const sheet = page.getByRole('dialog', { name: 'Edit vehicle' })
    await sheet.getByLabel('Model').fill('City')
    await sheet.getByLabel('License plate (optional)').fill('tn 05 xy 9999')
    await sheet.getByLabel('Colour (optional)').fill('Pearl White')
    await sheet.getByRole('button', { name: 'Save' }).click()

    await expect(page.getByText('Vehicle updated')).toBeVisible()
    await expect(page.getByRole('link', { name: 'Honda City: history' })).toBeVisible()
    const [car] = await sql<{ make: string; model: string; license_plate: string | null; color: string | null }[]>`
      select make, model, license_plate, color from user_vehicles where id = ${E.vehicleId}
    `
    expect(car).toEqual({ make: 'Honda', model: 'City', license_plate: 'TN 05 XY 9999', color: 'Pearl White' })

    // Emptied, the plate and colour are cleared, not kept.
    await page.getByRole('button', { name: 'Edit Honda City' }).click()
    await sheet.getByLabel('License plate (optional)').fill('')
    await sheet.getByLabel('Colour (optional)').fill('')
    await sheet.getByRole('button', { name: 'Save' }).click()
    await expect(sheet).toHaveCount(0)
    const [cleared] = await sql<{ license_plate: string | null; color: string | null }[]>`
      select license_plate, color from user_vehicles where id = ${E.vehicleId}
    `
    expect(cleared).toEqual({ license_plate: null, color: null })
  })

  test("an address's label, street and city", async ({ page, context }) => {
    await signIn(context, E.phone)
    await page.goto('/profile')
    await page.getByRole('button', { name: 'Edit Home address' }).click()

    const sheet = page.getByRole('dialog', { name: 'Edit address' })
    await expect(sheet.getByLabel('Address')).toHaveValue('4, Editing Street, 605602')
    await sheet.getByLabel('Label').fill('Parents')
    await sheet.getByLabel('Address').fill('22, New Street, 605602')
    await sheet.getByLabel('City').fill('Tindivanam')
    await sheet.getByRole('button', { name: 'Save' }).click()

    await expect(page.getByText('Address updated')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Edit Parents address' })).toBeVisible()
    const [address] = await sql<{ label: string; address: string; city: string; lat: number | null }[]>`
      select label, address, city, lat from user_addresses where id = ${E.addressId}
    `
    expect(address).toMatchObject({ label: 'Parents', address: '22, New Street, 605602', city: 'Tindivanam' })
    // The pin stays where it was.
    expect(Number(address!.lat)).toBeCloseTo(PREIOS.pin.lat + 0.01, 4)
  })
})
