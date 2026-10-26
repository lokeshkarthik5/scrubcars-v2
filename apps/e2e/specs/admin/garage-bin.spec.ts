/**
 * The garage Bin: moving a garage there takes it out of everything customers
 * read and locks its own team out of it, never out of a live garage; Restore
 * brings it back as it was; Delete forever deletes it with its bookings and
 * keeps real money (and then the garage's name and address) for the accounts.
 *
 * The rules are unit-tested in apps/server/src/lib/vendor-bin.test.ts and
 * data-reset.test.ts; this file checks them end to end, across the customer
 * API, the garage app's login and tenant paths, the support session and the
 * admin panel. Every garage here is one of the VENDORS.bin* fixtures, which
 * nobody else reads, and every customer one of CUSTOMERS.bin*.
 */
import { request as playwrightRequest, type APIRequestContext } from '@playwright/test'
import { test, expect, asRole } from '../../support/fixtures'
import { API, loginViaApi } from '../../support/auth'
import { forgetOtps, sql } from '../../support/db'
import { ADMIN_LOGINS, BOOKING_INTENTS, BOOKINGS, CUSTOMERS, SERVICES, STAFF, VENDORS } from '../../support/seed-ids'

test.use({ storageState: asRole('admin') })

const ADMIN_VENDORS = `${API}/api/v1/admin/vendors`
const TEAM = VENDORS.binTeam
const LIVE = VENDORS.binOwnerLive

/** "#B1A00001": the reference as the panel shows it. */
const reference = (id: string) => id.slice(0, 8).toUpperCase()

/** The garage-app request for the company a session acts as. */
const asCompany = (ctx: APIRequestContext, vendorId: string) =>
  ctx.get(`${API}/api/v1/vendors/me`, { headers: { 'X-Vendor-Id': vendorId } })

const vendorsOfSession = async (ctx: APIRequestContext) => {
  const me = await ctx.get(`${API}/api/v1/auth/me`)
  expect(me.status()).toBe(200)
  return ((await me.json()).data.vendors as Array<{ id: string }>).map((v) => v.id).sort()
}

/** Whether the customer list (search, and the map's bbox) finds the garage. */
async function listed(ctx: APIRequestContext, vendorId: string, name: string) {
  const search = await ctx.get(`${API}/api/v1/vendors`, { params: { q: name } })
  expect(search.status()).toBe(200)
  const inSearch = ((await search.json()).data.items as Array<{ id: string }>).some((v) => v.id === vendorId)
  const [{ lat, lng }] = await sql<{ lat: number; lng: number }[]>`
    select lat, lng from vendors where id = ${vendorId}
  `
  const map = await ctx.get(`${API}/api/v1/vendors`, {
    params: {
      bbox: `${lng - 0.02},${lat - 0.02},${lng + 0.02},${lat + 0.02}`,
      includeUnlocated: 'false',
    },
  })
  expect(map.status()).toBe(200)
  const onMap = ((await map.json()).data.items as Array<{ id: string }>).some((v) => v.id === vendorId)
  return { inSearch, onMap }
}

/** Sends a garage-app login code: refused for someone with no company. */
async function sendVendorCode(phone: string) {
  await forgetOtps(phone)
  const ctx = await playwrightRequest.newContext({ storageState: { cookies: [], origins: [] } })
  const response = await ctx.post(`${API}/api/v1/auth/otp/send`, {
    data: { phone, purpose: 'login', audience: 'vendor' },
  })
  const body = { status: response.status(), json: await response.json() }
  await ctx.dispose()
  return body
}

test.describe.serial('the Bin takes a garage off the app, and Restore brings it back @p0', () => {
  let operator: APIRequestContext
  let owner: APIRequestContext
  let support: APIRequestContext
  let customer: APIRequestContext

  test.beforeAll(async () => {
    // As seeded, whatever an earlier attempt left: on the app, team flags on.
    await sql`
      update vendors set deleted_at = null, deleted_by_name = null, deleted_reason = null
       where id = ${TEAM.id}
    `
    await sql`
      update users set is_vendor_owner = true
       where id in (${STAFF.binOwner.id}, ${STAFF.binOperator.id})
    `
    operator = await loginViaApi(STAFF.binOperator.phone, 'vendor')
    owner = await loginViaApi(STAFF.binOwner.phone, 'vendor')
    support = await loginViaApi(STAFF.superAdmin.phone, 'vendor')
    customer = await loginViaApi(CUSTOMERS.binBrowse.phone)
  })

  test.afterAll(async () => {
    await Promise.all([operator, owner, support, customer].map((ctx) => ctx?.dispose()))
  })

  test('moving it to the Bin hides it from customers and closes it to its team', async ({ page, browser }) => {
    // On the app first, so every absence below is the Bin's doing.
    expect(await listed(page.request, TEAM.id, TEAM.name)).toEqual({ inSearch: true, onMap: true })
    expect((await page.request.get(`${API}/api/v1/vendors/${TEAM.id}`)).status()).toBe(200)
    expect((await asCompany(operator, TEAM.id)).status()).toBe(200)
    expect(await vendorsOfSession(owner)).toEqual([TEAM.id, LIVE.id].sort())

    // The admin panel: the row's ⋯, then the sheet.
    await page.goto('/vendors?show=all')
    const card = page.getByRole('row', { name: TEAM.name, exact: true })
    await card.getByRole('button', { name: `More for ${TEAM.name}` }).click()
    await card.getByRole('button', { name: `Move ${TEAM.name} to the Bin` }).click()
    const sheet = page.getByRole('dialog', { name: `Move ${TEAM.name} to the Bin` })
    await expect(sheet.getByText("Its team can't sign in to it.")).toBeVisible()
    await expect(sheet.getByText('No upcoming bookings to cancel.')).toBeVisible()
    const move = sheet.getByRole('button', { name: 'Move to bin' })
    // No name to type (0058): the sheet says who signs it.
    await expect(sheet.getByLabel('Your name')).toHaveCount(0)
    await expect(sheet.getByText('Signed as E2E Admin')).toBeVisible()
    await sheet.getByLabel('Reason (optional)').fill('E2E bin test')
    await move.click()
    await expect(page.getByRole('status').filter({ hasText: 'Moved to the Bin.' })).toBeVisible()

    const [row] = await sql<{ deleted_by_name: string; deleted_reason: string; binned: boolean }[]>`
      select deleted_by_name, deleted_reason, deleted_at is not null as binned
        from vendors where id = ${TEAM.id}
    `
    expect(row).toEqual({ deleted_by_name: 'E2E Admin', deleted_reason: 'E2E bin test', binned: true })
    const [audit] = await sql<{ actor_name: string; actor_sub: string }[]>`
      select actor_name, actor_sub from admin_audit_log
       where action = 'garage_binned' and summary->>'vendorId' = ${TEAM.id}
       order by created_at desc limit 1
    `
    expect(audit).toEqual({ actor_name: 'E2E Admin', actor_sub: `admin:${ADMIN_LOGINS.e2e.id}` })

    // Under Bin, and in no other chip.
    await page.goto('/vendors?show=all')
    await expect(page.getByRole('row', { name: TEAM.name, exact: true })).toHaveCount(0)
    await page.goto('/vendors?show=bin')
    const binCard = page.getByRole('row', { name: TEAM.name, exact: true })
    await expect(binCard.getByText('E2E bin test')).toBeVisible()
    await expect(binCard.getByText('E2E Admin')).toBeVisible()
    await expect(page.getByText('Nothing in the Bin is deleted on its own.')).toBeVisible()

    // Customers: no list, no search, no map, no page, nothing to book.
    expect(await listed(page.request, TEAM.id, TEAM.name)).toEqual({ inSearch: false, onMap: false })
    for (const path of ['', '/services', '/packages', '/working-hours', '/closures']) {
      const response = await page.request.get(`${API}/api/v1/vendors/${TEAM.id}${path}`)
      expect(response.status(), path || 'garage page').toBe(404)
    }
    expect((await page.request.get(`${API}/api/v1/reviews/vendors/${TEAM.id}`)).status()).toBe(404)
    const checkout = await customer.post(`${API}/api/v1/booking-intents`, {
      data: {
        vendorId: TEAM.id,
        serviceIds: [SERVICES.binTeamWash.id],
        vehicleId: CUSTOMERS.binBrowse.vehicleId,
        bookingType: 'dropin',
        paymentMethod: 'online',
        scheduledAt: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString(),
      },
    })
    expect(checkout.status()).toBe(404)
    expect((await checkout.json()).code).toBe('VENDOR_NOT_FOUND')
    const garagePage = await browser.newPage()
    await garagePage.goto(`http://localhost:3000/garage/${TEAM.id}`)
    await expect(garagePage.getByText("This garage isn't taking bookings on Detlio.")).toBeVisible()
    await garagePage.close()

    // Its team: the operator's session reaches nothing, and a new login is
    // refused, since the Bin was their only company.
    expect((await asCompany(operator, TEAM.id)).status()).toBe(404)
    expect((await operator.get(`${API}/api/v1/vendors/me`)).status()).toBe(404)
    expect(await sendVendorCode(STAFF.binOperator.phone)).toMatchObject({
      status: 403,
      json: { success: false, code: 'NOT_A_VENDOR' },
    })

    // The owner also owns a live garage: still signs in, and the company
    // switcher lists that one alone, which still opens.
    const ownerAgain = await loginViaApi(STAFF.binOwner.phone, 'vendor')
    expect(await vendorsOfSession(ownerAgain)).toEqual([LIVE.id])
    expect((await asCompany(ownerAgain, TEAM.id)).status()).toBe(404)
    expect((await asCompany(ownerAgain, LIVE.id)).status()).toBe(200)
    expect((await ownerAgain.get(`${API}/api/v1/vendors/me`)).status()).toBe(200)
    await ownerAgain.dispose()
    const flags = await sql<{ id: string; is_vendor_owner: boolean }[]>`
      select id, is_vendor_owner from users where id in (${STAFF.binOwner.id}, ${STAFF.binOperator.id})
    `
    expect(Object.fromEntries(flags.map((f) => [f.id, f.is_vendor_owner]))).toEqual({
      [STAFF.binOwner.id]: true,
      [STAFF.binOperator.id]: false,
    })

    // A support session is a 404 too, like a garage that never was; a live
    // garage still opens, marked as support.
    const refused = await asCompany(support, TEAM.id)
    expect(refused.status()).toBe(404)
    expect(await refused.json()).toEqual({
      success: false,
      message: 'Vendor profile not found',
      code: 'VENDOR_NOT_FOUND',
    })
    const allowed = await asCompany(support, LIVE.id)
    expect(allowed.status()).toBe(200)
    expect(allowed.headers()['x-detlio-support-session']).toBe('true')
    expect((await asCompany(support, '00000000-0000-4000-8000-00000000beef')).status()).toBe(404)

    // Admin can look but not change: any other write is a 409.
    const verify = await page.request.patch(`${ADMIN_VENDORS}/${TEAM.id}/verify`)
    expect(verify.status()).toBe(409)
    expect(await verify.json()).toEqual({
      success: false,
      message: 'This garage is in the Bin. Restore it before making changes.',
      code: 'VENDOR_IN_BIN',
    })
    await page.goto(`/vendors/${TEAM.id}/edit`)
    await expect(page.getByText('In the Bin, read-only')).toBeVisible()
    await expect(page.getByLabel('Business name')).toBeDisabled()
  })

  test('Restore brings it back as it was, team access included', async ({ page }) => {
    await page.goto('/vendors?show=bin')
    const binCard = page.getByRole('row', { name: TEAM.name, exact: true })
    await binCard.getByRole('button', { name: `Restore ${TEAM.name}` }).click()
    const dialog = page.getByRole('dialog', { name: `Restore ${TEAM.name}` })
    await dialog.getByRole('button', { name: 'Restore' }).click()
    await expect(page.getByRole('status').filter({ hasText: `${TEAM.name} is back` })).toBeVisible()

    const [row] = await sql<{ binned: boolean; status: string; is_verified: boolean }[]>`
      select deleted_at is not null as binned, status, is_verified from vendors where id = ${TEAM.id}
    `
    // Stage and verification were never touched, so it is live again.
    expect(row).toEqual({ binned: false, status: 'active', is_verified: true })

    expect(await listed(page.request, TEAM.id, TEAM.name)).toEqual({ inSearch: true, onMap: true })
    expect((await page.request.get(`${API}/api/v1/vendors/${TEAM.id}`)).status()).toBe(200)
    // The operator's same session works again, and so does a new login.
    expect((await asCompany(operator, TEAM.id)).status()).toBe(200)
    const operatorAgain = await loginViaApi(STAFF.binOperator.phone, 'vendor')
    expect(await vendorsOfSession(operatorAgain)).toEqual([TEAM.id])
    await operatorAgain.dispose()
    expect(await vendorsOfSession(owner)).toEqual([TEAM.id, LIVE.id].sort())
    expect((await asCompany(support, TEAM.id)).status()).toBe(200)

    await page.goto('/vendors?show=all')
    await expect(page.getByRole('row', { name: TEAM.name, exact: true })).toBeVisible()
  })
})

test.describe('moving a garage with bookings to come @p0', () => {
  test('cancels them as Detlio, "Garage removed", and the paid one is a refund owed', async ({ page }) => {
    const garage = VENDORS.binPaid
    // As seeded, whatever an earlier attempt left.
    await sql`
      update vendors set deleted_at = null, deleted_by_name = null, deleted_reason = null
       where id = ${garage.id}
    `
    await sql`
      update bookings set status = 'confirmed', cancelled_by = null, cancelled_on_behalf_of = null,
                          cancellation_reason = null, cancelled_at = null
       where id = ${BOOKINGS.binPaidUpcoming}
    `
    await sql`
      update bookings set status = 'pending', cancelled_by = null, cancelled_on_behalf_of = null,
                          cancellation_reason = null, cancelled_at = null
       where id = ${BOOKINGS.binUnpaidUpcoming}
    `

    const preview = await page.request.get(`${ADMIN_VENDORS}/${garage.id}/bin-preview`)
    expect(preview.status()).toBe(200)
    const { data: before } = await preview.json()
    expect(before).toMatchObject({ inBin: false, upcomingCount: 2, paidCount: 1 })
    expect(
      (before.upcoming as Array<{ id: string; paid: boolean; reference: string }>).map((b) => [b.id, b.paid])
    ).toEqual([
      [BOOKINGS.binPaidUpcoming, true],
      [BOOKINGS.binUnpaidUpcoming, false],
    ])

    // The dialog says the same before anyone confirms.
    await page.goto('/vendors?show=pending')
    const card = page.getByRole('row', { name: garage.name, exact: true })
    await card.getByRole('button', { name: `More for ${garage.name}` }).click()
    await card.getByRole('button', { name: `Move ${garage.name} to the Bin` }).click()
    const sheet = page.getByRole('dialog', { name: `Move ${garage.name} to the Bin` })
    await expect(sheet.getByText('2 upcoming bookings will be cancelled, 1 of them paid.')).toBeVisible()
    await expect(sheet.getByText(`#${reference(BOOKINGS.binPaidUpcoming)}`)).toBeVisible()
    await sheet.getByRole('button', { name: 'Move to bin' }).click()
    await expect(
      page.getByRole('status').filter({ hasText: 'Moved to the Bin. 2 bookings cancelled. 1 refund is owed on Refunds.' })
    ).toBeVisible()

    const rows = await sql<
      { id: string; status: string; cancelled_by: string; cancelled_on_behalf_of: string; cancellation_reason: string }[]
    >`
      select id, status, cancelled_by, cancelled_on_behalf_of, cancellation_reason
        from bookings where id in (${BOOKINGS.binPaidUpcoming}, ${BOOKINGS.binUnpaidUpcoming})
       order by id
    `
    for (const row of rows) {
      expect(row).toMatchObject({
        status: 'cancelled',
        cancelled_by: 'admin',
        cancelled_on_behalf_of: 'detlio',
        cancellation_reason: 'Garage removed',
      })
    }
    // Nothing was refunded by itself: the paid one waits on Refunds.
    const [payment] = await sql<{ status: string; refunded_amount: string | null }[]>`
      select status, refunded_amount from payments where booking_id = ${BOOKINGS.binPaidUpcoming}
    `
    expect(payment.status).toBe('paid')
    expect(Number(payment.refunded_amount ?? 0)).toBe(0)

    const owed = await page.request.get(`${API}/api/v1/admin/refunds?status=owed`)
    expect(owed.status()).toBe(200)
    const list = (await owed.json()).data as Array<{ kind: string; id: string; amountOwed: string; reason: string }>
    expect(list.find((r) => r.kind === 'booking' && r.id === BOOKINGS.binPaidUpcoming)).toMatchObject({
      amountOwed: '499.00',
      reason: 'Cancelled by Detlio',
    })
    expect(list.find((r) => r.id === BOOKINGS.binUnpaidUpcoming)).toBeUndefined()

    await page.goto('/refunds')
    await expect(page.getByText(`#${reference(BOOKINGS.binPaidUpcoming)}`).first()).toBeVisible()
  })
})

test.describe('delete forever @p0', () => {
  test('a garage with a package and an abandoned checkout is deleted outright', async ({ page }) => {
    const garage = VENDORS.binHard
    await page.goto('/vendors?show=bin')
    const card = page.getByRole('row', { name: garage.name, exact: true })
    await expect(card.getByText('Test garage from setup')).toBeVisible()
    await expect(card.getByText('1 booking will be deleted with it')).toBeVisible()

    await card.getByRole('button', { name: `Delete ${garage.name} forever` }).click()
    const sheet = page.getByRole('dialog', { name: `Delete ${garage.name} forever` })
    await expect(sheet.getByText("This can't be undone. These go with it:")).toBeVisible()
    await expect(sheet.getByText('1 booking, and 1 unfinished checkout')).toBeVisible()
    await expect(sheet.getByText('Logo, photos and service pictures')).toBeVisible()
    await expect(sheet.getByText('Services, prices, hours and team logins')).toBeVisible()
    await expect(sheet.getByText('Payments, refunds and receipt numbers')).toBeVisible()
    await expect(sheet.getByText('Real money only')).toBeVisible()

    const button = sheet.getByRole('button', { name: 'Delete forever' })
    await sheet.getByLabel('Type the garage name to confirm').fill(garage.name.toLowerCase())
    await expect(button).toBeDisabled()
    await sheet.getByLabel('Type the garage name to confirm').fill(garage.name)
    await expect(button).toBeEnabled()
    await button.click()
    await expect(
      page.getByRole('status').filter({ hasText: `${garage.name} was deleted forever.` })
    ).toBeVisible()

    const count = async (query: Promise<{ n: string }[]>) => Number((await query)[0].n)
    expect(await count(sql`select count(*)::text as n from vendors where id = ${garage.id}`)).toBe(0)
    expect(
      await count(sql`
        select count(*)::text as n from services
         where id in (${SERVICES.binHardWash.id}, ${SERVICES.binHardPackage.id})
      `)
    ).toBe(0)
    expect(await count(sql`select count(*)::text as n from bookings where id = ${BOOKINGS.binHardTest}`)).toBe(0)
    expect(
      await count(sql`select count(*)::text as n from booking_intents where id = ${BOOKING_INTENTS.binAbandoned}`)
    ).toBe(0)
    const [audit] = await sql<{ actor_name: string; outcome: string }[]>`
      select actor_name, summary->>'outcome' as outcome from admin_audit_log
       where action = 'garage_deleted' and summary->>'vendorId' = ${garage.id}
    `
    expect(audit).toEqual({ actor_name: 'E2E Admin', outcome: 'hard_delete' })
  })

  test('a garage with live money is kept as a tombstone, and its live booking with it', async ({ page }) => {
    const garage = VENDORS.binTomb
    const preview = await page.request.get(`${ADMIN_VENDORS}/${garage.id}/delete-preview`)
    expect(preview.status()).toBe(200)
    const { data: plan } = await preview.json()
    expect(plan).toMatchObject({
      inBin: true,
      outcome: 'tombstone',
      bookings: { deleted: 1, kept: 1 },
      kept: [{ kind: 'booking', reference: reference(BOOKINGS.binTombLive), label: 'Real payment — kept' }],
    })

    const remove = (data: Record<string, string>) =>
      page.request.delete(`${ADMIN_VENDORS}/${garage.id}`, {
        data: { confirmName: garage.name, selectionHash: plan.selectionHash, ...data },
      })

    // Refusals delete nothing: the wrong name, and a preview that is not this one.
    const wrongName = await remove({ confirmName: 'Bin Tombstone' })
    expect(wrongName.status()).toBe(400)
    expect(await wrongName.json()).toEqual({
      success: false,
      message: 'Type the garage name exactly as shown to confirm.',
      code: 'CONFIRM_NAME_MISMATCH',
    })
    const stale = await remove({ selectionHash: '0'.repeat(64) })
    expect(stale.status()).toBe(409)
    expect((await stale.json()).code).toBe('PREVIEW_STALE')
    expect((await sql`select 1 from bookings where id = ${BOOKINGS.binTombTest}`).length).toBe(1)

    const done = await remove({})
    expect(done.status()).toBe(200)
    expect((await done.json()).data).toMatchObject({ outcome: 'tombstone', keptBookings: 1 })

    const [row] = await sql<
      { purged: boolean; business_name: string; address: string; phone: string; email: string | null }[]
    >`
      select purged_at is not null as purged, business_name, address, phone, email
        from vendors where id = ${garage.id}
    `
    // Name and address stay for the kept receipt; how to reach it does not.
    expect(row).toEqual({
      purged: true,
      business_name: garage.name,
      address: '5, Bin Road, Porur',
      phone: '',
      email: null,
    })
    expect((await sql`select 1 from bookings where id = ${BOOKINGS.binTombLive}`).length).toBe(1)
    expect((await sql`select 1 from bookings where id = ${BOOKINGS.binTombTest}`).length).toBe(0)
    // The kept booking still names its service, so that stays, off sale.
    const services = await sql<{ is_active: boolean }[]>`
      select is_active from services where vendor_id = ${garage.id}
    `
    expect(services).toEqual([{ is_active: false }])
    expect((await sql`select 1 from user_member_mapping where vendor_id = ${garage.id}`).length).toBe(0)
    expect((await sql`select 1 from vendor_working_hours where vendor_id = ${garage.id}`).length).toBe(0)

    // Gone as far as admin is concerned.
    expect((await page.request.get(`${ADMIN_VENDORS}/${garage.id}`)).status()).toBe(404)
    const list = await page.request.get(ADMIN_VENDORS)
    expect(((await list.json()).data as Array<{ id: string }>).some((v) => v.id === garage.id)).toBe(false)
  })

  test('only a super-admin reaches the Bin', async () => {
    const customer = await loginViaApi(CUSTOMERS.binBrowse.phone)
    const response = await customer.post(`${ADMIN_VENDORS}/${VENDORS.binPaid.id}/restore`, {
      data: {},
    })
    expect(response.status()).toBe(403)
    await customer.dispose()
  })
})
