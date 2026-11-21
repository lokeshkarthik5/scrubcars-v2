import { eq, sql } from 'drizzle-orm'
import { db } from '../../db/index.js'
import { garageBills, garagePaymentDetails, type GaragePayApp } from '../../db/schema.js'
import { at, num, type Tx } from './garage-book.repository.js'

/**
 * Bills' and payment details' reads and writes (0074). A bill's number comes
 * from the garage's own counter, which only goes up; the bill row is unique
 * per job, so asking twice finds the first.
 */

export interface BillRow {
  id: string
  vendorId: string
  number: number
  garageJobId: string | null
  bookingId: string | null
  token: string
  snapshot: Record<string, unknown>
  createdAt: Date
}

/** A Detlio booking as its bill needs it: the customer's first name, never their phone. */
export interface BookingForBill {
  id: string
  userName: string
  status: string
  scheduledAt: Date
  completedAt: Date | null
  amount: string
  paymentMethod: string
  paymentStatus: string | null
  plate: string | null
  make: string | null
  model: string | null
  washIntervalDays: number | null
  items: Array<{ label: string; amount: string }>
}

export const billsRepository = {
  /** What a bill prints at its head. Never anyone's phone but the garage's own. */
  async garage(vendorId: string) {
    const rows = await db.execute<{
      id: string
      business_name: string
      address: string
      city: string
      pincode: string
      phone: string
      whatsapp: string | null
    }>(sql`SELECT id, business_name, address, city, pincode, phone, whatsapp FROM vendors WHERE id = ${vendorId}`)
    const row = Array.from(rows)[0]
    return row
      ? {
          id: row.id,
          businessName: row.business_name,
          address: row.address,
          city: row.city,
          pincode: row.pincode,
          phone: row.phone,
          whatsapp: row.whatsapp,
        }
      : null
  },

  transaction<T>(work: (tx: Tx) => Promise<T>) {
    return db.transaction(work)
  },

  /** Serialises making the bill for one job, so two taps at once make one bill. */
  async lockJob(tx: Tx, ref: string) {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`garage-bill:${ref}`})::bigint)`)
  },

  async billFor(executor: Tx | typeof db, vendorId: string, target: { kind: 'own' | 'detlio'; id: string }): Promise<BillRow | null> {
    const column = target.kind === 'own' ? sql`garage_job_id` : sql`booking_id`
    const rows = await executor.execute<{
      id: string
      vendor_id: string
      number: number
      garage_job_id: string | null
      booking_id: string | null
      token: string
      snapshot: Record<string, unknown>
      created_at: Date | string
    }>(sql`SELECT * FROM garage_bills WHERE vendor_id = ${vendorId} AND ${column} = ${target.id} LIMIT 1`)
    const row = Array.from(rows)[0]
    return row ? toBill(row) : null
  },

  async billByToken(token: string): Promise<BillRow | null> {
    const rows = await db.execute<{
      id: string
      vendor_id: string
      number: number
      garage_job_id: string | null
      booking_id: string | null
      token: string
      snapshot: Record<string, unknown>
      created_at: Date | string
    }>(sql`SELECT * FROM garage_bills WHERE token = ${token} LIMIT 1`)
    const row = Array.from(rows)[0]
    return row ? toBill(row) : null
  },

  /** The garage's next bill number: 1 for its first, and never one given before. */
  async nextNumber(tx: Tx, vendorId: string) {
    const rows = await tx.execute<{ last_number: number | string }>(sql`
      INSERT INTO garage_bill_counters (vendor_id, last_number) VALUES (${vendorId}, 1)
      ON CONFLICT (vendor_id) DO UPDATE SET last_number = garage_bill_counters.last_number + 1
      RETURNING last_number
    `)
    return num(Array.from(rows)[0]?.last_number)
  },

  async insertBill(
    tx: Tx,
    data: { vendorId: string; number: number; garageJobId: string | null; bookingId: string | null; token: string; snapshot: Record<string, unknown> }
  ) {
    const [row] = await tx.insert(garageBills).values(data).returning()
    return row!
  },

  async updateSnapshot(executor: Tx | typeof db, id: string, snapshot: Record<string, unknown>) {
    await executor.update(garageBills).set({ snapshot, updatedAt: new Date() }).where(eq(garageBills.id, id))
  },

  async bookingForBill(vendorId: string, bookingId: string): Promise<BookingForBill | null> {
    const rows = await db.execute<{
      id: string
      user_name: string
      status: string
      scheduled_at: Date | string
      completed_at: Date | string | null
      amount: string
      payment_method: string
      payment_status: string | null
      plate: string | null
      make: string | null
      model: string | null
      wash_interval_days: number | null
      items: Array<{ label: string; amount: string }> | null
    }>(sql`
      SELECT b.id, u.name AS user_name, b.status, b.scheduled_at, b.completed_at, b.amount - b.convenience_fee AS amount, b.payment_method,
             (SELECT p.status FROM payments p WHERE p.booking_id = b.id ORDER BY p.created_at DESC LIMIT 1) AS payment_status,
             v.license_plate AS plate, v.make, v.model, v.wash_interval_days,
             (SELECT json_agg(json_build_object('label', bi.name, 'amount', bi.amount::text) ORDER BY bi.sort_order)
                FROM booking_items bi WHERE bi.booking_id = b.id) AS items
        FROM bookings b
        JOIN users u ON u.id = b.user_id
        LEFT JOIN user_vehicles v ON v.id = b.vehicle_id
       WHERE b.vendor_id = ${vendorId} AND b.id = ${bookingId}
    `)
    const row = Array.from(rows)[0]
    if (!row) return null
    return {
      id: row.id,
      userName: row.user_name,
      status: row.status,
      scheduledAt: at(row.scheduled_at)!,
      completedAt: at(row.completed_at),
      amount: String(row.amount),
      paymentMethod: row.payment_method,
      paymentStatus: row.payment_status,
      plate: row.plate,
      make: row.make,
      model: row.model,
      washIntervalDays: row.wash_interval_days === null ? null : num(row.wash_interval_days),
      items: row.items ?? [],
    }
  },

  /** How a paid-later customer last paid back, for "Paid by UPI ✓". */
  async lastPaidMethod(vendorId: string, customerId: string) {
    const rows = await db.execute<{ method: 'upi' | 'cash' | null }>(sql`
      SELECT method FROM garage_payments
       WHERE vendor_id = ${vendorId} AND garage_customer_id = ${customerId} AND kind = 'paid'
       ORDER BY created_at DESC LIMIT 1
    `)
    return Array.from(rows)[0]?.method ?? null
  },

  // ─── Payment details ───────────────────────────────────────────────────────

  async paymentDetails(vendorId: string) {
    const [row] = await db.select().from(garagePaymentDetails).where(eq(garagePaymentDetails.vendorId, vendorId)).limit(1)
    return row ?? null
  },

  async savePaymentDetails(
    vendorId: string,
    data: {
      qrKey: string | null
      upiId: string | null
      upiName: string | null
      phone: string | null
      apps: GaragePayApp[]
      showOnBills: boolean
      showOnReminders: boolean
      showOnBookingPage: boolean
    }
  ) {
    await db
      .insert(garagePaymentDetails)
      .values({ vendorId, ...data })
      .onConflictDoUpdate({ target: garagePaymentDetails.vendorId, set: { ...data, updatedAt: new Date() } })
  },
}

function toBill(row: {
  id: string
  vendor_id: string
  number: number
  garage_job_id: string | null
  booking_id: string | null
  token: string
  snapshot: Record<string, unknown> | string
  created_at: Date | string
}): BillRow {
  return {
    id: row.id,
    vendorId: row.vendor_id,
    number: num(row.number),
    garageJobId: row.garage_job_id,
    bookingId: row.booking_id,
    token: row.token,
    snapshot: typeof row.snapshot === 'string' ? (JSON.parse(row.snapshot) as Record<string, unknown>) : row.snapshot,
    createdAt: at(row.created_at)!,
  }
}
