/**
 * A booking keeps the category its services had when it was booked
 * (booking_items.category, 0080), through the real writes and reads against
 * a real Postgres: a booking made while a service was in Others (8%) is
 * still charged 8% by the payouts and Statistics after admin moves the
 * service to Repairs (5%), and so is the booking a reschedule copies from
 * it. A booking made after the move is charged 5%. A line from before 0080's
 * code (no category) reads the service's category now.
 *
 * Needs a throwaway, fully migrated local database, so it runs on its own
 * and only when asked (skipped in the ordinary suite):
 *
 *   BOOKED_CATEGORY_DB_URL='postgresql://detlio:detlio@localhost:55432/<db>?sslmode=disable' \
 *     bun test src/modules/payouts/booked-category.db.test.ts
 *
 * Never point it at a real database: it refuses any host but localhost.
 */
import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { randomUUID } from 'node:crypto'

const url = process.env.BOOKED_CATEGORY_DB_URL
const local = url !== undefined && /@(localhost|127\.0\.0\.1)(:\d+)?\//.test(url)
if (local) process.env.DATABASE_URL = url

describe.skipIf(!local)('a booking keeps the category it was booked at (0080)', () => {
  const ids = {
    user: randomUUID(),
    vendor: randomUUID(),
    vehicle: randomUUID(),
    clutch: randomUUID(),
    wash: randomUUID(),
  }
  // The day after tomorrow, inside the hours seeded below; no two overlap.
  const day = new Date(Date.now() + 2 * 86_400_000).toISOString().slice(0, 10)
  const at = (time: string) => new Date(`${day}T${time}:00+05:30`)

  let mod: {
    db: typeof import('../../db/index.js').db
    sql: typeof import('drizzle-orm').sql
    bookingsRepository: typeof import('../bookings/bookings.repository.js').bookingsRepository
    moveParams: typeof import('../bookings/bookings.service.js').moveParams
    serviceCategoriesRepository: typeof import('../service-categories/service-categories.repository.js').serviceCategoriesRepository
    payoutsReads: typeof import('./payouts.repository.js').payoutsReads
    statsReads: typeof import('../stats/stats.repository.js').statsReads
    bookingCommission: typeof import('../../lib/commission.js').bookingCommission
  }

  beforeAll(async () => {
    const { db } = await import('../../db/index.js')
    const { sql } = await import('drizzle-orm')
    mod = {
      db,
      sql,
      bookingsRepository: (await import('../bookings/bookings.repository.js')).bookingsRepository,
      moveParams: (await import('../bookings/bookings.service.js')).moveParams,
      serviceCategoriesRepository: (await import('../service-categories/service-categories.repository.js'))
        .serviceCategoriesRepository,
      payoutsReads: (await import('./payouts.repository.js')).payoutsReads,
      statsReads: (await import('../stats/stats.repository.js')).statsReads,
      bookingCommission: (await import('../../lib/commission.js')).bookingCommission,
    }
    const phone = `+9199${String(Date.now()).slice(-8)}`
    await db.execute(sql`
      insert into users (id, name, phone) values (${ids.user}, 'Snapshot customer', ${phone})`)
    await db.execute(sql`
      insert into vendors (id, owner_id, business_name, phone, address, city)
      values (${ids.vendor}, ${ids.user}, 'Snapshot Motors', ${phone}, '1 Test Road', 'Chennai')`)
    for (let weekday = 0; weekday < 7; weekday++) {
      await db.execute(sql`
        insert into vendor_working_hours (vendor_id, day_of_week, open_time, close_time)
        values (${ids.vendor}, ${weekday}, '08:00', '20:00')`)
    }
    await db.execute(sql`
      insert into user_vehicles (id, user_id, make, model, vehicle_type)
      values (${ids.vehicle}, ${ids.user}, 'Maruti', 'Swift', 'hatchback')`)
    await db.execute(sql`
      insert into services (id, vendor_id, name, category, price, duration_mins)
      values (${ids.clutch}, ${ids.vendor}, 'Clutch overhaul', 'others', 1000, 60),
             (${ids.wash}, ${ids.vendor}, 'Foam wash', 'car_wash', 500, 30)`)
  })

  afterAll(async () => {
    if (!mod) return
    const { db, sql } = mod
    await db.execute(sql`delete from bookings where vendor_id = ${ids.vendor}`)
    await db.execute(sql`delete from services where vendor_id = ${ids.vendor}`)
    await db.execute(sql`delete from vendors where id = ${ids.vendor}`)
    await db.execute(sql`delete from users where id = ${ids.user}`)
  })

  async function book(scheduledAt: Date) {
    const result = await mod.bookingsRepository.createBookingWithPayment({
      userId: ids.user,
      vendorId: ids.vendor,
      items: [
        { serviceId: ids.clutch, name: 'Clutch overhaul', amount: '1000.00', durationMins: 60 },
        { serviceId: ids.wash, name: 'Foam wash', amount: '500.00', durationMins: 30 },
      ],
      vehicleId: ids.vehicle,
      bookingType: 'dropin',
      scheduledAt,
      durationMins: 90,
      subtotalAmount: '1500.00',
      amount: '1500.00',
      paymentMethod: 'online',
    })
    expect(result.booking).not.toBeNull()
    return result.booking!.id
  }

  /** Finishes a booking, paid, so the garage earns on it. */
  async function finish(bookingId: string) {
    const { db, sql } = mod
    await db.execute(sql`update payments set status = 'paid', paid_at = now() where booking_id = ${bookingId}`)
    await db.execute(sql`update bookings set status = 'completed', completed_at = now() where id = ${bookingId}`)
  }

  /** Commission on one chain as the payouts read it (past the free 25). */
  async function payoutCommission(rootId: string) {
    const all = await mod.db.transaction((tx) => mod.payoutsReads(tx).earningItems(ids.vendor))
    const items = all.filter((row) => row.rootId === rootId)
    expect(items.length).toBe(2)
    return mod.bookingCommission({
      status: 'completed',
      noShow: null,
      paymentStatus: 'paid',
      paymentRefunded: null,
      amount: '1500.00',
      subtotalAmount: '1500.00',
      discountFundedBy: null,
      items,
      billsPaid: null,
    })
  }

  async function statsCategories(rootId: string) {
    const rows = await mod.db.transaction((tx) =>
      mod.statsReads(tx).chainItems(new Date(Date.now() - 86_400_000), new Date(Date.now() + 86_400_000), ids.vendor)
    )
    return rows
      .filter((row) => row.rootId === rootId)
      .map((row) => row.category)
      .sort()
  }

  test('moving a service never re-prices a booking made before, nor its reschedule', async () => {
    const before = await book(at('10:00'))
    const stored = await mod.db.execute<{ category: string }>(
      mod.sql`select category::text as category from booking_items where booking_id = ${before} order by sort_order`
    )
    expect(Array.from(stored).map((row) => row.category)).toEqual(['others', 'car_wash'])

    // 8% on the ₹1,000 clutch job (Others) and 8% on the ₹500 wash.
    await finish(before)
    expect(await payoutCommission(before)).toBe(120)

    const moved = await mod.serviceCategoriesRepository.setCategory(ids.clutch, 'others', 'repairs')
    expect(moved?.category).toBe('repairs')

    // Still 8% on the clutch job: it was booked in Others.
    expect(await payoutCommission(before)).toBe(120)
    expect(await statsCategories(before)).toEqual(['car_wash', 'others'])
  })

  test('a reschedule carries the category its booking was made at', async () => {
    await mod.serviceCategoriesRepository.setCategory(ids.clutch, 'repairs', 'others')
    const source = await book(at('12:00'))
    await mod.serviceCategoriesRepository.setCategory(ids.clutch, 'others', 'repairs')

    const booking = await mod.bookingsRepository.findBookingById(source)
    const params = mod.moveParams(booking!, {
      userId: ids.user,
      newScheduledAt: at('16:00'),
      durationMins: 90,
      expectedStatus: 'pending',
      reason: null,
    })
    expect(params.items.map((item) => item.category)).toEqual(['others', 'car_wash'])
    const result = await mod.bookingsRepository.rescheduleBookingWithPayment(params)
    expect(result.booking).not.toBeNull()
    const copy = await mod.db.execute<{ id: string; category: string }>(mod.sql`
      select b.id, bi.category::text as category
        from bookings b join booking_items bi on bi.booking_id = b.id
       where b.rescheduled_from_id = ${source}
       order by bi.sort_order`)
    const rows = Array.from(copy)
    expect(rows.map((row) => row.category)).toEqual(['others', 'car_wash'])

    await finish(rows[0]!.id)
    expect(await payoutCommission(source)).toBe(120)
  })

  test('a booking made after the move is charged the new category', async () => {
    const after = await book(at('18:00'))
    await finish(after)
    // 5% on the clutch job (Repairs now) and 8% on the wash.
    expect(await payoutCommission(after)).toBe(90)
    expect(await statsCategories(after)).toEqual(['car_wash', 'repairs'])
  })

  test('a line from before 0080 (no category) reads the service’s category now', async () => {
    const legacy = await book(at('14:00'))
    await mod.db.execute(mod.sql`update booking_items set category = null where booking_id = ${legacy}`)
    await finish(legacy)
    expect(await payoutCommission(legacy)).toBe(90)
  })
})
