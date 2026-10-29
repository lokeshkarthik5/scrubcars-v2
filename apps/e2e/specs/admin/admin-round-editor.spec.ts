/**
 * The admin round in the garage editor (0064):
 * - a doorstep-only garage needs no address or pincode, and At the garage
 *   is refused until it has both;
 * - a service's duration may be left empty ("Duration not set", 60 min held
 *   in the calendar), and its own commission percent is set or cleared;
 * - descriptions in points (mockup description-points): the Points switch,
 *   Enter, Backspace, a pasted list, the arrows, Save, and the AI keeping
 *   the points;
 * - marks as a checklist (mockup marks-checklist): ticks with who and when,
 *   the call sheet's quick answers and typed ones, Done marking an unanswered
 *   call Asked, the edit dialog's ready-made lists and Enter, and an old
 *   note's "- " lines read as items.
 *
 * Only VENDORS.roundA and roundDoorstep are touched, and put back where a
 * later test reads them. The rules are unit-tested in the server's
 * lib/garage-address, service-duration, list-text, mark-checklist and the
 * admin's lib/service-rows tests.
 */
import type { Locator, Page } from '@playwright/test'
import { test, expect, asRole } from '../../support/fixtures'
import { sql } from '../../support/db'
import { ROUND, SERVICES, STAFF, VENDORS } from '../../support/seed-ids'

test.use({ storageState: asRole('admin') })

const A = VENDORS.roundA
const DOORSTEP = VENDORS.roundDoorstep

const service = async (id: string) => {
  const [row] = await sql<
    {
      duration_mins: number | null
      commission_rate: string | null
      description: string | null
    }[]
  >`
    select duration_mins, commission_rate::text, description from services where id = ${id}
  `
  return row
}

type Item = {
  id: string
  text: string
  done: boolean
  answer: string | null
  answeredBy: string | null
}
const mark = async (id: string) => {
  const [row] = await sql<
    { status: string; note: string | null; items: Item[] }[]
  >`
    select status, note, items from vendor_onboarding_marks where id = ${id}
  `
  return row
}

/** Pastes text into a box the way a browser does (React reads clipboardData). */
const paste = (box: Locator, text: string) =>
  box.evaluate((element, value) => {
    const data = new DataTransfer()
    data.setData('text/plain', value)
    element.dispatchEvent(
      new ClipboardEvent('paste', {
        clipboardData: data,
        bubbles: true,
        cancelable: true,
      })
    )
  }, text)

const serviceRow = (page: Page, name: string) =>
  page.getByRole('group', { name, exact: true })

test.describe.serial('the admin round: garage editor @p0', () => {
  test.afterAll(async () => {
    await sql`update services set duration_mins = null, description = 'An exterior foam wash and dry.'
      where id = ${SERVICES.roundWash.id}`
    await sql`update services set commission_rate = 6 where id = ${SERVICES.roundDetail.id}`
    await sql`update vendors set city = 'Chennai', dropin_enabled = false where id = ${DOORSTEP.id}`
  })

  test('a doorstep-only garage saves with no address, and At the garage waits for one', async ({
    page,
  }) => {
    await page.goto(`/vendors/${DOORSTEP.id}/edit?tab=location`)
    await expect(
      page.getByLabel('Address (optional)', { exact: true })
    ).toHaveValue('')
    await expect(
      page.getByLabel('Pincode (optional)', { exact: true })
    ).toHaveValue('')
    await expect(
      page.getByText('Doorstep only: the map pin is enough.', { exact: false })
    ).toBeVisible()
    // Its checklist does not ask for an address either.
    await expect(
      page.getByText('No address for at-garage customers')
    ).toHaveCount(0)

    await page.getByLabel('City', { exact: true }).fill('Kanchipuram')
    const save = page.getByRole('button', { name: 'Save changes' })
    await expect(save).toBeEnabled()
    await save.click()
    await expect
      .poll(
        async () =>
          (await sql`select city from vendors where id = ${DOORSTEP.id}`)[0]
            .city
      )
      .toBe('Kanchipuram')
    // Saved before the next edit (the editor reloads the garage after a save).
    await expect(save).toHaveCount(0)

    // At the garage needs the address customers drive to: refused, said, and
    // the tile goes back.
    const card = page.getByRole('region', { name: 'How customers book' })
    await card.getByRole('checkbox', { name: 'At the garage' }).check()
    await expect(card.getByRole('alert')).toContainText(
      'needs its address and a 6-digit pincode'
    )
    await expect(
      card.getByRole('checkbox', { name: 'At the garage' })
    ).not.toBeChecked()
    expect(
      (
        await sql`select dropin_enabled from vendors where id = ${DOORSTEP.id}`
      )[0].dropin_enabled
    ).toBe(false)
  })

  test('a service with no duration says so, and takes one or none again', async ({
    page,
  }) => {
    await page.goto(`/vendors/${A.id}/edit?tab=services`)
    const wash = serviceRow(page, SERVICES.roundWash.name)
    await expect(wash.getByText('Duration not set')).toBeVisible()
    await expect(
      wash.getByText('60 min is held in the calendar', { exact: false })
    ).toBeVisible()
    // Counted on the garage's checklist, as optional.
    await expect(page.getByText('Duration not set on 1 service')).toBeVisible()

    await wash.getByLabel(/duration$/).selectOption('45')
    await expect(wash.getByText('Duration not set')).toHaveCount(0)
    await page.getByRole('button', { name: 'Save changes' }).click()
    await expect
      .poll(async () => (await service(SERVICES.roundWash.id)).duration_mins)
      .toBe(45)
    // Saved: the save bar goes (an edit made while it saves is not kept).
    await expect(page.getByRole('button', { name: 'Save changes' })).toHaveCount(0)

    await wash.getByLabel(/duration$/).selectOption('')
    await expect(wash.getByText('Duration not set')).toBeVisible()
    await page.getByRole('button', { name: 'Save changes' }).click()
    await expect
      .poll(async () => (await service(SERVICES.roundWash.id)).duration_mins)
      .toBeNull()
    await expect(page.getByRole('button', { name: 'Save changes' })).toHaveCount(0)
  })

  test('a service’s own commission percent: shown, refused past 50, set and cleared', async ({
    page,
  }) => {
    await page.goto(`/vendors/${A.id}/edit?tab=services`)
    const detail = serviceRow(page, SERVICES.roundDetail.name)
    await detail
      .getByRole('button', { name: `More for ${SERVICES.roundDetail.name}` })
      .click()
    const box = detail.getByLabel(/commission percent$/)
    await expect(box).toHaveValue('6')
    await expect(
      detail.getByText('Empty uses the detailing rate, 5%.', { exact: false })
    ).toBeVisible()

    await box.fill('60')
    await expect(
      detail.getByText('Commission must be a percent from 0 to 50, or empty')
    ).toBeVisible()
    const save = page.getByRole('button', { name: 'Save changes' })
    await expect(save).toBeDisabled()
    await expect(
      page.getByRole('status').filter({ hasText: 'commission' })
    ).toHaveText('1 service needs its commission fixed (Services)')

    await box.fill('6.5')
    await save.click()
    await expect
      .poll(
        async () => (await service(SERVICES.roundDetail.id)).commission_rate
      )
      .toBe('6.50')
    // Saved before the next edit (the editor reloads the garage after a save).
    await expect(save).toHaveCount(0)

    await box.fill('')
    await page.getByRole('button', { name: 'Save changes' }).click()
    await expect
      .poll(
        async () => (await service(SERVICES.roundDetail.id)).commission_rate
      )
      .toBeNull()
    await expect(page.getByRole('button', { name: 'Save changes' })).toHaveCount(0)
  })

  test('a description in points: Enter, Backspace, a pasted list and the arrows, saved as "- " lines', async ({
    page,
  }) => {
    await page.goto(`/vendors/${A.id}/edit?tab=services`)
    const wash = serviceRow(page, SERVICES.roundWash.name)
    await wash
      .getByRole('button', { name: `More for ${SERVICES.roundWash.name}` })
      .click()
    const style = wash.getByRole('radiogroup', { name: /description style$/ })
    await expect(
      style.getByRole('radio', { name: 'Paragraph' })
    ).toHaveAttribute('aria-checked', 'true')
    await expect(wash.getByLabel(/description$/)).toHaveValue(
      'An exterior foam wash and dry.'
    )

    await style.getByRole('radio', { name: 'Points' }).click()
    // The paragraph becomes the line before the points, and the first point waits.
    await expect(wash.getByLabel(/line before the points$/)).toHaveValue(
      'An exterior foam wash and dry.'
    )
    // The wash is the first service (Wash and standard comes first).
    const point = (n: number) =>
      wash.getByRole('textbox', { name: `Service 1 point ${n}`, exact: true })
    await expect(point(1)).toBeFocused()
    await point(1).fill('Foam wash and rinse')
    await point(1).press('Enter')
    await expect(point(2)).toBeFocused()
    await point(2).fill('Vacuum cleaning')
    await point(2).press('Enter')
    await expect(point(3)).toBeFocused()
    // Backspace on an empty point removes it.
    await point(3).press('Backspace')
    await expect(point(3)).toHaveCount(0)
    await expect(point(2)).toBeFocused()

    // A pasted list splits into points by itself.
    await point(2).press('Enter')
    await paste(point(3), '• Dashboard polish\n1. Tyre polish')
    await expect(point(3)).toHaveValue('Dashboard polish')
    await expect(point(4)).toHaveValue('Tyre polish')
    await expect(
      wash.getByText('Customers see: 4 points', { exact: false })
    ).toBeVisible()

    // The arrows reorder; × removes.
    await wash.getByRole('button', { name: 'Move point 4 up' }).click()
    await expect(point(3)).toHaveValue('Tyre polish')
    await wash.getByRole('button', { name: 'Move point 1 down' }).click()
    await expect(point(1)).toHaveValue('Vacuum cleaning')
    await wash.getByRole('button', { name: 'Move point 2 up' }).click()
    await expect(point(1)).toHaveValue('Foam wash and rinse')
    // The first can't go up, nor the last down.
    await expect(
      wash.getByRole('button', { name: 'Move point 1 up' })
    ).toBeDisabled()
    await expect(
      wash.getByRole('button', { name: 'Move point 4 down' })
    ).toBeDisabled()
    await wash.getByRole('button', { name: 'Remove point 2' }).click()
    await expect(
      wash.getByText('Customers see: 3 points', { exact: false })
    ).toBeVisible()
    // Add a point at the end.
    await wash.getByRole('button', { name: 'Add a point' }).click()
    await expect(point(4)).toBeFocused()
    await point(4).fill('Glass cleaned')

    await page.getByRole('button', { name: 'Save changes' }).click()
    await expect
      .poll(async () => (await service(SERVICES.roundWash.id)).description)
      .toBe(
        'An exterior foam wash and dry.\n- Foam wash and rinse\n- Tyre polish\n- Dashboard polish\n- Glass cleaned'
      )
    // Saved on screen too, before leaving: while it saves, the editor holds
    // the page (a reload then waits on its "Leave site?").
    await expect(page.getByRole('button', { name: 'Save changes' })).toHaveCount(0)

    // Opened again, a description with "- " lines is in Points mode.
    await page.reload()
    const again = serviceRow(page, SERVICES.roundWash.name)
    await again
      .getByRole('button', { name: `More for ${SERVICES.roundWash.name}` })
      .click()
    await expect(again.getByRole('radio', { name: 'Points' })).toHaveAttribute(
      'aria-checked',
      'true'
    )
    const again2 = (n: number) =>
      again.getByRole('textbox', { name: `Service 1 point ${n}`, exact: true })
    await expect(again2(2)).toHaveValue('Tyre polish')

    // The AI keeps the points (AI_FAKE answers points when asked for them).
    await again.getByRole('button', { name: 'Rewrite with AI' }).click()
    await expect(again.getByLabel(/line before the points$/)).toHaveValue(
      'Full exterior clean by hand.'
    )
    await expect(again2(1)).toHaveValue('Foam wash and rinse')
    await expect(again2(3)).toHaveValue('Glass wiped inside and out')
    // Undo puts back what was there.
    await again
      .getByRole('button', { name: /^Undo, put back the earlier description/ })
      .click()
    await expect(again2(2)).toHaveValue('Tyre polish')

    // Paragraph shows the same text, in a box that grows with it.
    await again.getByRole('radio', { name: 'Paragraph' }).click()
    const paragraph = again.getByLabel(/description$/)
    await expect(paragraph).toHaveValue(/- Tyre polish/)
    const fits = await paragraph.evaluate(
      (box) => box.scrollHeight <= box.clientHeight + 1
    )
    expect(fits).toBe(true)
    // Undone to what is saved: nothing is left to save.
    await expect(
      page.getByRole('button', { name: 'Save changes' })
    ).toHaveCount(0)
  })

  test('a checklist mark: a tick with who and when, then the call sheet answers the rest', async ({
    page,
  }) => {
    await page.goto(`/vendors/${A.id}/edit`)
    const marks = page.getByRole('region', { name: 'Marks' })
    const call = marks.getByRole('listitem').filter({
      has: page.getByRole('button', { name: 'Edit mark New garage call' }),
    })
    await expect(call.getByText(/^1 of 3 checked/)).toBeVisible()
    await expect(
      call.getByRole('progressbar', { name: 'Checklist progress' })
    ).toHaveAttribute('aria-valuenow', '1')
    await expect(call.getByText('Yes: wash and polish')).toBeVisible()

    await call.getByRole('checkbox', { name: 'Doorstep radius' }).check()
    await expect(
      call.getByText(/^2 of 3 checked · E2E Admin, today/)
    ).toBeVisible()
    await expect
      .poll(async () =>
        (await mark(ROUND.checklistMark)).items.find(
          (i) => i.id === 'round-item-2'
        )
      )
      .toMatchObject({ done: true, answeredBy: 'E2E Admin' })

    await call.getByRole('button', { name: 'Start call' }).click()
    const sheet = page.getByRole('dialog', {
      name: `Calling ${STAFF.roundAOwner.name}`,
    })
    await expect(sheet.getByText(`${A.name} · 2 of 3`)).toBeVisible()
    await expect(
      sheet.getByRole('link', { name: /^\d{5} \d{5}$/ })
    ).toHaveAttribute('href', `tel:+91${STAFF.roundAOwner.phone}`)
    // A tick in the sheet saves too: unticked, then ticked again.
    const radius = sheet.getByRole('checkbox', { name: 'Doorstep radius' })
    await radius.uncheck()
    await expect(sheet.getByText(`${A.name} · 1 of 3`)).toBeVisible()
    await radius.check()
    await expect(sheet.getByText(`${A.name} · 2 of 3`)).toBeVisible()
    // Payout details: quick answers for how they will come.
    const payout = sheet.getByRole('group', {
      name: 'Quick answers for Payout details',
    })
    await expect(payout.getByRole('button', { name: 'UPI' })).toBeVisible()
    await payout.getByRole('button', { name: 'Will send on WhatsApp' }).click()
    await expect
      .poll(async () => (await mark(ROUND.checklistMark)).status)
      .toBe('received')
    await expect(sheet.getByText(`${A.name} · 3 of 3`)).toBeVisible()
    await sheet.getByRole('button', { name: 'Done' }).click()
    await expect(sheet).toHaveCount(0)

    // All ticked: received, so it leaves the open marks.
    await expect(
      marks.getByRole('button', { name: 'Edit mark New garage call' })
    ).toHaveCount(0)
    await expect(marks.getByText(/^\d+ received$/)).toBeVisible()
    expect(
      (await mark(ROUND.checklistMark)).items.find(
        (i) => i.id === 'round-item-3'
      )
    ).toMatchObject({
      done: true,
      answer: 'Will send on WhatsApp',
      answeredBy: 'E2E Admin',
    })
  })

  test('an old note’s "- " lines are items, saved as items on the first answer; the edit dialog builds the list', async ({
    page,
  }) => {
    await page.goto(`/vendors/${A.id}/edit`)
    const marks = page.getByRole('region', { name: 'Marks' })
    const old = marks.getByRole('listitem').filter({
      has: page.getByRole('button', { name: 'Edit mark Old call notes' }),
    })
    await expect(old.getByText(/^0 of 2 checked/)).toBeVisible()
    await expect(
      old.getByRole('checkbox', { name: 'Check if they do doorstep' })
    ).toBeVisible()
    await expect(old.getByText('Owner busy till 5')).toBeVisible()

    // A typed answer, saved from the call sheet.
    await old.getByRole('button', { name: 'Start call' }).click()
    const sheet = page.getByRole('dialog', {
      name: `Calling ${STAFF.roundAOwner.name}`,
    })
    await sheet
      .getByLabel('Answer for Ask about pickup', { exact: true })
      .fill('Not yet, maybe in Dec')
    await expect(
      sheet.getByRole('button', {
        name: 'Save the answer for Check if they do doorstep',
      })
    ).toBeDisabled()
    await sheet
      .getByRole('button', { name: 'Save the answer for Ask about pickup' })
      .click()
    // Saved as items now, and the note keeps only its own line.
    await expect
      .poll(async () => (await mark(ROUND.oldNoteMark)).note)
      .toBe('Owner busy till 5')
    const saved = await mark(ROUND.oldNoteMark)
    expect(saved.items.map((i) => [i.id, i.text, i.done, i.answer])).toEqual([
      ['note-1', 'Check if they do doorstep', false, null],
      ['note-2', 'Ask about pickup', true, 'Not yet, maybe in Dec'],
    ])
    // One answered moves it to Asked ("In progress").
    expect(saved.status).toBe('asked')
    await sheet.getByRole('button', { name: 'Done' }).click()
    await expect(sheet).toHaveCount(0)
    await expect(old.getByText('In progress')).toBeVisible()

    // The edit dialog: a ready-made list, Enter adding the next item, a
    // pasted list, and an item removed.
    await old.getByRole('button', { name: 'Edit mark Old call notes' }).click()
    const dialog = page.getByRole('dialog', { name: 'Edit mark' })
    await expect(dialog.getByLabel('Item 1', { exact: true })).toHaveValue(
      'Check if they do doorstep'
    )
    await expect(
      dialog.getByText('Status follows the ticks', { exact: false })
    ).toBeVisible()
    await dialog.getByRole('button', { name: 'Doorstep checks' }).click()
    await expect(dialog.getByLabel('Item 5', { exact: true })).toHaveValue(
      'Pickup & drop radius?'
    )
    const add = dialog.getByLabel('Add an item', { exact: true })
    await add.fill('Ask for the logo')
    await add.press('Enter')
    await expect(dialog.getByLabel('Item 6', { exact: true })).toHaveValue(
      'Ask for the logo'
    )
    await expect(add).toHaveValue('')
    await paste(add, '- Bank details\n- Opening hours')
    await expect(dialog.getByLabel('Item 8', { exact: true })).toHaveValue(
      'Opening hours'
    )
    await dialog.getByRole('button', { name: 'Remove item 1' }).click()
    await expect(dialog.getByText('7 items')).toBeVisible()
    await dialog.getByRole('button', { name: 'Save', exact: true }).click()
    await expect(dialog).toHaveCount(0)

    await expect
      .poll(async () =>
        (await mark(ROUND.oldNoteMark)).items.map((i) => i.text)
      )
      .toEqual([
        'Ask about pickup',
        'At-garage services?',
        'Doorstep radius?',
        'Pickup & drop radius?',
        'Ask for the logo',
        'Bank details',
        'Opening hours',
      ])
    // The answered item kept who answered it.
    expect((await mark(ROUND.oldNoteMark)).items[0]).toMatchObject({
      id: 'note-2',
      answeredBy: 'E2E Admin',
    })
  })

  test('a new mark starts from a ready-made list; a call nobody picked up marks it Asked', async ({
    page,
  }) => {
    await page.goto(`/vendors/${A.id}/edit`)
    const marks = page.getByRole('region', { name: 'Marks' })
    await marks.getByRole('button', { name: 'Add mark' }).click()
    const dialog = page.getByRole('dialog', { name: 'Add a mark' })
    await dialog
      .getByLabel('Or write your own', { exact: true })
      .fill('Payout call')
    await dialog.getByRole('button', { name: 'Payout setup' }).click()
    await expect(dialog.getByLabel('Item 3', { exact: true })).toHaveValue(
      'Payout details'
    )
    await dialog.getByRole('button', { name: 'Add mark' }).click()
    await expect(dialog).toHaveCount(0)

    const made = marks.getByRole('listitem').filter({
      has: page.getByRole('button', { name: 'Edit mark Payout call' }),
    })
    await expect(made.getByText(/^0 of 3 checked/)).toBeVisible()
    const madeStatus = async () =>
      (
        await sql`select status from vendor_onboarding_marks where vendor_id = ${A.id} and label = 'Payout call'`
      )[0]?.status
    expect(await madeStatus()).toBe('to_ask')

    // Nobody picked up: Done with nothing answered marks it Asked, so the
    // call is on record.
    await made.getByRole('button', { name: 'Start call' }).click()
    const sheet = page.getByRole('dialog', {
      name: `Calling ${STAFF.roundAOwner.name}`,
    })
    await expect(
      sheet.getByText('Didn’t pick up? Done marks it Asked', { exact: false })
    ).toBeVisible()
    await sheet.getByRole('button', { name: 'Done' }).click()
    await expect(sheet).toHaveCount(0)
    await expect.poll(madeStatus).toBe('asked')

    await sql`delete from vendor_onboarding_marks where vendor_id = ${A.id} and label = 'Payout call'`
  })
})
