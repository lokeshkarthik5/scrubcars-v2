/**
 * Coverage part 3 (0064): demand per zone (the zone list's line and Hot,
 * the Demand key, a zone's demand card and its way to the zone's requests),
 * customers' recommendations in a zone's call list (Make lead, duplicates:
 * Link to a lead / Make lead anyway / Not now, Dismiss, the ones in no
 * zone), Onboard on a lead made from a recommendation (its garage becomes
 * the recommendation's), and Edit lead keeping Google's name and phone
 * apart unless edited or "Confirmed by phone".
 *
 * Works on DEMAND's rows in Perambur only (ids 5020–5099), and puts back
 * what it changes, before and after. requests.spec.ts cancels DEMAND's open
 * request at the same time, so open-request counts are never asserted
 * here. The rules are unit-tested in apps/server/src/lib/zone-demand.test.ts,
 * recommendations.test.ts and coverage-demand.routes.test.ts.
 */
import type { Locator, Page } from '@playwright/test'
import { test, expect, asRole } from '../../support/fixtures'
import { sql } from '../../support/db'
import { DEMAND, LEADS } from '../../support/seed-ids'

test.use({ storageState: asRole('admin') })

const REC = DEMAND.recommendations
const OPEN_RECS = [REC.make.id, REC.dup.id, REC.anyway.id, REC.dismiss.id]

let googlePin: { lat: number; lng: number } | null = null

const cleanUp = async () => {
  // Leads this spec made from recommendations (the seed's are kept).
  await sql`update garage_recommendations set lead_id = null where id in ${sql(OPEN_RECS)}`
  await sql`delete from leads where created_by_name <> 'E2E seed'
    and name in (${REC.make.name}, ${REC.anyway.name}, ${REC.dup.name})`
  await sql`update garage_recommendations set status = 'new', lead_id = null, vendor_id = null,
    handled_by = null, handled_at = null, updated_at = now() where id in ${sql(OPEN_RECS)}`
  // The onboarded garage, its owner, and the lead and recommendation it came from.
  await sql`update garage_recommendations set status = 'contacted', vendor_id = null,
    lead_id = ${DEMAND.onboardLead.id} where id = ${REC.onboard.id}`
  await sql`update leads set status = 'to_target', vendor_id = null, onboarded_at = null
    where id = ${DEMAND.onboardLead.id}`
  const owner = await sql<
    { id: string }[]
  >`select id from users where phone = ${DEMAND.onboardOwner.phone}`
  if (owner.length) {
    const vendorIds = sql`(select id from vendors where owner_id = ${owner[0]!.id})`
    await sql`update garage_recommendations set vendor_id = null where vendor_id in ${vendorIds}`
    await sql`update leads set vendor_id = null where vendor_id in ${vendorIds}`
    await sql`delete from user_member_mapping where user_id = ${owner[0]!.id}`
    await sql`delete from vendor_working_hours where vendor_id in ${vendorIds}`
    await sql`delete from vendors where owner_id = ${owner[0]!.id}`
    await sql`delete from users where id = ${owner[0]!.id}`
  }
  // The Google lead: Google's name and phone only, its pin back.
  if (googlePin) {
    await sql`update leads set name = null, phone = null, lat = ${googlePin.lat}, lng = ${googlePin.lng},
      pin_source = 'google' where id = ${DEMAND.googleLead.id}`
  }
}

async function openPerambur(page: Page) {
  const [zone] = await sql<
    { id: string }[]
  >`select id from zones where slug = ${LEADS.zoneSlug}`
  await page.goto(`/coverage?zone=${zone!.id}`)
  const drawer = page.getByRole('dialog', { name: LEADS.zoneName })
  await expect(drawer).toBeVisible()
  return {
    drawer,
    calls: drawer.getByRole('list', {
      name: `Call list for ${LEADS.zoneName}`,
    }),
    recs: drawer.getByRole('list', {
      name: `Recommendations for ${LEADS.zoneName}`,
    }),
    zoneId: zone!.id,
  }
}

const row = (list: Locator, name: string) =>
  list.getByRole('listitem').filter({ hasText: name })

const zoneButton = (page: Page, name: string) =>
  page
    .getByRole('region', { name: 'Zones', exact: true })
    .getByRole('button', { name: new RegExp(`^${name}: `) })

test.describe.serial('Coverage demand and recommendations @p0', () => {
  test.beforeAll(async () => {
    const [lead] = await sql<
      { lat: number; lng: number }[]
    >`select lat, lng from leads where id = ${DEMAND.googleLead.id}`
    googlePin =
      lead && lead.lat !== null ? { lat: lead.lat, lng: lead.lng } : null
    await cleanUp()
  })
  test.afterAll(cleanUp)

  test('the zone list: demand, Hot and the key; a zone’s demand card and its requests', async ({
    page,
  }) => {
    await page.goto('/coverage')
    await page.getByRole('radio', { name: 'All zones' }).click()
    // 12 waiting + 2 failed requests = 14: Hot (top 3, at least 10).
    await expect(zoneButton(page, LEADS.zoneName)).toHaveAccessibleName(
      /^Perambur: \d+ of 5 live, \d+ known, hot, 12 waiting · 2 failed requests/
    )
    await expect(zoneButton(page, LEADS.zoneName)).toContainText('Hot')
    await expect(zoneButton(page, LEADS.zoneName)).toContainText(
      '12 waiting · 2 failed requests'
    )

    const key = page.getByRole('region', { name: 'Demand' })
    await expect(key).toContainText(
      'Hot: the top 3 zones by people waiting plus requests nobody accepted in the last 30 days, each with at least 10.'
    )
    await key.getByRole('link', { name: 'See every request' }).click()
    await expect(page).toHaveURL(/\/requests$/)
    await expect(
      page.getByRole('heading', { name: 'Requests', exact: true })
    ).toBeVisible()

    const { drawer } = await openPerambur(page)
    const demand = drawer.getByRole('region', { name: 'Demand' })
    await expect(demand).toContainText(`Demand in ${LEADS.zoneName}`)
    const figure = (label: string) =>
      demand.locator('div', { has: page.getByText(label, { exact: true }) })
    await expect(figure('Waiting').last()).toContainText('12')
    await expect(figure('Hold a free wash').last()).toContainText('12')
    await expect(figure('Failed requests').last()).toContainText('2')
    await expect(figure('Requests (30 days)').last()).toContainText('4')
    await expect(drawer.getByText('Hot', { exact: true }).first()).toBeVisible()

    await demand
      .getByRole('link', { name: `See ${LEADS.zoneName}’s requests` })
      .click()
    await expect(page).toHaveURL(/\/requests\?filter=all&zone=perambur$/)
    await expect(
      page.getByText(`Only requests sent from ${LEADS.zoneName}.`)
    ).toBeVisible()
  })

  test('recommendations: Make lead, Link to a lead, Not now, Make lead anyway, Dismiss', async ({
    page,
  }) => {
    const { calls, recs } = await openPerambur(page)

    // Make lead: a lead the team calls, pinned from the customer's link.
    const make = row(recs, REC.make.name)
    await expect(make).toContainText(
      `Recommended by a customer · “${REC.make.why}”`
    )
    await expect(
      make.getByRole('link', { name: `Call ${REC.make.name}` })
    ).toHaveAttribute('href', `tel:+91${REC.make.phone}`)
    await expect(
      make.getByRole('link', { name: `${REC.make.name} on Google Maps` })
    ).toHaveAttribute('href', DEMAND.makeLink)
    await make
      .getByRole('button', { name: `Make ${REC.make.name} a lead` })
      .click()
    await expect(row(recs, REC.make.name)).toHaveCount(0)
    await expect(row(calls, REC.make.name)).toContainText(
      `Recommended by a customer · “${REC.make.why}”`
    )
    const [made] = await sql<
      { id: string; source: string; lat: number; zone_slug: string }[]
    >`select l.id, l.source, l.lat, z.slug as zone_slug from leads l join zones z on z.id = l.zone_id
      where l.name = ${REC.make.name}`
    expect(made).toMatchObject({ source: 'customer', zone_slug: 'perambur' })
    expect(made!.lat).toBeCloseTo(13.118, 4)
    const [madeRec] = await sql<
      { status: string; lead_id: string; handled_by: string }[]
    >`select status, lead_id, handled_by from garage_recommendations where id = ${REC.make.id}`
    expect(madeRec).toEqual({
      status: 'contacted',
      lead_id: made!.id,
      handled_by: 'E2E Admin',
    })

    // A lookalike of a lead the team has: linked to it, no second lead.
    const dup = row(recs, REC.dup.name)
    await dup
      .getByRole('button', { name: `Make ${REC.dup.name} a lead` })
      .click()
    await expect(dup.getByRole('alert')).toContainText(
      `${DEMAND.dupLead.name} — lead, To target`
    )
    await dup
      .getByRole('button', { name: `Link to ${DEMAND.dupLead.name}` })
      .click()
    await expect(row(recs, REC.dup.name)).toHaveCount(0)
    await expect(row(calls, DEMAND.dupLead.name)).toContainText(
      `Recommended by a customer · “${REC.dup.why}”`
    )
    expect(
      (
        await sql`select lead_id, status from garage_recommendations where id = ${REC.dup.id}`
      )[0]
    ).toEqual({ lead_id: DEMAND.dupLead.id, status: 'contacted' })
    expect(
      (await sql`select 1 from leads where name = ${REC.dup.name}`).length
    ).toBe(1)

    // Not now, then Make lead anyway: its own lead.
    const anyway = row(recs, REC.anyway.name)
    await anyway
      .getByRole('button', { name: `Make ${REC.anyway.name} a lead` })
      .click()
    await expect(anyway.getByRole('alert')).toContainText(DEMAND.dupLead.name)
    await anyway.getByRole('button', { name: 'Not now' }).click()
    await expect(anyway.getByRole('alert')).toHaveCount(0)
    await anyway
      .getByRole('button', { name: `Make ${REC.anyway.name} a lead` })
      .click()
    await anyway
      .getByRole('button', { name: `Make ${REC.anyway.name} a lead anyway` })
      .click()
    await expect(row(recs, REC.anyway.name)).toHaveCount(0)
    await expect(row(calls, REC.anyway.name)).toBeVisible()
    expect(
      (await sql`select source from leads where name = ${REC.anyway.name}`)[0]
    ).toEqual({ source: 'customer' })

    // Dismiss: off the list, by whom.
    await row(recs, REC.dismiss.name)
      .getByRole('button', { name: `Dismiss ${REC.dismiss.name}` })
      .click()
    await expect(row(recs, REC.dismiss.name)).toHaveCount(0)
    expect(
      (
        await sql`select status, handled_by from garage_recommendations where id = ${REC.dismiss.id}`
      )[0]
    ).toEqual({ status: 'declined', handled_by: 'E2E Admin' })
    // Nothing left to act on in Perambur: the section goes.
    await expect(recs).toHaveCount(0)

    // One in no zone: under "Not in a zone".
    await page
      .getByRole('dialog', { name: LEADS.zoneName })
      .getByRole('button', { name: 'Close' })
      .click()
    await page.getByRole('radio', { name: 'All zones' }).click()
    await page
      .getByRole('region', { name: 'Zones', exact: true })
      .getByRole('button', { name: /^Not in a zone/ })
      .click()
    const outside = page.getByRole('dialog', { name: 'Not in a zone' })
    await expect(
      outside
        .getByRole('list', { name: 'Recommendations for Not in a zone' })
        .getByText(REC.noZone.name)
    ).toBeVisible()
  })

  test('Onboard a lead made from a recommendation: the garage becomes the recommendation’s', async ({
    page,
  }) => {
    const { calls, zoneId } = await openPerambur(page)
    const lead = row(calls, DEMAND.onboardLead.name)
    await expect(lead).toContainText(
      `Recommended by a customer · “${REC.onboard.why}”`
    )
    await lead
      .getByRole('link', { name: `Onboard ${DEMAND.onboardLead.name}` })
      .click()
    await expect(page).toHaveURL(
      new RegExp(`/vendors/new\\?by=hand&lead=${DEMAND.onboardLead.id}$`)
    )
    await expect(page.getByLabel('Business name')).toHaveValue(
      DEMAND.onboardLead.name
    )
    await page.getByLabel('Owner name').fill(DEMAND.onboardOwner.name)
    await page.getByLabel('Owner phone').fill(DEMAND.onboardOwner.phone)
    await page.getByRole('tab', { name: 'Location' }).click()
    await page
      .getByLabel('Address', { exact: true })
      .fill('7, Onyx Street, Perambur')
    await page.getByLabel('Pincode').fill('600011')
    await page.getByRole('button', { name: 'Create garage' }).click()
    await expect(page).toHaveURL(new RegExp(`/coverage\\?zone=${zoneId}$`))
    // The lead is the garage's row now, still saying who recommended it.
    const garageRow = row(
      page
        .getByRole('dialog', { name: LEADS.zoneName })
        .getByRole('list', { name: `Call list for ${LEADS.zoneName}` }),
      DEMAND.onboardLead.name
    )
    await expect(garageRow).toContainText('Garage · not live yet · pending')
    await expect(garageRow).toContainText(
      `Recommended by a customer · “${REC.onboard.why}”`
    )

    const [onboarded] = await sql<
      { vendor_id: string | null; status: string }[]
    >`select vendor_id, status from leads where id = ${DEMAND.onboardLead.id}`
    expect(onboarded!.status).toBe('onboarded')
    expect(onboarded!.vendor_id).not.toBeNull()
    // The customer's recommendation follows: the referral credit pays on it.
    expect(
      (
        await sql`select vendor_id, status from garage_recommendations where id = ${REC.onboard.id}`
      )[0]
    ).toEqual({ vendor_id: onboarded!.vendor_id, status: 'joined' })
  })

  test('Edit lead: Google’s name and phone stay apart unless confirmed by phone', async ({
    page,
  }) => {
    const { calls } = await openPerambur(page)
    const name = DEMAND.googleLead.googleName
    await expect(row(calls, name)).toContainText('From map search')
    await row(calls, name)
      .getByRole('button', { name: `Edit ${name}` })
      .click()
    let dialog = page.getByRole('dialog', { name: `Edit ${name}` })
    await expect(dialog).toContainText(
      'The name and phone shown are Google’s until you edit them or tick Confirmed by phone'
    )
    const confirmed = dialog.getByRole('checkbox', {
      name: 'Confirmed by phone: keep this name and phone as ours',
    })
    await expect(confirmed).not.toBeChecked()

    // Saving something else (the pin) keeps them Google's.
    await dialog.getByRole('button', { name: 'Remove the pin' }).click()
    await dialog.getByRole('button', { name: 'Save changes' }).click()
    await expect(dialog).toHaveCount(0)
    expect(
      (
        await sql`select name, phone, lat, google_name from leads where id = ${DEMAND.googleLead.id}`
      )[0]
    ).toEqual({ name: null, phone: null, lat: null, google_name: name })

    // Ticked: they are the team's own.
    await row(calls, name)
      .getByRole('button', { name: `Edit ${name}` })
      .click()
    dialog = page.getByRole('dialog', { name: `Edit ${name}` })
    await dialog
      .getByRole('checkbox', {
        name: 'Confirmed by phone: keep this name and phone as ours',
      })
      .check()
    await dialog.getByRole('button', { name: 'Save changes' }).click()
    await expect(dialog).toHaveCount(0)
    expect(
      (
        await sql`select name, phone from leads where id = ${DEMAND.googleLead.id}`
      )[0]
    ).toEqual({ name, phone: DEMAND.googleLead.googlePhone })
    // Nothing of Google's left to confirm: the tick is gone.
    await row(calls, name)
      .getByRole('button', { name: `Edit ${name}` })
      .click()
    dialog = page.getByRole('dialog', { name: `Edit ${name}` })
    await expect(
      dialog.getByRole('checkbox', {
        name: 'Confirmed by phone: keep this name and phone as ours',
      })
    ).toHaveCount(0)
    await dialog.getByRole('button', { name: 'Cancel' }).click()
  })
})
