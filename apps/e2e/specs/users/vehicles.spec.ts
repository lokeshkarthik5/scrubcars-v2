/**
 * Removing a car from the garage.
 *
 * The regression this file exists for: `bookings.vehicle_id` and
 * `booking_intents.vehicle_id` reference `user_vehicles` ON DELETE RESTRICT,
 * so deleting a car that had ever been booked raised Postgres 23503, which
 * nothing caught and which surfaced to the customer as "Internal server
 * error". Nothing in the suite deleted a vehicle, so the suite stayed green.
 *
 * The constraint is correct — a booking must never lose the car it was for —
 * so such a car is archived instead of deleted, and one that history does not
 * name is still deleted outright. Both halves are asserted here, because
 * archiving everything would leave a tombstone for every typo.
 */
import { test, expect, asRole } from '../../support/fixtures'
import { sql } from '../../support/db'
import { BOOKINGS, CUSTOMERS, VEHICLES } from '../../support/seed-ids'

test.use({ storageState: asRole('customer-vehicles') })

const vehicleRow = (id: string) =>
  sql<{ id: string; is_default: boolean; archived_at: Date | null }[]>`
    select id, is_default, archived_at from user_vehicles where id = ${id}
  `

test.describe('garage', () => {
  test('a car that a booking names can be removed @p0', async ({ page }) => {
    await page.goto('/profile')

    // The default car, and the one BOOKINGS.vehicleArchive was written
    // against. Before the fix this click returned a 500 and the card stayed.
    await expect(page.getByText('Skoda Slavia')).toBeVisible()
    await page.getByRole('button', { name: 'Remove Skoda Slavia' }).click()

    await expect(page.getByText('Skoda Slavia')).toBeHidden()
    // The toast is the customer-facing proof it succeeded rather than silently
    // failing — the old behaviour showed "Failed to remove vehicle".
    await expect(page.getByText('Vehicle removed')).toBeVisible()

    // Archived, not deleted: the row is still there for the booking.
    const [row] = await vehicleRow(VEHICLES.booked)
    expect(row).toBeDefined()
    expect(row.archived_at).not.toBeNull()
    // An archived car must not stay the default the pickers preselect.
    expect(row.is_default).toBe(false)

    const [booking] = await sql<{ vehicle_id: string }[]>`
      select vehicle_id from bookings where id = ${BOOKINGS.vehicleArchive}
    `
    expect(booking.vehicle_id).toBe(VEHICLES.booked)
  })

  test('the past booking survives its car being removed', async ({ page }) => {
    // Archived by the test above. History resolves the vehicle by primary key
    // and deliberately does not filter on `archived_at`, so removing a car
    // from the garage must not take the booking down with it.
    //
    // Asserted through the join rather than on screen: the booking detail page
    // renders its service lines, not the car, so the FK still resolving is the
    // only thing there is to check — and it is the thing that would break.
    const [joined] = await sql<{ make: string; model: string }[]>`
      select v.make, v.model
        from bookings b join user_vehicles v on v.id = b.vehicle_id
       where b.id = ${BOOKINGS.vehicleArchive}
    `
    expect(joined).toEqual({ make: 'Skoda', model: 'Slavia' })

    await page.goto(`/bookings/${BOOKINGS.vehicleArchive}`)
    await expect(page.getByText(/Express Wash/)).toBeVisible()
  })

  test('an archived car is no longer offered at checkout', async ({ page }) => {
    await page.goto('/profile')
    // Only the spare is left in the garage.
    await expect(page.getByText('Renault Kwid')).toBeVisible()
    await expect(page.getByText('Skoda Slavia')).toBeHidden()

    const listed = await sql<{ make: string }[]>`
      select make from user_vehicles
       where user_id = ${CUSTOMERS.vehicles.id} and archived_at is null
    `
    expect(listed.map((r) => r.make)).toEqual(['Renault'])
  })

  test('a car on no booking is deleted outright, not archived', async ({ page }) => {
    await page.goto('/profile')

    await page.getByRole('button', { name: 'Remove Renault Kwid' }).click()
    await expect(page.getByText('Renault Kwid')).toBeHidden()

    // The distinction that keeps the table from filling with tombstones: this
    // car was on nothing, so the row goes.
    expect(await vehicleRow(VEHICLES.spare)).toHaveLength(0)
  })
})
