/**
 * The garage's Bookings calendar, Month and Day (owner, 10 Nov 2026), at
 * CALENDAR.garage (fixtures in the reserved 6200–6249 range, placed by
 * India's calendar from the day of the seed: see CALENDAR).
 *
 * Read-only: it looks and opens, and changes nothing. The four lists beside
 * it are today.spec.ts's.
 */
import type { Page } from '@playwright/test'
import { test, expect, asRole } from '../../support/fixtures'
import { setActiveVendor } from '../../support/auth'
import { CALENDAR } from '../../support/seed-ids'

test.use({ storageState: asRole('vendor-calendar') })

test.beforeEach(async ({ context }) => {
  await setActiveVendor(context, CALENDAR.garage.id)
})

const DAY_MS = 24 * 60 * 60 * 1000
const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
]
const WEEKDAYS = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
]

/** An IST date some days from now, as the seed builds it (istDate). */
const istKey = (offsetDays: number) =>
  new Date(Date.now() + offsetDays * DAY_MS).toLocaleDateString('en-CA', {
    timeZone: 'Asia/Kolkata',
  })
/** "12 November", as a day button starts. */
const dateWords = (key: string) =>
  `${Number(key.slice(8, 10))} ${MONTHS[Number(key.slice(5, 7)) - 1]}`
/** "Thursday 12 November", as the week strip names a day. */
const longWords = (key: string) =>
  `${WEEKDAYS[new Date(`${key}T00:00:00Z`).getUTCDay()]} ${dateWords(key)}`
const monthTitle = (key: string) =>
  `${MONTHS[Number(key.slice(5, 7)) - 1]} ${key.slice(0, 4)}`

const name = CALENDAR.customer.name

/** The calendar's own Month | Day switch, apart from the Bookings switch. */
const viewSwitch = (page: Page) =>
  page.getByRole('radiogroup', { name: 'Calendar view', exact: true })

/** Pages the Month view to the month a day is in. */
async function showMonthOf(page: Page, key: string) {
  const title = page.getByRole('heading', { name: /^[A-Z][a-z]+ \d{4}$/ })
  const want = key.slice(0, 7)
  for (let i = 0; i < 3; i++) {
    const text = (await title.textContent()) ?? ''
    const [month, year] = text.split(' ')
    const shown = `${year}-${String(MONTHS.indexOf(month) + 1).padStart(2, '0')}`
    if (shown === want) break
    await page
      .getByRole('button', {
        name: shown < want ? 'Next month' : 'Previous month',
      })
      .click()
  }
  await expect(title).toHaveText(monthTitle(key))
}

test.describe('garage bookings calendar @p0', () => {
  test('Month: dots on the right days, the closed day, and a day’s jobs', async ({
    page,
  }) => {
    await page.goto('/bookings')
    await page.getByRole('radio', { name: 'Calendar', exact: true }).click()
    await expect(page).toHaveURL(/\/bookings\?tab=calendar$/)
    await expect(
      page.getByRole('radio', { name: 'Calendar', exact: true })
    ).toHaveAttribute('aria-checked', 'true')
    // Month first on a device that has never chosen.
    await expect(
      viewSwitch(page).getByRole('radio', { name: 'Month', exact: true })
    ).toHaveAttribute('aria-checked', 'true')
    // The booking waiting for an answer stays pinned on the calendar too.
    await expect(
      page.getByRole('button', { name: /^1 booking to answer/ })
    ).toBeVisible()

    const today = istKey(0)
    const tomorrow = istKey(1)
    const timeOff = istKey(CALENDAR.closure.inDays)
    const nextWeek = istKey(7)

    // Today: done, accepted at the garage, and the doorstep job. Picked to begin with.
    await showMonthOf(page, today)
    const todayCell = page.getByRole('button', {
      name: `${dateWords(today)}, today, 3 jobs`,
      exact: true,
    })
    await expect(todayCell).toHaveAttribute('aria-pressed', 'true')
    await expect(page.locator(`#job-${CALENDAR.todayAccepted}`)).toBeVisible()
    await expect(page.locator(`#job-${CALENDAR.todayRoad}`)).toBeVisible()
    await expect(page.locator(`#job-${CALENDAR.todayDone}`)).toBeVisible()

    // Tomorrow: one to answer; the cancelled booking is never on the calendar.
    await showMonthOf(page, tomorrow)
    await page
      .getByRole('button', {
        name: `${dateWords(tomorrow)}, 1 job, 1 to answer`,
        exact: true,
      })
      .click()
    // In the calendar: the Bookings switch above it has its own "1 job"
    // (Later's count, next week's job) as a quiet second line.
    await expect(
      page
        .getByRole('region', { name: 'Calendar' })
        .getByText('1 job', { exact: true })
    ).toBeVisible()
    await expect(page.locator(`#job-${CALENDAR.tomorrowAnswer}`)).toBeVisible()
    await expect(
      page.locator(`#job-${CALENDAR.tomorrowCancelled}`)
    ).toHaveCount(0)

    // Time off: hatched, named closed, and its card says why and where to change it.
    await showMonthOf(page, timeOff)
    await page
      .getByRole('button', {
        name: `${dateWords(timeOff)}, closed`,
        exact: true,
      })
      .click()
    await expect(
      page.getByText(`Time off · ${CALENDAR.closure.reason}`)
    ).toBeVisible()
    await expect(
      page.getByText(
        'Customers can’t book this day. Change it in Settings → Time off.'
      )
    ).toBeVisible()

    // Next week's accepted job, a month on if the week crosses into one.
    await showMonthOf(page, nextWeek)
    await page
      .getByRole('button', {
        name: `${dateWords(nextWeek)}, 1 job`,
        exact: true,
      })
      .click()
    await expect(page.locator(`#job-${CALENDAR.nextWeek}`)).toBeVisible()

    // A day's job opens its page, as a list row does.
    await page.locator(`#job-${CALENDAR.nextWeek}`).getByRole('link').click()
    await expect(page).toHaveURL(new RegExp(`/bookings/${CALENDAR.nextWeek}$`))
    await expect(page.getByRole('heading', { level: 1, name })).toBeVisible()
  })

  test('Day: the timeline, the On the road lane, and a block opens its job', async ({
    page,
  }) => {
    await page.goto('/bookings?tab=calendar')
    // Scoped and exact: getByRole matches names as substrings, and the
    // Bookings switch's "Today" contains "day".
    await viewSwitch(page)
      .getByRole('radio', { name: 'Day', exact: true })
      .click()

    const today = istKey(0)
    await expect(page.getByRole('heading', { name: /^Today · / })).toBeVisible()
    await expect(
      page.getByText('3 jobs · open 9:00 am – 6:30 pm', { exact: true })
    ).toBeVisible()
    await expect(
      page.getByRole('button', {
        name: `${longWords(today)}, today, 3 jobs`,
        exact: true,
      })
    ).toHaveAttribute('aria-pressed', 'true')

    // Lanes say "At the garage" with the garage's bays, never a bay number.
    await expect(page.getByText(/^At the garage · 2 bays$/)).toBeVisible()
    await expect(page.getByText('Bay 1')).toHaveCount(0)
    const road = page.getByText('On the road', { exact: true })
    await expect(road).toBeVisible()
    await expect(
      page.getByText('Closes 6:30 pm', { exact: true })
    ).toBeVisible()

    const accepted = page.getByRole('link', {
      name: `${name}, 3:00 pm to 4:00 pm, Accepted`,
      exact: true,
    })
    const doorstep = page.getByRole('link', {
      name: `${name}, 12:00 pm to 1:00 pm, Accepted`,
      exact: true,
    })
    await expect(accepted).toBeVisible()
    await expect(doorstep).toBeVisible()
    await expect(
      page.getByRole('link', {
        name: `${name}, 9:00 am to 10:00 am, Done`,
        exact: true,
      })
    ).toBeVisible()

    // The doorstep job sits under "On the road"; the at-garage one to its left.
    const roadBox = await road.boundingBox()
    const doorstepBox = await doorstep.boundingBox()
    const acceptedBox = await accepted.boundingBox()
    expect(roadBox && doorstepBox && acceptedBox).toBeTruthy()
    expect(doorstepBox!.x + doorstepBox!.width).toBeGreaterThan(roadBox!.x)
    expect(acceptedBox!.x + acceptedBox!.width).toBeLessThanOrEqual(
      doorstepBox!.x
    )

    // This device remembers Day.
    await page.reload()
    await expect(
      viewSwitch(page).getByRole('radio', { name: 'Day', exact: true })
    ).toHaveAttribute('aria-checked', 'true')

    await page
      .getByRole('link', {
        name: `${name}, 3:00 pm to 4:00 pm, Accepted`,
        exact: true,
      })
      .click()
    await expect(page).toHaveURL(
      new RegExp(`/bookings/${CALENDAR.todayAccepted}$`)
    )
    await expect(page.getByRole('heading', { level: 1, name })).toBeVisible()
  })
})
