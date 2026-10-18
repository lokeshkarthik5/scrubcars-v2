/**
 * A car's history and its coating follow-up (0046).
 *
 * CUSTOMERS.carHistory's Kia Seltos has two completed, paid jobs at
 * VENDORS.carHistory (a ceramic coating ~87 days ago, a wash ~40 days ago),
 * one cancelled wash, and the coating's maintenance-wash reminder due in 3
 * days. Fixture ids 2600–2699 only (seedCarHistoryRows).
 */
import { test, expect, asRole } from '../../support/fixtures'
import { BOOKINGS, CUSTOMERS } from '../../support/seed-ids'

test.use({ storageState: asRole('customer-carHistory') })

const CAR = CUSTOMERS.carHistory.vehicleId

test.describe('car history', () => {
  test('a seeded car with two completed bookings shows both on its history page @p0', async ({ page }) => {
    await page.goto(`/profile/cars/${CAR}`)

    const jobs = page.getByRole('list', { name: /Jobs on your Kia Seltos/ })
    const rows = jobs.getByRole('listitem')
    await expect(rows).toHaveCount(2)
    // Newest first: the wash, then the coating.
    await expect(rows.nth(0)).toContainText('History Foam Wash')
    await expect(rows.nth(0)).toContainText('₹450')
    await expect(rows.nth(1)).toContainText('History Ceramic Coating')
    await expect(rows.nth(1)).toContainText('₹6,000')

    // Each links to its booking and its receipt.
    await expect(rows.nth(1).getByRole('link', { name: /History Ceramic Coating at History Test Garage/ })).toHaveAttribute(
      'href',
      `/bookings/${BOOKINGS.carHistoryCoating}`
    )
    await expect(rows.nth(1).getByRole('link', { name: /^Receipt:/ })).toHaveAttribute(
      'href',
      `/bookings/${BOOKINGS.carHistoryCoating}/receipt`
    )

    // The cancelled booking is not history; the page says where it is.
    await expect(page.getByText(/1 cancelled booking for this car/)).toBeVisible()
    await expect(page.getByText(/₹6,450 on 2 washes since/)).toBeVisible()

    // The coating's follow-up, three days out.
    const reminder = page.getByRole('region', { name: 'Reminder: Maintenance wash for your coating' })
    await expect(reminder).toContainText('Due in 3 days')
    await expect(reminder).toContainText('3 months since your coating at History Test Garage')

    // Filter by service.
    await page.getByRole('button', { name: 'Coating', exact: true }).click()
    await expect(rows).toHaveCount(1)
    await expect(rows.nth(0)).toContainText('History Ceramic Coating')
  })

  test('Profile opens the car’s history', async ({ page }) => {
    await page.goto('/profile')
    await page.getByRole('link', { name: 'Kia Seltos: history' }).click()
    await expect(page).toHaveURL(new RegExp(`/profile/cars/${CAR}$`))
    await expect(page.getByRole('list', { name: /Jobs on your Kia Seltos/ })).toBeVisible()
  })

  test('someone else’s car is not shown', async ({ page }) => {
    // CUSTOMERS.notAccepted's car, not this customer's.
    await page.goto(`/profile/cars/${CUSTOMERS.notAccepted.vehicleId}`)
    await expect(page.getByText("This car isn't in your garage")).toBeVisible()
  })
})
