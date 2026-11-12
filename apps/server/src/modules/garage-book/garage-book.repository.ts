import { and, eq, inArray, sql } from 'drizzle-orm'
import { db } from '../../db/index.js'
import {
  adminAuditLog,
  garageCustomerCars,
  garageCustomers,
  garageDetlioCustomerNotes,
  garageJobLines,
  garageJobs,
  garagePayments,
  garageReminderSends,
  garageReminderSettings,
  internalAccessLog,
  services,
  vendors,
  type GarageJobOrigin,
  type GarageJobPayment,
  type GarageJobStatus,
} from '../../db/schema.js'

/**
 * Garage Book's reads and writes (0072). Every read is scoped to the garage
 * resolveTenant produced; a Detlio customer is "a user with a paid booking at
 * this garage" and is read from bookings, never copied. Raw SQL for the
 * grouped reads; dates come back from postgres-js as Date or text, so every
 * one goes through `at()`.
 */

/** A paid (or collected, or refunded) booking: what the garage's own job list shows. */
export const PAID = sql`EXISTS (SELECT 1 FROM payments p WHERE p.booking_id = b.id AND p.status IN ('paid', 'collected', 'refunded'))`

export function at(value: Date | string | null | undefined): Date | null {
  if (value === null || value === undefined) return null
  const date = value instanceof Date ? value : new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

export const num = (value: unknown) => (value === null || value === undefined ? 0 : Number(value))

export type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0]

export interface JobRow {
  id: string
  clientId: string
  garageCustomerId: string
  customerName: string
  customerPhone: string | null
  carId: string | null
  plate: string | null
  make: string | null
  model: string | null
  scheduledAt: Date
  status: GarageJobStatus
  paymentMethod: GarageJobPayment
  totalPaise: number
  remindInDays: number | null
  doneAt: Date | null
  createdAt: Date
  lines: Array<{ serviceId: string | null; label: string; pricePaise: number; qty: number }>
  visitNumber: number
  /** Where it came from (0073): added at the garage, the garage's own link, or a paper book. */
  origin: GarageJobOrigin
}

export interface DetlioJobRow {
  id: string
  userId: string
  userName: string
  status: string
  bookingType: string
  scheduledAt: Date
  durationMins: number
  amount: string
  paymentMethod: string
  completedAt: Date | null
  make: string | null
  model: string | null
  plate: string | null
  items: string[]
}

export interface CarRow {
  id: string
  plate: string | null
  make: string | null
  model: string | null
  colour: string | null
  washIntervalDays: number | null
}

export interface OwnCustomerSummary {
  id: string
  name: string
  phone: string | null
  note: string | null
  createdAt: Date
  cars: CarRow[]
  visits: number
  spentPaise: number
  owesPaise: number
  lastVisitAt: Date | null
  lastRemindIn: number | null
  lastCarIntervalDays: number | null
  remindedAt: Date | null
}

export interface DetlioCustomerSummary {
  userId: string
  name: string
  firstAt: Date
  cars: Array<{ id: string; plate: string | null; make: string; model: string; washIntervalDays: number | null }>
  visits: number
  spentPaise: number
  lastVisitAt: Date | null
  remindedAt: Date | null
}

async function jobLines(executor: Tx | typeof db, jobIds: string[]) {
  if (jobIds.length === 0) return new Map<string, JobRow['lines']>()
  const rows = await executor
    .select({
      jobId: garageJobLines.jobId,
      serviceId: garageJobLines.serviceId,
      label: garageJobLines.label,
      pricePaise: garageJobLines.pricePaise,
      qty: garageJobLines.qty,
    })
    .from(garageJobLines)
    .where(inArray(garageJobLines.jobId, jobIds))
    .orderBy(garageJobLines.id)
  const map = new Map<string, JobRow['lines']>()
  for (const row of rows) {
    const list = map.get(row.jobId) ?? []
    list.push({ serviceId: row.serviceId, label: row.label, pricePaise: row.pricePaise, qty: row.qty })
    map.set(row.jobId, list)
  }
  return map
}

async function readJobs(executor: Tx | typeof db, where: ReturnType<typeof sql>): Promise<JobRow[]> {
  const rows = await executor.execute<{
    id: string
    client_id: string
    garage_customer_id: string
    customer_name: string
    customer_phone: string | null
    car_id: string | null
    plate: string | null
    make: string | null
    model: string | null
    scheduled_at: Date | string
    status: GarageJobStatus
    payment_method: GarageJobPayment
    total_paise: number
    remind_in_days: number | null
    done_at: Date | string | null
    created_at: Date | string
    visit_number: number | string
    origin: GarageJobOrigin
  }>(sql`
    SELECT j.id, j.client_id, j.garage_customer_id, c.name AS customer_name, c.phone AS customer_phone,
           j.car_id, car.plate, car.make, car.model, j.scheduled_at, j.status, j.payment_method,
           j.total_paise, j.remind_in_days, j.done_at, j.created_at, j.origin,
           (SELECT count(*) FROM garage_jobs v
             WHERE v.garage_customer_id = j.garage_customer_id AND v.status = 'done'
               AND v.scheduled_at <= j.scheduled_at) AS visit_number
      FROM garage_jobs j
      JOIN garage_customers c ON c.id = j.garage_customer_id
      LEFT JOIN garage_customer_cars car ON car.id = j.car_id
     WHERE ${where}
     ORDER BY j.scheduled_at, j.created_at
  `)
  const list = Array.from(rows)
  const lines = await jobLines(
    executor,
    list.map((row) => row.id)
  )
  return list.map((row) => ({
    id: row.id,
    clientId: row.client_id,
    garageCustomerId: row.garage_customer_id,
    customerName: row.customer_name,
    customerPhone: row.customer_phone,
    carId: row.car_id,
    plate: row.plate,
    make: row.make,
    model: row.model,
    scheduledAt: at(row.scheduled_at)!,
    status: row.status,
    paymentMethod: row.payment_method,
    totalPaise: num(row.total_paise),
    remindInDays: row.remind_in_days === null ? null : num(row.remind_in_days),
    doneAt: at(row.done_at),
    createdAt: at(row.created_at)!,
    lines: lines.get(row.id) ?? [],
    visitNumber: num(row.visit_number),
    origin: row.origin ?? 'walk_in',
  }))
}

export const garageBookRepository = {
  async vendor(vendorId: string) {
    const [row] = await db
      .select({ id: vendors.id, businessName: vendors.businessName, phone: vendors.phone, whatsapp: vendors.whatsapp })
      .from(vendors)
      .where(eq(vendors.id, vendorId))
      .limit(1)
    return row ?? null
  },

  // ─── Jobs ──────────────────────────────────────────────────────────────────

  async jobsBetween(vendorId: string, start: Date, end: Date) {
    return readJobs(
      db,
      sql`j.vendor_id = ${vendorId} AND j.scheduled_at >= ${start.toISOString()}::timestamptz AND j.scheduled_at < ${end.toISOString()}::timestamptz`
    )
  },

  async job(vendorId: string, jobId: string, executor: Tx | typeof db = db) {
    const [row] = await readJobs(executor, sql`j.vendor_id = ${vendorId} AND j.id = ${jobId}`)
    return row ?? null
  },

  async jobByClientId(vendorId: string, clientId: string, executor: Tx | typeof db = db) {
    const [row] = await readJobs(executor, sql`j.vendor_id = ${vendorId} AND j.client_id = ${clientId}`)
    return row ?? null
  },

  async jobsForCustomer(vendorId: string, customerId: string) {
    return readJobs(db, sql`j.vendor_id = ${vendorId} AND j.garage_customer_id = ${customerId}`)
  },

  /** The garage's own services, for a walk-in's lines: id, name and flat price. */
  async servicesById(vendorId: string, ids: string[]) {
    if (ids.length === 0) return []
    return db
      .select({ id: services.id, name: services.name, price: services.price })
      .from(services)
      .where(and(eq(services.vendorId, vendorId), inArray(services.id, ids), sql`${services.deletedAt} is null`))
  },

  /** The garage's price list for a walk-in: its active services and add-ons, cheapest price first. */
  async priceList(vendorId: string) {
    return db
      .select({
        id: services.id,
        name: services.name,
        price: services.price,
        durationMins: services.durationMins,
        isAddon: services.isAddon,
      })
      .from(services)
      .where(and(eq(services.vendorId, vendorId), eq(services.isActive, true), sql`${services.deletedAt} is null`))
      .orderBy(services.isAddon, services.name)
  },

  transaction<T>(work: (tx: Tx) => Promise<T>) {
    return db.transaction(work)
  },

  /** Serialises writes for one walk-in's client_id, so two resends can't both insert. */
  async lockClientId(tx: Tx, vendorId: string, clientId: string) {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`garage-job:${vendorId}:${clientId}`})::bigint)`)
  },

  /** Serialises edits of one walk-in, taken before it is read. */
  async lockJob(tx: Tx, jobId: string) {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`garage-job-edit:${jobId}`})::bigint)`)
  },

  /** Serialises adding a customer by phone, so two walk-ins for one new number make one customer. */
  async lockPhone(tx: Tx, vendorId: string, phone: string) {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`garage-phone:${vendorId}:${phone}`})::bigint)`)
  },

  async lockPush(tx: Tx, vendorId: string, userId: string) {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`garage-push:${vendorId}:${userId}`})::bigint)`)
  },

  async ownCustomer(vendorId: string, customerId: string, executor: Tx | typeof db = db) {
    const [row] = await executor
      .select()
      .from(garageCustomers)
      .where(
        and(
          eq(garageCustomers.vendorId, vendorId),
          eq(garageCustomers.id, customerId),
          sql`${garageCustomers.deletedAt} is null`
        )
      )
      .limit(1)
    return row ?? null
  },

  async ownCustomerByPhone(tx: Tx, vendorId: string, phone: string) {
    const [row] = await tx
      .select()
      .from(garageCustomers)
      .where(
        and(
          eq(garageCustomers.vendorId, vendorId),
          eq(garageCustomers.phone, phone),
          sql`${garageCustomers.deletedAt} is null`
        )
      )
      .limit(1)
    return row ?? null
  },

  async insertCustomer(
    tx: Tx,
    data: { vendorId: string; name: string; phone: string | null; note?: string | null; sourceNote?: string | null }
  ) {
    const [row] = await tx.insert(garageCustomers).values(data).returning()
    return row!
  },

  async cars(customerIds: string[], executor: Tx | typeof db = db) {
    if (customerIds.length === 0) return new Map<string, CarRow[]>()
    const rows = await executor
      .select({
        id: garageCustomerCars.id,
        customerId: garageCustomerCars.garageCustomerId,
        plate: garageCustomerCars.plate,
        make: garageCustomerCars.make,
        model: garageCustomerCars.model,
        colour: garageCustomerCars.colour,
        washIntervalDays: garageCustomerCars.washIntervalDays,
      })
      .from(garageCustomerCars)
      .where(inArray(garageCustomerCars.garageCustomerId, customerIds))
      .orderBy(garageCustomerCars.createdAt)
    const map = new Map<string, CarRow[]>()
    for (const { customerId, ...car } of rows) {
      const list = map.get(customerId) ?? []
      list.push(car)
      map.set(customerId, list)
    }
    return map
  },

  async insertCar(
    tx: Tx,
    data: {
      vendorId: string
      garageCustomerId: string
      plate: string | null
      make: string | null
      model: string | null
      colour?: string | null
      washIntervalDays?: number | null
    }
  ) {
    const [row] = await tx.insert(garageCustomerCars).values(data).returning()
    return row!
  },

  async updateCar(
    tx: Tx,
    customerId: string,
    carId: string,
    data: Partial<{ plate: string | null; make: string | null; model: string | null; colour: string | null; washIntervalDays: number | null }>
  ) {
    const [row] = await tx
      .update(garageCustomerCars)
      .set(data)
      .where(and(eq(garageCustomerCars.id, carId), eq(garageCustomerCars.garageCustomerId, customerId)))
      .returning()
    return row ?? null
  },

  async insertJob(
    tx: Tx,
    data: {
      vendorId: string
      clientId: string
      garageCustomerId: string
      carId: string | null
      scheduledAt: Date
      status: GarageJobStatus
      paymentMethod: GarageJobPayment
      totalPaise: number
      remindInDays: number | null
      createdBy: string | null
      doneAt: Date | null
      origin?: GarageJobOrigin
    },
    lines: Array<{ serviceId: string | null; label: string; pricePaise: number; qty: number }>
  ) {
    const [job] = await tx.insert(garageJobs).values(data).returning()
    if (lines.length > 0) {
      await tx.insert(garageJobLines).values(lines.map((line) => ({ ...line, jobId: job!.id })))
    }
    return job!
  },

  async updateJob(
    tx: Tx,
    vendorId: string,
    jobId: string,
    data: Partial<{
      status: GarageJobStatus
      paymentMethod: GarageJobPayment
      totalPaise: number
      scheduledAt: Date
      doneAt: Date | null
    }>
  ) {
    await tx
      .update(garageJobs)
      .set(data)
      .where(and(eq(garageJobs.vendorId, vendorId), eq(garageJobs.id, jobId)))
  },

  async replaceLines(tx: Tx, jobId: string, lines: Array<{ serviceId: string | null; label: string; pricePaise: number; qty: number }>) {
    await tx.delete(garageJobLines).where(eq(garageJobLines.jobId, jobId))
    if (lines.length > 0) {
      await tx.insert(garageJobLines).values(lines.map((line) => ({ ...line, jobId })))
    }
  },

  /** A Pay later job's owed row: written, changed to the new total, or removed. */
  async setOwed(
    tx: Tx,
    data: { vendorId: string; garageCustomerId: string; jobId: string; amountPaise: number; createdBy: string | null } | null,
    jobId: string
  ) {
    if (!data || data.amountPaise <= 0) {
      await tx.delete(garagePayments).where(and(eq(garagePayments.jobId, jobId), eq(garagePayments.kind, 'owed')))
      return
    }
    await tx
      .insert(garagePayments)
      .values({ ...data, kind: 'owed' })
      .onConflictDoUpdate({
        target: garagePayments.jobId,
        targetWhere: sql`${garagePayments.kind} = 'owed'`,
        set: { amountPaise: data.amountPaise },
      })
  },

  // ─── Detlio bookings at this garage ────────────────────────────────────────

  async detlioJobsBetween(vendorId: string, start: Date, end: Date): Promise<DetlioJobRow[]> {
    return readDetlioJobs(
      sql`b.vendor_id = ${vendorId}
          AND b.scheduled_at >= ${start.toISOString()}::timestamptz AND b.scheduled_at < ${end.toISOString()}::timestamptz
          AND b.status IN ('pending', 'confirmed', 'in_progress', 'completed')`
    )
  },

  async detlioJobsForUser(vendorId: string, userId: string): Promise<DetlioJobRow[]> {
    return readDetlioJobs(
      sql`b.vendor_id = ${vendorId} AND b.user_id = ${userId} AND b.status IN ('pending', 'confirmed', 'in_progress', 'completed', 'cancelled')`
    )
  },

  // ─── Customers ─────────────────────────────────────────────────────────────

  async ownCustomers(vendorId: string, search: { q: string | null; plate: string | null } = { q: null, plate: null }) {
    const like = search.q ? `%${search.q.replace(/[%_\\]/g, (m) => `\\${m}`)}%` : null
    const rows = await db.execute<{
      id: string
      name: string
      phone: string | null
      note: string | null
      created_at: Date | string
      visits: number | string
      spent: number | string
      owed: number | string
      paid: number | string
      last_visit_at: Date | string | null
      last_remind_in: number | null
      last_car_interval: number | null
      reminded_at: Date | string | null
    }>(sql`
      SELECT c.id, c.name, c.phone, c.note, c.created_at,
             (SELECT count(*) FROM garage_jobs j WHERE j.garage_customer_id = c.id AND j.status = 'done') AS visits,
             (SELECT coalesce(sum(j.total_paise), 0) FROM garage_jobs j WHERE j.garage_customer_id = c.id AND j.status = 'done') AS spent,
             (SELECT coalesce(sum(p.amount_paise), 0) FROM garage_payments p WHERE p.garage_customer_id = c.id AND p.kind = 'owed') AS owed,
             (SELECT coalesce(sum(p.amount_paise), 0) FROM garage_payments p WHERE p.garage_customer_id = c.id AND p.kind = 'paid') AS paid,
             last.done_at AS last_visit_at, last.remind_in_days AS last_remind_in, last.wash_interval_days AS last_car_interval,
             (SELECT max(s.sent_at) FROM garage_reminder_sends s WHERE s.garage_customer_id = c.id) AS reminded_at
        FROM garage_customers c
        LEFT JOIN LATERAL (
          SELECT j.done_at, j.remind_in_days, car.wash_interval_days
            FROM garage_jobs j LEFT JOIN garage_customer_cars car ON car.id = j.car_id
           WHERE j.garage_customer_id = c.id AND j.status = 'done'
           ORDER BY j.done_at DESC LIMIT 1
        ) last ON true
       WHERE c.vendor_id = ${vendorId} AND c.deleted_at IS NULL
         ${
           like || search.plate
             ? sql`AND (
                 ${like ? sql`c.name ILIKE ${like} OR c.phone LIKE ${like}` : sql`false`}
                 ${
                   search.plate
                     ? sql`OR EXISTS (SELECT 1 FROM garage_customer_cars car
                            WHERE car.garage_customer_id = c.id
                              AND regexp_replace(upper(coalesce(car.plate, '')), '[^A-Z0-9]', '', 'g') LIKE ${`%${search.plate}%`})`
                     : sql``
                 }
               )`
             : sql``
         }
       ORDER BY coalesce(last.done_at, c.created_at) DESC
       LIMIT 500
    `)
    const list = Array.from(rows)
    const cars = await this.cars(list.map((row) => row.id))
    return list.map(
      (row): OwnCustomerSummary => ({
        id: row.id,
        name: row.name,
        phone: row.phone,
        note: row.note,
        createdAt: at(row.created_at)!,
        cars: cars.get(row.id) ?? [],
        visits: num(row.visits),
        spentPaise: num(row.spent),
        owesPaise: Math.max(0, num(row.owed) - num(row.paid)),
        lastVisitAt: at(row.last_visit_at),
        lastRemindIn: row.last_remind_in === null ? null : num(row.last_remind_in),
        lastCarIntervalDays: row.last_car_interval === null ? null : num(row.last_car_interval),
        remindedAt: at(row.reminded_at),
      })
    )
  },

  /** Every Detlio customer of this garage: a user with a paid booking here. Never their phone. */
  async detlioCustomers(vendorId: string, search: { q: string | null; plate: string | null } = { q: null, plate: null }, userId?: string) {
    const like = search.q ? `%${search.q.replace(/[%_\\]/g, (m) => `\\${m}`)}%` : null
    const rows = await db.execute<{
      user_id: string
      name: string
      first_at: Date | string
      visits: number | string
      spent: string | number
      last_visit_at: Date | string | null
      reminded_at: Date | string | null
    }>(sql`
      SELECT u.id AS user_id, u.name,
             min(b.created_at) AS first_at,
             count(*) FILTER (WHERE b.status = 'completed') AS visits,
             coalesce(sum(b.amount) FILTER (WHERE b.status = 'completed'), 0) AS spent,
             max(coalesce(b.completed_at, b.scheduled_at)) FILTER (WHERE b.status = 'completed') AS last_visit_at,
             (SELECT max(s.sent_at) FROM garage_reminder_sends s WHERE s.vendor_id = ${vendorId} AND s.user_id = u.id) AS reminded_at
        FROM bookings b
        JOIN users u ON u.id = b.user_id
       WHERE b.vendor_id = ${vendorId} AND ${PAID} AND b.status <> 'rescheduled' AND u.deleted_at IS NULL
         ${userId ? sql`AND u.id = ${userId}` : sql``}
         ${
           like || search.plate
             ? sql`AND (
                 ${like ? sql`u.name ILIKE ${like}` : sql`false`}
                 ${
                   search.plate
                     ? sql`OR EXISTS (SELECT 1 FROM bookings b2 JOIN user_vehicles v ON v.id = b2.vehicle_id
                            WHERE b2.vendor_id = ${vendorId} AND b2.user_id = u.id
                              AND regexp_replace(upper(coalesce(v.license_plate, '')), '[^A-Z0-9]', '', 'g') LIKE ${`%${search.plate}%`})`
                     : sql``
                 }
               )`
             : sql``
         }
       GROUP BY u.id, u.name
       ORDER BY max(b.scheduled_at) DESC
       LIMIT 500
    `)
    const list = Array.from(rows)
    const cars = await detlioCars(
      vendorId,
      list.map((row) => row.user_id)
    )
    return list.map(
      (row): DetlioCustomerSummary => ({
        userId: row.user_id,
        name: row.name,
        firstAt: at(row.first_at)!,
        cars: cars.get(row.user_id) ?? [],
        visits: num(row.visits),
        spentPaise: Math.round(num(row.spent) * 100),
        lastVisitAt: at(row.last_visit_at),
        remindedAt: at(row.reminded_at),
      })
    )
  },

  async detlioNote(vendorId: string, userId: string) {
    const [row] = await db
      .select({ note: garageDetlioCustomerNotes.note })
      .from(garageDetlioCustomerNotes)
      .where(and(eq(garageDetlioCustomerNotes.vendorId, vendorId), eq(garageDetlioCustomerNotes.userId, userId)))
      .limit(1)
    return row?.note ?? null
  },

  async setDetlioNote(vendorId: string, userId: string, note: string | null) {
    if (!note) {
      await db
        .delete(garageDetlioCustomerNotes)
        .where(and(eq(garageDetlioCustomerNotes.vendorId, vendorId), eq(garageDetlioCustomerNotes.userId, userId)))
      return
    }
    await db
      .insert(garageDetlioCustomerNotes)
      .values({ vendorId, userId, note })
      .onConflictDoUpdate({
        target: [garageDetlioCustomerNotes.vendorId, garageDetlioCustomerNotes.userId],
        set: { note, updatedAt: new Date() },
      })
  },

  async updateCustomer(tx: Tx, vendorId: string, customerId: string, data: Partial<{ name: string; phone: string | null; note: string | null }>) {
    if (Object.keys(data).length === 0) return
    await tx
      .update(garageCustomers)
      .set(data)
      .where(and(eq(garageCustomers.vendorId, vendorId), eq(garageCustomers.id, customerId)))
  },

  // ─── Money owed ────────────────────────────────────────────────────────────

  async owed(vendorId: string) {
    const rows = await db.execute<{
      customer_id: string
      name: string
      phone: string | null
      owed: number | string
      paid: number | string
      oldest_at: Date | string | null
      jobs: number | string
      last_label: string | null
    }>(sql`
      SELECT c.id AS customer_id, c.name, c.phone,
             coalesce(sum(p.amount_paise) FILTER (WHERE p.kind = 'owed'), 0) AS owed,
             coalesce(sum(p.amount_paise) FILTER (WHERE p.kind = 'paid'), 0) AS paid,
             min(p.created_at) FILTER (WHERE p.kind = 'owed') AS oldest_at,
             count(*) FILTER (WHERE p.kind = 'owed') AS jobs,
             (SELECT l.label FROM garage_payments op JOIN garage_job_lines l ON l.job_id = op.job_id
               WHERE op.garage_customer_id = c.id AND op.kind = 'owed'
               ORDER BY op.created_at DESC, l.id LIMIT 1) AS last_label
        FROM garage_payments p
        JOIN garage_customers c ON c.id = p.garage_customer_id
       WHERE p.vendor_id = ${vendorId}
       GROUP BY c.id, c.name, c.phone
    `)
    return Array.from(rows)
      .map((row) => ({
        customerId: row.customer_id,
        name: row.name,
        phone: row.phone,
        balancePaise: num(row.owed) - num(row.paid),
        oldestAt: at(row.oldest_at),
        jobs: num(row.jobs),
        lastLabel: row.last_label,
      }))
      .filter((row) => row.balancePaise > 0)
      .sort((a, b) => b.balancePaise - a.balancePaise)
  },

  async recentPaid(vendorId: string, limit = 10) {
    const rows = await db.execute<{ name: string; amount_paise: number | string; method: 'upi' | 'cash' | null; created_at: Date | string }>(sql`
      SELECT c.name, p.amount_paise, p.method, p.created_at
        FROM garage_payments p JOIN garage_customers c ON c.id = p.garage_customer_id
       WHERE p.vendor_id = ${vendorId} AND p.kind = 'paid'
       ORDER BY p.created_at DESC LIMIT ${limit}
    `)
    return Array.from(rows).map((row) => ({
      name: row.name,
      amountPaise: num(row.amount_paise),
      method: row.method,
      at: at(row.created_at)!,
    }))
  },

  async balance(vendorId: string, customerId: string, executor: Tx | typeof db = db) {
    const rows = await executor.execute<{ owed: number | string; paid: number | string }>(sql`
      SELECT coalesce(sum(amount_paise) FILTER (WHERE kind = 'owed'), 0) AS owed,
             coalesce(sum(amount_paise) FILTER (WHERE kind = 'paid'), 0) AS paid
        FROM garage_payments WHERE vendor_id = ${vendorId} AND garage_customer_id = ${customerId}
    `)
    const row = Array.from(rows)[0]
    return num(row?.owed) - num(row?.paid)
  },

  async lockCustomer(tx: Tx, customerId: string) {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`garage-customer:${customerId}`})::bigint)`)
  },

  async insertPaid(tx: Tx, data: { vendorId: string; garageCustomerId: string; amountPaise: number; method: 'upi' | 'cash'; createdBy: string | null }) {
    const [row] = await tx
      .insert(garagePayments)
      .values({ ...data, kind: 'paid' })
      .returning()
    return row!
  },

  // ─── Reminders ─────────────────────────────────────────────────────────────

  async reminderSettings(vendorId: string) {
    const [row] = await db.select().from(garageReminderSettings).where(eq(garageReminderSettings.vendorId, vendorId)).limit(1)
    return row ?? null
  },

  async saveReminderSettings(vendorId: string, data: { message: string; defaultIntervalDays?: number }) {
    await db
      .insert(garageReminderSettings)
      .values({ vendorId, message: data.message, defaultIntervalDays: data.defaultIntervalDays ?? 30 })
      .onConflictDoUpdate({
        target: garageReminderSettings.vendorId,
        set: {
          message: data.message,
          ...(data.defaultIntervalDays ? { defaultIntervalDays: data.defaultIntervalDays } : {}),
          updatedAt: new Date(),
        },
      })
  },

  async lastPushTo(executor: Tx | typeof db, vendorId: string, userId: string) {
    const rows = await executor.execute<{ sent_at: Date | string | null }>(sql`
      SELECT max(sent_at) AS sent_at FROM garage_reminder_sends
       WHERE vendor_id = ${vendorId} AND user_id = ${userId} AND channel = 'detlio_push'
    `)
    return at(Array.from(rows)[0]?.sent_at ?? null)
  },

  async logSend(
    data: { vendorId: string; garageCustomerId?: string; userId?: string; channel: 'whatsapp' | 'detlio_push'; sentBy: string | null },
    executor: Tx | typeof db = db
  ) {
    const [row] = await executor.insert(garageReminderSends).values(data).returning()
    return row!
  },

  async lastWhatsAppTo(vendorId: string, customerId: string) {
    const rows = await db.execute<{ sent_at: Date | string | null }>(sql`
      SELECT max(sent_at) AS sent_at FROM garage_reminder_sends
       WHERE vendor_id = ${vendorId} AND garage_customer_id = ${customerId}
    `)
    return at(Array.from(rows)[0]?.sent_at ?? null)
  },

  /** Did this garage's customer (own or Detlio) book or visit here? */
  async detlioCustomerExists(vendorId: string, userId: string) {
    const rows = await db.execute<{ ok: boolean }>(sql`
      SELECT EXISTS (
        SELECT 1 FROM bookings b JOIN users u ON u.id = b.user_id
         WHERE b.vendor_id = ${vendorId} AND b.user_id = ${userId} AND ${PAID}
           AND b.status <> 'rescheduled' AND u.deleted_at IS NULL
      ) AS ok
    `)
    return Boolean(Array.from(rows)[0]?.ok)
  },

  // ─── Stats ─────────────────────────────────────────────────────────────────

  /** Money taken between two instants: own (walk-ins paid at the job, and money paid back) and Detlio. */
  async takings(vendorId: string, start: Date, end: Date) {
    const from = sql`${start.toISOString()}::timestamptz`
    const to = sql`${end.toISOString()}::timestamptz`
    const rows = await db.execute<{ own_jobs: number | string; paid_back: number | string; detlio: string | number; upi: number | string; cash: number | string }>(sql`
      SELECT
        (SELECT coalesce(sum(total_paise), 0) FROM garage_jobs
          WHERE vendor_id = ${vendorId} AND status = 'done' AND payment_method IN ('upi', 'cash')
            AND done_at >= ${from} AND done_at < ${to}) AS own_jobs,
        (SELECT coalesce(sum(total_paise), 0) FROM garage_jobs
          WHERE vendor_id = ${vendorId} AND status = 'done' AND payment_method = 'upi'
            AND done_at >= ${from} AND done_at < ${to}) AS upi,
        (SELECT coalesce(sum(total_paise), 0) FROM garage_jobs
          WHERE vendor_id = ${vendorId} AND status = 'done' AND payment_method = 'cash'
            AND done_at >= ${from} AND done_at < ${to}) AS cash,
        (SELECT coalesce(sum(amount_paise), 0) FROM garage_payments
          WHERE vendor_id = ${vendorId} AND kind = 'paid' AND created_at >= ${from} AND created_at < ${to}) AS paid_back,
        (SELECT coalesce(sum(b.amount), 0) FROM bookings b
          WHERE b.vendor_id = ${vendorId} AND b.status = 'completed' AND ${PAID}
            AND coalesce(b.completed_at, b.scheduled_at) >= ${from} AND coalesce(b.completed_at, b.scheduled_at) < ${to}) AS detlio
    `)
    const row = Array.from(rows)[0]
    return {
      ownPaise: num(row?.own_jobs) + num(row?.paid_back),
      upiPaise: num(row?.upi),
      cashPaise: num(row?.cash),
      paidBackPaise: num(row?.paid_back),
      detlioPaise: Math.round(num(row?.detlio) * 100),
    }
  },

  /** Who visited between two instants, and when each first did: own customers and Detlio customers. */
  async visitors(vendorId: string, start: Date, end: Date) {
    const from = sql`${start.toISOString()}::timestamptz`
    const to = sql`${end.toISOString()}::timestamptz`
    const rows = await db.execute<{ ref: string; source: 'own' | 'detlio'; first_ever: Date | string }>(sql`
      SELECT 'own:' || j.garage_customer_id AS ref, 'own' AS source,
             (SELECT min(f.done_at) FROM garage_jobs f WHERE f.garage_customer_id = j.garage_customer_id AND f.status = 'done') AS first_ever
        FROM garage_jobs j
       WHERE j.vendor_id = ${vendorId} AND j.status = 'done' AND j.done_at >= ${from} AND j.done_at < ${to}
       GROUP BY j.garage_customer_id
      UNION ALL
      SELECT 'detlio:' || b.user_id AS ref, 'detlio' AS source,
             (SELECT min(coalesce(f.completed_at, f.scheduled_at)) FROM bookings f
               WHERE f.vendor_id = ${vendorId} AND f.user_id = b.user_id AND f.status = 'completed') AS first_ever
        FROM bookings b
       WHERE b.vendor_id = ${vendorId} AND b.status = 'completed' AND ${PAID}
         AND coalesce(b.completed_at, b.scheduled_at) >= ${from} AND coalesce(b.completed_at, b.scheduled_at) < ${to}
       GROUP BY b.user_id
    `)
    return Array.from(rows).map((row) => ({ ref: row.ref, source: row.source, firstEver: at(row.first_ever) }))
  },

  /** Finished jobs per IST weekday (0 Sunday … 6 Saturday) between two instants. */
  async jobsByWeekday(vendorId: string, start: Date, end: Date, source: 'all' | 'own' | 'detlio') {
    const from = sql`${start.toISOString()}::timestamptz`
    const to = sql`${end.toISOString()}::timestamptz`
    const own = sql`SELECT extract(dow FROM j.scheduled_at AT TIME ZONE 'Asia/Kolkata')::int AS dow FROM garage_jobs j
                     WHERE j.vendor_id = ${vendorId} AND j.status = 'done' AND j.scheduled_at >= ${from} AND j.scheduled_at < ${to}`
    const detlio = sql`SELECT extract(dow FROM b.scheduled_at AT TIME ZONE 'Asia/Kolkata')::int AS dow FROM bookings b
                        WHERE b.vendor_id = ${vendorId} AND b.status = 'completed' AND ${PAID}
                          AND b.scheduled_at >= ${from} AND b.scheduled_at < ${to}`
    const union = source === 'own' ? own : source === 'detlio' ? detlio : sql`${own} UNION ALL ${detlio}`
    const rows = await db.execute<{ dow: number; n: number | string }>(sql`SELECT dow, count(*) AS n FROM (${union}) x GROUP BY dow`)
    const counts = [0, 0, 0, 0, 0, 0, 0]
    for (const row of Array.from(rows)) counts[Number(row.dow)] = num(row.n)
    return counts
  },

  // ─── Excel and admin ──────────────────────────────────────────────────────

  async exportRows(vendorId: string) {
    const customers = await db
      .select()
      .from(garageCustomers)
      .where(and(eq(garageCustomers.vendorId, vendorId), sql`${garageCustomers.deletedAt} is null`))
      .orderBy(garageCustomers.createdAt)
    const cars = await db
      .select()
      .from(garageCustomerCars)
      .where(eq(garageCustomerCars.vendorId, vendorId))
      .orderBy(garageCustomerCars.createdAt)
    const jobs = await readJobs(db, sql`j.vendor_id = ${vendorId}`)
    const payments = await db
      .select()
      .from(garagePayments)
      .where(eq(garagePayments.vendorId, vendorId))
      .orderBy(garagePayments.createdAt)
    return { customers, cars, jobs, payments }
  },

  async logAdminAccess(data: { userId: string | null; actorSub: string; actorName: string; vendorId: string; endpoint: string }) {
    if (data.userId) {
      await db.insert(internalAccessLog).values({
        userId: data.userId,
        vendorId: data.vendorId,
        method: 'GET',
        endpoint: data.endpoint.slice(0, 512),
      })
      return
    }
    // A personal admin login or the shared one has no users row for
    // internal_access_log to name, so its look is kept with the other admin
    // actions instead.
    await db.insert(adminAuditLog).values({
      action: 'garage_book_viewed',
      actorSub: data.actorSub,
      actorName: data.actorName.slice(0, 100),
      summary: { vendorId: data.vendorId },
      detail: { endpoint: data.endpoint.slice(0, 512) },
    })
  },
}

async function readDetlioJobs(where: ReturnType<typeof sql>): Promise<DetlioJobRow[]> {
  const rows = await db.execute<{
    id: string
    user_id: string
    user_name: string
    status: string
    booking_type: string
    scheduled_at: Date | string
    duration_mins: number
    amount: string
    payment_method: string
    completed_at: Date | string | null
    make: string | null
    model: string | null
    plate: string | null
    items: string[] | null
  }>(sql`
    SELECT b.id, b.user_id, u.name AS user_name, b.status, b.booking_type, b.scheduled_at, b.duration_mins,
           b.amount, b.payment_method, b.completed_at, v.make, v.model, v.license_plate AS plate,
           (SELECT array_agg(bi.name ORDER BY bi.sort_order) FROM booking_items bi WHERE bi.booking_id = b.id) AS items
      FROM bookings b
      JOIN users u ON u.id = b.user_id
      LEFT JOIN user_vehicles v ON v.id = b.vehicle_id
     WHERE ${where} AND ${PAID}
     ORDER BY b.scheduled_at
  `)
  return Array.from(rows).map((row) => ({
    id: row.id,
    userId: row.user_id,
    userName: row.user_name,
    status: row.status,
    bookingType: row.booking_type,
    scheduledAt: at(row.scheduled_at)!,
    durationMins: num(row.duration_mins),
    amount: String(row.amount),
    paymentMethod: row.payment_method,
    completedAt: at(row.completed_at),
    make: row.make,
    model: row.model,
    plate: row.plate,
    items: row.items ?? [],
  }))
}

async function detlioCars(vendorId: string, userIds: string[]) {
  const map = new Map<string, DetlioCustomerSummary['cars']>()
  if (userIds.length === 0) return map
  const rows = await db.execute<{
    user_id: string
    id: string
    plate: string | null
    make: string
    model: string
    wash_interval_days: number | null
  }>(sql`
    SELECT DISTINCT v.user_id, v.id, v.license_plate AS plate, v.make, v.model, v.wash_interval_days
      FROM bookings b JOIN user_vehicles v ON v.id = b.vehicle_id
     WHERE b.vendor_id = ${vendorId} AND b.user_id IN (${sql.join(userIds.map((id) => sql`${id}`), sql`, `)}) AND ${PAID}
  `)
  for (const row of Array.from(rows)) {
    const list = map.get(row.user_id) ?? []
    list.push({
      id: row.id,
      plate: row.plate,
      make: row.make,
      model: row.model,
      washIntervalDays: row.wash_interval_days === null ? null : Number(row.wash_interval_days),
    })
    map.set(row.user_id, list)
  }
  return map
}
