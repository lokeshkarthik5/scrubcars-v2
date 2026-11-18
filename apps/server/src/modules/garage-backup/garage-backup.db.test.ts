/**
 * Back up all garages against a real Postgres: every sheet's SQL runs, the
 * counts match what the pages hold, keyset pages never skip or repeat a row,
 * each download writes its audit row (and "Last backup" reads it), and the
 * phones and bank numbers of a seeded garage come out masked unless that
 * download asked for full numbers.
 *
 * Needs a throwaway, fully migrated local database, so it runs on its own
 * and only when asked (skipped in the ordinary suite):
 *
 *   BACKUP_DB_URL='postgresql://detlio:detlio@localhost:55432/<db>?sslmode=disable' \
 *     bun test src/modules/garage-backup/garage-backup.db.test.ts
 *
 * Never point it at a real database: it refuses any host but localhost.
 */
import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { randomUUID } from 'node:crypto'

const url = process.env.BACKUP_DB_URL
const local = url !== undefined && /@(localhost|127\.0\.0\.1)(:\d+)?\//.test(url)
if (local) process.env.DATABASE_URL = url

describe.skipIf(!local)('back up all garages, on a real database', () => {
  const ids = {
    owner: randomUUID(),
    customer: randomUUID(),
    vendor: randomUUID(),
    vehicle: randomUUID(),
    service: randomUUID(),
    booking: randomUUID(),
    gbCustomer: randomUUID(),
    job: randomUUID(),
    supplier: randomUUID(),
    document: randomUUID(),
  }
  const tail = String(Date.now()).slice(-8)
  const ownerPhone = `98${tail}`
  const garagePhone = `97${tail}`
  const gbPhone = `96${tail}`
  const account = `5${tail}1234`
  const owner = { sub: `admin:${randomUUID()}`, name: 'Backup DB Owner' }

  let mod: {
    db: typeof import('../../db/index.js').db
    sql: typeof import('drizzle-orm').sql
    service: typeof import('./garage-backup.service.js').garageBackupService
    repository: typeof import('./garage-backup.repository.js').garageBackupRepository
    lib: typeof import('../../lib/garage-backup.js')
  }

  beforeAll(async () => {
    const { db } = await import('../../db/index.js')
    const { sql } = await import('drizzle-orm')
    mod = {
      db,
      sql,
      service: (await import('./garage-backup.service.js')).garageBackupService,
      repository: (await import('./garage-backup.repository.js')).garageBackupRepository,
      lib: await import('../../lib/garage-backup.js'),
    }
    await db.execute(sql`
      insert into users (id, name, phone) values
        (${ids.owner}, 'Backup Owner', ${ownerPhone}),
        (${ids.customer}, 'Backup Customer', ${`95${tail}`})`)
    await db.execute(sql`
      insert into vendors (id, owner_id, business_name, phone, whatsapp, address, city, notes)
      values (${ids.vendor}, ${ids.owner}, 'Backup DB Motors', ${garagePhone}, ${garagePhone},
              ${`1 Test Road, call ${ownerPhone}`}, 'Chennai', ${`Brother: ${ownerPhone}`})`)
    await db.execute(sql`
      insert into vendor_working_hours (vendor_id, day_of_week, open_time, close_time)
      values (${ids.vendor}, 1, '08:00', '20:00')`)
    await db.execute(sql`
      insert into vendor_payout_accounts (vendor_id, account_name, account_number, ifsc, upi_id, updated_by)
      values (${ids.vendor}, 'Backup Owner', ${account}, 'HDFC0001234', ${`${ownerPhone}@ybl`}, 'Mathew')`)
    await db.execute(sql`
      insert into user_vehicles (id, user_id, make, model, vehicle_type, license_plate)
      values (${ids.vehicle}, ${ids.customer}, 'Maruti', 'Swift', 'hatchback', 'TN01AB1234')`)
    await db.execute(sql`
      insert into services (id, vendor_id, name, category, price, duration_mins)
      values (${ids.service}, ${ids.vendor}, 'Backup Foam Wash', 'car_wash', 499, 30)`)
    await db.execute(sql`
      insert into bookings (id, user_id, vendor_id, service_id, vehicle_id, booking_type, scheduled_at,
                            duration_mins, amount, subtotal_amount, payment_method, status)
      values (${ids.booking}, ${ids.customer}, ${ids.vendor}, ${ids.service}, ${ids.vehicle}, 'dropin',
              now() - interval '2 days', 30, 499, 499, 'cash', 'completed')`)
    await db.execute(sql`
      insert into booking_items (booking_id, service_id, name, amount, duration_mins, category)
      values (${ids.booking}, ${ids.service}, 'Backup Foam Wash', 499, 30, 'car_wash')`)
    await db.execute(sql`
      insert into reviews (booking_id, user_id, vendor_id, rating, comment)
      values (${ids.booking}, ${ids.customer}, ${ids.vendor}, 5, 'Lovely wash')`)
    await db.execute(sql`
      insert into garage_customers (id, vendor_id, name, phone) values (${ids.gbCustomer}, ${ids.vendor}, 'Walk-in Ravi', ${gbPhone})`)
    await db.execute(sql`
      insert into garage_jobs (id, vendor_id, client_id, garage_customer_id, scheduled_at, payment_method, total_paise, status, done_at)
      values (${ids.job}, ${ids.vendor}, ${randomUUID()}, ${ids.gbCustomer}, now(), 'later', 45000, 'done', now())`)
    await db.execute(sql`
      insert into garage_job_lines (job_id, label, price_paise, qty) values (${ids.job}, 'Foam wash', 45000, 1)`)
    await db.execute(sql`
      insert into garage_payments (vendor_id, garage_customer_id, job_id, kind, amount_paise)
      values (${ids.vendor}, ${ids.gbCustomer}, ${ids.job}, 'owed', 45000)`)
    await db.execute(sql`
      insert into garage_expenses (vendor_id, category, amount_paise, spent_on, note)
      values (${ids.vendor}, 'rent', 1500000, current_date, 'November rent')`)
    await db.execute(sql`
      insert into garage_suppliers (id, vendor_id, name, phone) values (${ids.supplier}, ${ids.vendor}, 'Shampoo Supplier', ${gbPhone})`)
    await db.execute(sql`
      insert into garage_stock_items (vendor_id, name, unit, level, supplier_id, pack_price_paise)
      values (${ids.vendor}, 'Shampoo', 'l', 4.5, ${ids.supplier}, 120000)`)
    await db.execute(sql`
      insert into vendor_documents (id, vendor_id, type, uploaded_by, uploaded_by_sub)
      values (${ids.document}, ${ids.vendor}, 'bank_proof', 'Mathew', 'admin')`)
  })

  afterAll(async () => {
    if (!mod) return
    const { db, sql } = mod
    await db.execute(sql`delete from vendor_documents where vendor_id = ${ids.vendor}`)
    await db.execute(sql`delete from garage_stock_items where vendor_id = ${ids.vendor}`)
    await db.execute(sql`delete from garage_suppliers where vendor_id = ${ids.vendor}`)
    await db.execute(sql`delete from garage_expenses where vendor_id = ${ids.vendor}`)
    await db.execute(sql`delete from garage_customers where vendor_id = ${ids.vendor}`)
    await db.execute(sql`delete from bookings where vendor_id = ${ids.vendor}`)
    await db.execute(sql`delete from services where vendor_id = ${ids.vendor}`)
    await db.execute(sql`delete from vendors where id = ${ids.vendor}`)
    await db.execute(sql`delete from user_vehicles where id = ${ids.vehicle}`)
    await db.execute(sql`delete from users where id in (${ids.owner}, ${ids.customer})`)
    // The audit rows stay: admin_audit_log is append-only, by trigger.
  })

  /** Every row of a sheet, page after page, as the panel reads it. */
  async function readAll(table: string, backupId: string, full: boolean) {
    const rows: unknown[][] = []
    let cursor: string | undefined
    for (;;) {
      const page = await mod.service.page({ sub: owner.sub }, table as never, {
        backup: backupId,
        cursor,
        full: full ? '1' : '0',
      })
      rows.push(...page.rows)
      if (!page.nextCursor) return rows
      cursor = page.nextCursor
    }
  }

  const ourRow = (rows: unknown[][]) => rows.filter((row) => row[0] === ids.vendor)

  test('each download is recorded, and Last backup reads the newest', async () => {
    const started = await mod.service.start(owner, false)
    expect(started).toMatchObject({ by: owner.name, full: false })
    const [row] = Array.from(
      await mod.db.execute<{ action: string; actor_sub: string; actor_name: string; detail: { full: boolean } }>(
        mod.sql`select action, actor_sub, actor_name, detail from admin_audit_log where id = ${started.backupId}`
      )
    )
    expect(row).toEqual({
      action: 'garage_backup_downloaded',
      actor_sub: owner.sub,
      actor_name: owner.name,
      detail: { full: false },
    })
    expect((await mod.service.last()).lastBackup).toEqual({ at: started.at, by: owner.name, full: false })
  })

  test('every sheet reads, its row count matches its pages, and no row repeats', async () => {
    const started = await mod.service.start(owner, false)
    const manifest = await mod.service.manifest()
    for (const group of manifest.groups) {
      for (const table of group.tables) {
        const rows = await readAll(table.key, started.backupId, false)
        expect([table.key, rows.length]).toEqual([table.key, table.rows])
        for (const row of rows) expect(row).toHaveLength(table.columns.length)
      }
    }
    // Keyset pages of two, through every garage: none skipped, none twice.
    const seen: string[] = []
    let after: string | null = null
    for (;;) {
      const rows = await mod.repository.page('garages', after, 2)
      seen.push(...rows.slice(0, 2).map((row) => row.cursor_id))
      after = mod.lib.nextCursor(rows, 2)
      if (!after) break
    }
    expect(seen.length).toBe(manifest.groups[0].tables[0].rows)
    expect(new Set(seen).size).toBe(seen.length)
    expect([...seen].sort()).toEqual(seen)
  })

  test('masked by default: the garage, its owner, its bank account and its Garage Book', async () => {
    const started = await mod.service.start(owner, false)
    const all = []
    for (const table of ['garages', 'bank', 'bookings', 'garage_book_customers', 'garage_book_bills', 'garage_book_stock']) {
      all.push(...ourRow(await readAll(table, started.backupId, false)))
    }
    const text = JSON.stringify(all)
    for (const number of [ownerPhone, garagePhone, gbPhone, account, `95${tail}`]) expect(text).not.toContain(number)
    expect(text).toContain(mod.lib.maskDigits(garagePhone, 'phone'))
    expect(text).toContain(mod.lib.maskDigits(account))
    expect(text).toContain('HDFC0001234')
    expect(text).toContain('Walk-in Ravi')
    expect(text).toContain('Foam wash × 1 @ 450.00')
    // A masked download can't turn itself into a full one.
    await expect(readAll('garages', started.backupId, true)).rejects.toMatchObject({ code: 'BACKUP_NOT_FULL' })
  })

  test('full numbers when that download asked for them', async () => {
    const started = await mod.service.start(owner, true)
    const [garage] = ourRow(await readAll('garages', started.backupId, true))
    expect(garage).toContain(garagePhone)
    expect(garage).toContain(ownerPhone)
    const [bank] = ourRow(await readAll('bank', started.backupId, true))
    expect(bank).toContain(account)
    expect(bank).toContain(`${ownerPhone}@ybl`)
    const [customer] = ourRow(await readAll('garage_book_customers', started.backupId, true))
    expect(customer).toContain(gbPhone)
    expect(customer).toContain('450.00')
    const [item] = ourRow(await readAll('booking_items', started.backupId, true))
    expect(item).toContain('car_wash')
  })
})
