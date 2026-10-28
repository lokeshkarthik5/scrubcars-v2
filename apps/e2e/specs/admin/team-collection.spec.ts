/**
 * Send to team (0059): from the Garages page, the ticked garages go to a
 * teammate as one collection list; the Garages "With team" view shows who
 * has them; and ticking a thing on the list moves its progress on.
 *
 * The fixtures are W1's (ids 4150–4199): VENDORS.marksA (missing photos,
 * logo, radius and payout; onboarded by nobody), VENDORS.marksB (missing
 * photos and bays; onboarded by "E2E Admin", a login, so it is suggested to
 * them) and ADMIN_LOGINS.collector ("E2E Collector", with a phone). The
 * panel runs as ADMIN_LOGINS.e2e, whose own lists ("Mine") never hold this
 * one, so the list is ticked from Today's All lists view.
 *
 * Telegram is turned off in the sheet (and only posts in production). The
 * list is closed at the end, so a retry or another spec never finds it open.
 */
import { test, expect, asRole } from '../../support/fixtures'
import { API } from '../../support/auth'
import { ADMIN_LOGINS, VENDORS } from '../../support/seed-ids'

const MARKS_A = VENDORS.marksA
const MARKS_B = VENDORS.marksB
const COLLECTOR = ADMIN_LOGINS.collector

const LISTS = `${API}/api/v1/admin/collection-lists`

/** India's date today, as the due date field takes it. */
const istToday = () =>
  new Date(Date.now() + 5.5 * 60 * 60 * 1000).toISOString().slice(0, 10)

interface ListItem {
  id: string
  vendorId: string
  kind: string
  label: string
  status: 'to_collect' | 'collected'
  cleared: boolean
}
interface List {
  id: string
  assigneeLoginId: string | null
  assigneeName: string
  dueOn: string | null
  telegramSentAt: string | null
  open: boolean
  progress: { done: number; total: number }
  garages: Array<{ id: string }>
  items: ListItem[]
}

test.use({ storageState: asRole('admin') })

test.describe('Send to team @p0', () => {
  test('two garages go to a teammate, show With team, and a tick moves the list on', async ({
    page,
  }) => {
    let listId: string | null = null
    try {
      // ── Garages: tick both, Send to team ──────────────────────────────────
      await page.goto('/vendors?show=all')
      for (const garage of [MARKS_A, MARKS_B]) {
        const row = page.getByRole('row', { name: garage.name, exact: true })
        await row
          .getByRole('checkbox', { name: `Select ${garage.name}` })
          .check()
      }
      await expect(page.getByText('2 selected', { exact: true })).toBeVisible()
      await page.getByRole('button', { name: 'Send to team' }).click()

      const sheet = page.getByRole('dialog', { name: 'Send to team' })
      await expect(sheet).toBeVisible()
      // marksB's onboarder is a login and marksA has none: two groups.
      await expect(
        sheet.getByRole('region', { name: /^Who collects for/ })
      ).toHaveCount(2)
      await sheet.getByRole('switch', { name: 'One person for all' }).click()
      await expect(
        sheet.getByRole('region', { name: 'Who collects', exact: true })
      ).toBeVisible()

      await sheet.getByRole('radio', { name: COLLECTOR.name }).check()
      await sheet.getByLabel('Due (optional)').fill(istToday())
      await sheet.getByLabel('Note (optional)').fill('E2E: both in one go')

      // Their Today inbox is always on; WhatsApp is offered (they have a
      // phone) and off until ticked; Telegram is turned off here.
      await expect(
        sheet.getByRole('switch', { name: `${COLLECTOR.name}’s Today inbox` })
      ).toBeChecked()
      await expect(
        sheet.getByRole('checkbox', {
          name: `Also send on WhatsApp to ${COLLECTOR.name}`,
        })
      ).not.toBeChecked()
      const telegram = sheet.getByRole('switch', {
        name: 'Telegram group “Detlio”',
      })
      await expect(telegram).toBeChecked()
      await telegram.click()
      await expect(telegram).not.toBeChecked()

      // The preview: each garage with the things it misses, ticked.
      const previewA = sheet.getByRole('article', { name: MARKS_A.name })
      await expect(
        previewA.getByRole('checkbox', { name: 'Photos' })
      ).toBeChecked()
      await expect(
        previewA.getByRole('checkbox', { name: 'Payout details' })
      ).toBeChecked()
      await expect(
        sheet
          .getByRole('article', { name: MARKS_B.name })
          .getByRole('checkbox', { name: 'Bays' })
      ).toBeChecked()

      const created = page.waitForResponse(
        (res) =>
          res.url().startsWith(LISTS) && res.request().method() === 'POST'
      )
      await sheet
        .getByRole('button', { name: `Send to ${COLLECTOR.name}` })
        .click()
      const response = await created
      expect(response.ok()).toBe(true)
      const lists: List[] = (await response.json()).data.lists
      expect(lists).toHaveLength(1)
      const list = lists[0]!
      listId = list.id
      expect(list).toMatchObject({
        assigneeLoginId: COLLECTOR.id,
        assigneeName: COLLECTOR.name,
        dueOn: istToday(),
        telegramSentAt: null,
        open: true,
      })
      expect(list.garages.map((g) => g.id).sort()).toEqual(
        [MARKS_A.id, MARKS_B.id].sort()
      )
      await expect(sheet).toBeHidden()

      // ── Garages, With team ────────────────────────────────────────────────
      await page.goto('/vendors?show=all&team=with')
      await expect(
        page.getByRole('row', { name: MARKS_A.name, exact: true })
      ).toContainText(`With ${COLLECTOR.name}`)
      await expect(
        page.getByRole('row', { name: MARKS_B.name, exact: true })
      ).toContainText(`With ${COLLECTOR.name}`)

      // ── The list, at the API ──────────────────────────────────────────────
      const listed = await page.request.get(`${LISTS}?scope=all&open=true`)
      expect(listed.ok()).toBe(true)
      const fresh = ((await listed.json()).data.lists as List[]).find(
        (l) => l.id === list.id
      )
      expect(fresh).toBeTruthy()
      const photosA = fresh!.items.find(
        (i) => i.vendorId === MARKS_A.id && i.kind === 'photos'
      )
      expect(photosA).toMatchObject({ status: 'to_collect', cleared: false })
      const { done, total } = fresh!.progress

      // ── Today: the list opens, a tick moves it on ─────────────────────────
      await page.goto(`/today?list=${list.id}`)
      // Not E2E Admin's own list, so it opens under All lists.
      await expect(
        page
          .getByRole('group', { name: 'Today view' })
          .getByRole('button', { name: /^All lists/ })
      ).toHaveAttribute('aria-pressed', 'true')
      const card = page.locator(`[id="collection-list-${list.id}"]`)
      await expect(
        card.getByRole('heading', {
          name: `${COLLECTOR.name}’s collection list`,
        })
      ).toBeVisible()
      await expect(card).toContainText(`${done} of ${total} collected`)

      const garageA = card.getByRole('article', { name: MARKS_A.name })
      // A click, then wait: the tick is optimistic and re-renders the row,
      // which .check() can read too early and call a failure.
      const photosBox = garageA.getByRole('checkbox', { name: 'Photos' })
      await photosBox.click()
      await expect(photosBox).toBeChecked()
      await expect(card).toContainText(`${done + 1} of ${total} collected`)
      await expect(
        garageA.getByRole('link', { name: `Save Photos to ${MARKS_A.name}` })
      ).toHaveAttribute('href', `/vendors/${MARKS_A.id}/edit?tab=details`)

      // The server kept the tick.
      await expect
        .poll(async () => {
          const res = await page.request.get(`${LISTS}?scope=all&open=true`)
          const again = ((await res.json()).data.lists as List[]).find(
            (l) => l.id === list.id
          )
          return {
            status: again?.items.find((i) => i.id === photosA!.id)?.status,
            done: again?.progress.done,
          }
        })
        .toEqual({ status: 'collected', done: done + 1 })
    } finally {
      if (listId) {
        await page.request.post(`${LISTS}/${listId}/close`, { data: {} })
      }
    }
  })
})
