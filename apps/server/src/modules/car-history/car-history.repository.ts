import { and, eq, inArray, isNull, sql, type SQL } from 'drizzle-orm'
import { db } from '../../db/index.js'
import { userVehicles, vehicleServiceReminders } from '../../db/schema.js'
import type { CarBooking, ServiceReminderKind } from '../../lib/service-reminders.js'
import type { CarHistoryRow } from '../../lib/car-history.js'

/** A car's bookings are read up to this many rows: years of weekly washes. */
const HISTORY_ROW_CAP = 1000

const toDate = (value: Date | string): Date => (value instanceof Date ? value : new Date(value))
const toDateOrNull = (value: Date | string | null): Date | null => (value === null ? null : toDate(value))
/** A `date` column read through db.execute: "YYYY-MM-DD" (postgres-js may hand back a Date). */
const toDateKey = (value: Date | string | null): string | null =>
  value === null ? null : value instanceof Date ? value.toISOString().slice(0, 10) : value.slice(0, 10)

/**
 * Every category a booking (alias `b`) covered: its items' services, the
 * members of any package among them, and for a booking from before
 * booking_items its single service. Distinct, as text.
 */
export function bookingCategories(): SQL {
  return sql`ARRAY(
    SELECT DISTINCT cats.c FROM (
      SELECT s.category::text AS c
        FROM booking_items bi JOIN services s ON s.id = bi.service_id
       WHERE bi.booking_id = b.id
      UNION ALL
      SELECT ms.category::text
        FROM booking_items bi
        JOIN service_package_items spi ON spi.package_id = bi.service_id
        JOIN services ms ON ms.id = spi.service_id
       WHERE bi.booking_id = b.id
      UNION ALL
      SELECT s.category::text
        FROM services s
       WHERE s.id = b.service_id
         AND NOT EXISTS (SELECT 1 FROM booking_items bi WHERE bi.booking_id = b.id)
    ) cats
  )`
}

/** An open reminder as the service reads it, with what its words need. */
export interface OpenReminderRow {
  id: string
  userId: string
  vehicleId: string
  kind: ServiceReminderKind
  dueOn: string
  snoozedUntil: string | null
  notifiedOn: string | null
  sourceBookingId: string
  /** The garage that did the job that scheduled it. */
  vendorName: string
  /** "Honda City": in the app only, never in a notification. */
  vehicleName: string
  createdAt: Date
}

/** A finished job, as scheduling reads it. */
export interface FinishedJobRow {
  id: string
  userId: string
  vehicleId: string
  status: string
  completedAt: Date | null
  scheduledAt: Date
  categories: string[]
}

type ReminderSqlRow = {
  id: string
  user_id: string
  vehicle_id: string
  kind: ServiceReminderKind
  due_on: Date | string
  snoozed_until: Date | string | null
  notified_on: Date | string | null
  source_booking_id: string
  vendor_name: string
  vehicle_name: string
  created_at: Date | string
}

function toOpenReminder(row: ReminderSqlRow): OpenReminderRow {
  return {
    id: row.id,
    userId: row.user_id,
    vehicleId: row.vehicle_id,
    kind: row.kind,
    dueOn: toDateKey(row.due_on)!,
    snoozedUntil: toDateKey(row.snoozed_until),
    notifiedOn: toDateKey(row.notified_on),
    sourceBookingId: row.source_booking_id,
    vendorName: row.vendor_name,
    vehicleName: row.vehicle_name,
    createdAt: toDate(row.created_at),
  }
}

const REMINDER_COLUMNS = sql`r.id, r.user_id, r.vehicle_id, r.kind, r.due_on, r.snoozed_until, r.notified_on,
       r.source_booking_id, v.business_name AS vendor_name,
       concat_ws(' ', uv.make, uv.model) AS vehicle_name, r.created_at`

export const carHistoryRepository = {
  /** The customer's own car, if it is theirs and not removed (archived). */
  async findOwnCar(userId: string, vehicleId: string) {
    const [car] = await db
      .select({
        id: userVehicles.id,
        make: userVehicles.make,
        model: userVehicles.model,
        color: userVehicles.color,
        licensePlate: userVehicles.licensePlate,
        vehicleType: userVehicles.vehicleType,
        isDefault: userVehicles.isDefault,
      })
      .from(userVehicles)
      .where(and(eq(userVehicles.id, vehicleId), eq(userVehicles.userId, userId), isNull(userVehicles.archivedAt)))
      .limit(1)
    return car
  },

  /**
   * Every booking row for one of the customer's cars, newest slot first, at
   * most HISTORY_ROW_CAP: lib/car-history.ts groups chains and keeps the
   * completed ones. Money in the nested reads is cast to text so "800.00"
   * keeps its decimals.
   */
  async listCarRows(userId: string, vehicleId: string): Promise<Array<CarHistoryRow & { categories: string[] }>> {
    const rows = await db.execute<{
      id: string
      chain_id: string
      reschedule_count: number
      created_at: Date | string
      status: string
      scheduled_at: Date | string
      completed_at: Date | string | null
      booking_type: string
      vendor_id: string
      vendor_name: string
      items: Array<{ name: string; category: string }> | string | null
      package_categories: string[] | null
      categories: string[] | null
      payment_amount: string | null
      payment_status: string | null
      payment_refunded: string | null
      charges_paid: string | null
      photos_before: number
      photos_after: number
    }>(sql`
      SELECT b.id,
             coalesce(b.original_booking_id, b.id) AS chain_id,
             b.reschedule_count,
             b.created_at,
             b.status::text AS status,
             b.scheduled_at,
             b.completed_at,
             b.booking_type::text AS booking_type,
             b.vendor_id,
             v.business_name AS vendor_name,
             coalesce(
               (SELECT json_agg(json_build_object('name', bi.name, 'category', s.category::text)
                                ORDER BY bi.sort_order, bi.created_at)
                  FROM booking_items bi JOIN services s ON s.id = bi.service_id
                 WHERE bi.booking_id = b.id),
               (SELECT json_agg(json_build_object('name', s.name, 'category', s.category::text))
                  FROM services s WHERE s.id = b.service_id)
             ) AS items,
             ARRAY(
               SELECT DISTINCT ms.category::text
                 FROM booking_items bi
                 JOIN service_package_items spi ON spi.package_id = bi.service_id
                 JOIN services ms ON ms.id = spi.service_id
                WHERE bi.booking_id = b.id
             ) AS package_categories,
             ${bookingCategories()} AS categories,
             -- Razorpay's part plus the part paid with Detlio credit (0049)
             -- until it went back as credit, as Statistics reads it.
             (p.amount + CASE WHEN p.credit_returned_at IS NULL THEN p.credit_amount ELSE 0 END)::text
               AS payment_amount,
             p.status::text AS payment_status,
             p.refunded_amount::text AS payment_refunded,
             (SELECT coalesce(sum(c.amount_due - coalesce(c.refunded_amount, 0)), 0)::text
                FROM booking_charges c
               WHERE c.booking_id = b.id AND c.status = 'paid') AS charges_paid,
             (SELECT count(*)::int FROM job_photos jp WHERE jp.booking_id = b.id AND jp.stage = 'before') AS photos_before,
             (SELECT count(*)::int FROM job_photos jp WHERE jp.booking_id = b.id AND jp.stage = 'after') AS photos_after
        FROM bookings b
        JOIN vendors v ON v.id = b.vendor_id
        LEFT JOIN payments p ON p.booking_id = b.id
       WHERE b.user_id = ${userId}
         AND b.vehicle_id = ${vehicleId}
       ORDER BY b.scheduled_at DESC, b.id DESC
       LIMIT ${HISTORY_ROW_CAP}
    `)
    return Array.from(rows).map((row) => ({
      id: row.id,
      chainId: row.chain_id,
      rescheduleCount: row.reschedule_count,
      createdAt: toDate(row.created_at),
      status: row.status,
      scheduledAt: toDate(row.scheduled_at),
      completedAt: toDateOrNull(row.completed_at),
      bookingType: row.booking_type,
      vendorId: row.vendor_id,
      vendorName: row.vendor_name,
      // json is parsed by the driver; a string is parsed here, in case it is not.
      items: typeof row.items === 'string' ? JSON.parse(row.items) : (row.items ?? []),
      packageCategories: row.package_categories ?? [],
      categories: row.categories ?? [],
      payment:
        row.payment_status === null
          ? null
          : { amount: row.payment_amount ?? '0', status: row.payment_status, refundedAmount: row.payment_refunded },
      chargesPaid: row.charges_paid ?? '0',
      photos: { before: row.photos_before, after: row.photos_after },
    }))
  },

  /**
   * The bookings of some cars dated on or after `since` (completion, else
   * slot), for whether a reminder is booked or done. `userId` narrows to one
   * customer's (Home); the cron passes the cars of the reminders it claimed.
   */
  async listCarBookings(
    vehicleIds: string[],
    since: Date,
    userId?: string
  ): Promise<Array<CarBooking & { vehicleId: string }>> {
    if (vehicleIds.length === 0) return []
    const rows = await db.execute<{
      id: string
      vehicle_id: string
      status: string
      scheduled_at: Date | string
      completed_at: Date | string | null
      paid: boolean
      categories: string[] | null
    }>(sql`
      SELECT b.id, b.vehicle_id, b.status::text AS status, b.scheduled_at, b.completed_at,
             coalesce(p.status IN ('paid', 'collected'), false) AS paid,
             ${bookingCategories()} AS categories
        FROM bookings b
        LEFT JOIN payments p ON p.booking_id = b.id
       WHERE b.vehicle_id IN (${sql.join(vehicleIds.map((id) => sql`${id}`), sql`, `)})
         ${userId ? sql`AND b.user_id = ${userId}` : sql``}
         AND b.status IN ('pending', 'confirmed', 'in_progress', 'completed')
         AND coalesce(b.completed_at, b.scheduled_at) >= ${since.toISOString()}::timestamptz
    `)
    return Array.from(rows).map((row) => ({
      id: row.id,
      vehicleId: row.vehicle_id,
      status: row.status,
      scheduledAt: toDate(row.scheduled_at),
      completedAt: toDateOrNull(row.completed_at),
      paid: row.paid === true,
      categories: row.categories ?? [],
    }))
  },

  /**
   * The customer's open reminders on their current cars (a removed car's
   * are kept with it and not shown), optionally for one car.
   */
  async listOpenReminders(userId: string, vehicleId?: string): Promise<OpenReminderRow[]> {
    const rows = await db.execute<ReminderSqlRow>(sql`
      SELECT ${REMINDER_COLUMNS}
        FROM vehicle_service_reminders r
        JOIN user_vehicles uv ON uv.id = r.vehicle_id
        JOIN bookings sb ON sb.id = r.source_booking_id
        JOIN vendors v ON v.id = sb.vendor_id
       WHERE r.user_id = ${userId}
         AND r.status = 'open'
         AND uv.user_id = ${userId}
         AND uv.archived_at IS NULL
         ${vehicleId ? sql`AND r.vehicle_id = ${vehicleId}` : sql``}
       ORDER BY r.due_on ASC, r.created_at ASC
    `)
    return Array.from(rows).map(toOpenReminder)
  },

  /** One of the customer's reminders on a current car, any status; undefined if not theirs. */
  async findOwnReminder(userId: string, reminderId: string) {
    const [row] = await db
      .select({
        id: vehicleServiceReminders.id,
        vehicleId: vehicleServiceReminders.vehicleId,
        status: vehicleServiceReminders.status,
      })
      .from(vehicleServiceReminders)
      .innerJoin(userVehicles, eq(userVehicles.id, vehicleServiceReminders.vehicleId))
      .where(
        and(
          eq(vehicleServiceReminders.id, reminderId),
          eq(vehicleServiceReminders.userId, userId),
          eq(userVehicles.userId, userId),
          isNull(userVehicles.archivedAt)
        )
      )
      .limit(1)
    return row
  },

  /** Dismisses an open reminder of the customer's; answers whether it was open. */
  async dismiss(userId: string, reminderId: string, at: Date): Promise<boolean> {
    const rows = await db
      .update(vehicleServiceReminders)
      .set({ status: 'dismissed', closedAt: at })
      .where(
        and(
          eq(vehicleServiceReminders.id, reminderId),
          eq(vehicleServiceReminders.userId, userId),
          eq(vehicleServiceReminders.status, 'open')
        )
      )
      .returning({ id: vehicleServiceReminders.id })
    return rows.length > 0
  },

  /** Snoozes an open reminder of the customer's to `until`; answers whether it was open. */
  async snooze(userId: string, reminderId: string, until: string): Promise<boolean> {
    const rows = await db
      .update(vehicleServiceReminders)
      .set({ snoozedUntil: until })
      .where(
        and(
          eq(vehicleServiceReminders.id, reminderId),
          eq(vehicleServiceReminders.userId, userId),
          eq(vehicleServiceReminders.status, 'open')
        )
      )
      .returning({ id: vehicleServiceReminders.id })
    return rows.length > 0
  },

  // ─── Scheduling (the completion and the cron) ──────────────────────────────

  /** A booking with what scheduling needs. */
  async findFinishedJob(bookingId: string): Promise<FinishedJobRow | undefined> {
    const rows = await db.execute<{
      id: string
      user_id: string
      vehicle_id: string
      status: string
      completed_at: Date | string | null
      scheduled_at: Date | string
      categories: string[] | null
    }>(sql`
      SELECT b.id, b.user_id, b.vehicle_id, b.status::text AS status, b.completed_at, b.scheduled_at,
             ${bookingCategories()} AS categories
        FROM bookings b
       WHERE b.id = ${bookingId}
    `)
    const row = Array.from(rows)[0]
    if (!row) return undefined
    return {
      id: row.id,
      userId: row.user_id,
      vehicleId: row.vehicle_id,
      status: row.status,
      completedAt: toDateOrNull(row.completed_at),
      scheduledAt: toDate(row.scheduled_at),
      categories: row.categories ?? [],
    }
  },

  /** A car's open reminders, whatever the car's state, for planning a completion. */
  async listOpenRemindersOfCar(vehicleId: string) {
    return db
      .select({
        id: vehicleServiceReminders.id,
        kind: vehicleServiceReminders.kind,
        dueOn: vehicleServiceReminders.dueOn,
        sourceBookingId: vehicleServiceReminders.sourceBookingId,
      })
      .from(vehicleServiceReminders)
      .where(and(eq(vehicleServiceReminders.vehicleId, vehicleId), eq(vehicleServiceReminders.status, 'open')))
  },

  /**
   * Writes a completion's plan in one transaction: the new reminders (a job
   * and kind already written are left as they are), then closes the answered
   * and the replaced ones, each only while still open.
   */
  async applyCompletion(input: {
    job: { id: string; userId: string; vehicleId: string }
    insert: Array<{ kind: ServiceReminderKind; dueOn: string }>
    done: string[]
    superseded: string[]
    at: Date
  }): Promise<{ inserted: number; done: number; superseded: number }> {
    return db.transaction(async (tx) => {
      const inserted =
        input.insert.length === 0
          ? []
          : await tx
              .insert(vehicleServiceReminders)
              .values(
                input.insert.map((reminder) => ({
                  userId: input.job.userId,
                  vehicleId: input.job.vehicleId,
                  kind: reminder.kind,
                  dueOn: reminder.dueOn,
                  sourceBookingId: input.job.id,
                }))
              )
              .onConflictDoNothing({
                target: [vehicleServiceReminders.sourceBookingId, vehicleServiceReminders.kind],
              })
              .returning({ id: vehicleServiceReminders.id })
      const done =
        input.done.length === 0
          ? []
          : await tx
              .update(vehicleServiceReminders)
              .set({ status: 'done', closedAt: input.at, doneBookingId: input.job.id })
              .where(and(inArray(vehicleServiceReminders.id, input.done), eq(vehicleServiceReminders.status, 'open')))
              .returning({ id: vehicleServiceReminders.id })
      const superseded =
        input.superseded.length === 0
          ? []
          : await tx
              .update(vehicleServiceReminders)
              .set({ status: 'superseded', closedAt: input.at })
              .where(
                and(inArray(vehicleServiceReminders.id, input.superseded), eq(vehicleServiceReminders.status, 'open'))
              )
              .returning({ id: vehicleServiceReminders.id })
      return { inserted: inserted.length, done: done.length, superseded: superseded.length }
    })
  },

  /**
   * Completed jobs since `since` with a coating or detailing (a package's
   * members count) that have no reminder written yet: the cron's catch-up
   * for a completion whose own scheduling did not run. Oldest first.
   */
  async listUnscheduledCompletions(since: Date, limit: number): Promise<string[]> {
    const rows = await db.execute<{ id: string }>(sql`
      SELECT b.id
        FROM bookings b
       WHERE b.status = 'completed'
         AND b.completed_at >= ${since.toISOString()}::timestamptz
         AND ${bookingCategories()} && ARRAY['coating', 'detailing']::text[]
         AND NOT EXISTS (SELECT 1 FROM vehicle_service_reminders r WHERE r.source_booking_id = b.id)
       ORDER BY b.completed_at ASC, b.id ASC
       LIMIT ${limit}
    `)
    return Array.from(rows).map((row) => row.id)
  },

  /**
   * Open reminders due `today` (after any snooze) on current cars, not yet
   * sent for today, of active customers with Reminders on and a device to
   * send to. Only narrows: lib/service-reminders.ts decides.
   */
  async listPushCandidates(today: string, limit: number): Promise<OpenReminderRow[]> {
    const rows = await db.execute<ReminderSqlRow>(sql`
      SELECT ${REMINDER_COLUMNS}
        FROM vehicle_service_reminders r
        JOIN user_vehicles uv ON uv.id = r.vehicle_id
        JOIN users u ON u.id = r.user_id
        JOIN bookings sb ON sb.id = r.source_booking_id
        JOIN vendors v ON v.id = sb.vendor_id
       WHERE r.status = 'open'
         AND greatest(r.due_on, coalesce(r.snoozed_until, r.due_on)) = ${today}::date
         AND (r.notified_on IS NULL OR r.notified_on <> ${today}::date)
         AND uv.archived_at IS NULL
         AND u.status = 'active'
         AND u.push_reminders
         AND EXISTS (SELECT 1 FROM push_subscriptions ps
                      WHERE ps.user_id = r.user_id AND ps.audience = 'customer')
       ORDER BY r.created_at ASC, r.id ASC
       LIMIT ${limit}
    `)
    return Array.from(rows).map(toOpenReminder)
  },

  /**
   * Claims today's notification for a reminder. True only for the one
   * caller whose update went in: another run finds it claimed.
   */
  async claimNotified(reminderId: string, today: string): Promise<boolean> {
    const rows = await db
      .update(vehicleServiceReminders)
      .set({ notifiedOn: today })
      .where(
        and(
          eq(vehicleServiceReminders.id, reminderId),
          eq(vehicleServiceReminders.status, 'open'),
          sql`(${vehicleServiceReminders.notifiedOn} IS NULL OR ${vehicleServiceReminders.notifiedOn} <> ${today}::date)`
        )
      )
      .returning({ id: vehicleServiceReminders.id })
    return rows.length > 0
  },
}
