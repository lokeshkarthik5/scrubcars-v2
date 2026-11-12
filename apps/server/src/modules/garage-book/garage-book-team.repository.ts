import { and, asc, eq, inArray, sql } from 'drizzle-orm'
import { db } from '../../db/index.js'
import { garageJobWorkers, garageTeamMembers } from '../../db/schema.js'
import { PAID, num, type Tx } from './garage-book.repository.js'

/**
 * The team's reads and writes (0073): the garage's people, who did which
 * job, and the month's figures per person. Every read is scoped to the
 * garage resolveTenant produced.
 */

export interface MemberRow {
  id: string
  name: string
  role: string | null
  phone: string | null
  offOn: string | null
  createdAt: Date
}

/** A job as the apps name it, once it is known to be this garage's. */
export type JobTarget = { kind: 'own'; id: string } | { kind: 'detlio'; id: string }

const live = sql`${garageTeamMembers.deletedAt} is null`

export const teamRepository = {
  async members(vendorId: string, executor: Tx | typeof db = db): Promise<MemberRow[]> {
    return executor
      .select({
        id: garageTeamMembers.id,
        name: garageTeamMembers.name,
        role: garageTeamMembers.role,
        phone: garageTeamMembers.phone,
        offOn: garageTeamMembers.offOn,
        createdAt: garageTeamMembers.createdAt,
      })
      .from(garageTeamMembers)
      .where(and(eq(garageTeamMembers.vendorId, vendorId), live))
      .orderBy(asc(garageTeamMembers.createdAt))
  },

  async member(vendorId: string, id: string) {
    const [row] = await db
      .select()
      .from(garageTeamMembers)
      .where(and(eq(garageTeamMembers.vendorId, vendorId), eq(garageTeamMembers.id, id), live))
      .limit(1)
    return row ?? null
  },

  async insertMember(data: { vendorId: string; name: string; role: string | null; phone: string | null }) {
    const [row] = await db.insert(garageTeamMembers).values(data).returning()
    return row!
  },

  async updateMember(vendorId: string, id: string, data: Partial<{ name: string; role: string | null; phone: string | null; offOn: string | null }>) {
    if (Object.keys(data).length === 0) return
    await db
      .update(garageTeamMembers)
      .set(data)
      .where(and(eq(garageTeamMembers.vendorId, vendorId), eq(garageTeamMembers.id, id)))
  },

  async deleteMember(vendorId: string, id: string) {
    await db
      .update(garageTeamMembers)
      .set({ deletedAt: new Date() })
      .where(and(eq(garageTeamMembers.vendorId, vendorId), eq(garageTeamMembers.id, id), live))
  },

  // ─── Jobs by ref ───────────────────────────────────────────────────────────

  async ownJobExists(vendorId: string, id: string) {
    const rows = await db.execute<{ ok: boolean }>(sql`
      SELECT EXISTS (SELECT 1 FROM garage_jobs WHERE vendor_id = ${vendorId} AND id = ${id}) AS ok
    `)
    return Boolean(Array.from(rows)[0]?.ok)
  },

  /** A Detlio booking in this garage's book: paid (or collected), not moved to another time. */
  async detlioBookingExists(vendorId: string, id: string) {
    const rows = await db.execute<{ ok: boolean }>(sql`
      SELECT EXISTS (
        SELECT 1 FROM bookings b
         WHERE b.vendor_id = ${vendorId} AND b.id = ${id} AND ${PAID}
           AND b.status IN ('pending', 'confirmed', 'in_progress', 'completed')
      ) AS ok
    `)
    return Boolean(Array.from(rows)[0]?.ok)
  },

  // ─── Who did it ────────────────────────────────────────────────────────────

  transaction<T>(work: (tx: Tx) => Promise<T>) {
    return db.transaction(work)
  },

  async lockTarget(tx: Tx, target: JobTarget) {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`garage-workers:${target.kind}:${target.id}`})::bigint)`)
  },

  async replaceWorkers(tx: Tx, vendorId: string, target: JobTarget, memberIds: string[]) {
    const where =
      target.kind === 'own' ? eq(garageJobWorkers.garageJobId, target.id) : eq(garageJobWorkers.bookingId, target.id)
    await tx.delete(garageJobWorkers).where(and(eq(garageJobWorkers.vendorId, vendorId), where))
    if (memberIds.length === 0) return
    await tx.insert(garageJobWorkers).values(
      memberIds.map((memberId) => ({
        vendorId,
        memberId,
        garageJobId: target.kind === 'own' ? target.id : null,
        bookingId: target.kind === 'detlio' ? target.id : null,
      }))
    )
  },

  /** Who did each job: walk-ins by id, Detlio bookings by id. Members since removed still show by name. */
  async workersFor(vendorId: string, jobIds: string[], bookingIds: string[]) {
    const map = new Map<string, Array<{ id: string; name: string }>>()
    if (jobIds.length === 0 && bookingIds.length === 0) return map
    const rows = await db
      .select({
        memberId: garageJobWorkers.memberId,
        garageJobId: garageJobWorkers.garageJobId,
        bookingId: garageJobWorkers.bookingId,
        name: garageTeamMembers.name,
      })
      .from(garageJobWorkers)
      .innerJoin(garageTeamMembers, eq(garageTeamMembers.id, garageJobWorkers.memberId))
      .where(
        and(
          eq(garageJobWorkers.vendorId, vendorId),
          sql`(${jobIds.length > 0 ? inArray(garageJobWorkers.garageJobId, jobIds) : sql`false`}
               OR ${bookingIds.length > 0 ? inArray(garageJobWorkers.bookingId, bookingIds) : sql`false`})`
        )
      )
      .orderBy(asc(garageJobWorkers.createdAt))
    for (const row of rows) {
      const key = row.garageJobId ? `own:${row.garageJobId}` : `detlio:${row.bookingId}`
      const list = map.get(key) ?? []
      list.push({ id: row.memberId, name: row.name })
      map.set(key, list)
    }
    return map
  },

  // ─── The month's figures per person ────────────────────────────────────────

  /** Finished jobs each person was on between two instants, and what those jobs came to. */
  async work(vendorId: string, start: Date, end: Date) {
    const from = sql`${start.toISOString()}::timestamptz`
    const to = sql`${end.toISOString()}::timestamptz`
    const rows = await db.execute<{ member_id: string; jobs: number | string; value: number | string }>(sql`
      SELECT w.member_id, count(*) AS jobs, coalesce(sum(x.paise), 0) AS value
        FROM garage_job_workers w
        JOIN LATERAL (
          SELECT j.total_paise::bigint AS paise FROM garage_jobs j
           WHERE j.id = w.garage_job_id AND j.status = 'done' AND j.done_at >= ${from} AND j.done_at < ${to}
          UNION ALL
          SELECT round(b.amount * 100)::bigint FROM bookings b
           WHERE b.id = w.booking_id AND b.status = 'completed'
             AND coalesce(b.completed_at, b.scheduled_at) >= ${from} AND coalesce(b.completed_at, b.scheduled_at) < ${to}
        ) x ON true
       WHERE w.vendor_id = ${vendorId}
       GROUP BY w.member_id
    `)
    return new Map(Array.from(rows).map((row) => [row.member_id, { jobs: num(row.jobs), valuePaise: num(row.value) }]))
  },

  /** Jobs each person is on that start between two instants (today), not cancelled. */
  async jobsBetween(vendorId: string, start: Date, end: Date) {
    const from = sql`${start.toISOString()}::timestamptz`
    const to = sql`${end.toISOString()}::timestamptz`
    const rows = await db.execute<{ member_id: string; n: number | string }>(sql`
      SELECT w.member_id, count(*) AS n
        FROM garage_job_workers w
        LEFT JOIN garage_jobs j ON j.id = w.garage_job_id
        LEFT JOIN bookings b ON b.id = w.booking_id
       WHERE w.vendor_id = ${vendorId}
         AND ((j.id IS NOT NULL AND j.status <> 'cancelled' AND j.scheduled_at >= ${from} AND j.scheduled_at < ${to})
           OR (b.id IS NOT NULL AND b.status IN ('pending', 'confirmed', 'in_progress', 'completed')
               AND b.scheduled_at >= ${from} AND b.scheduled_at < ${to}))
       GROUP BY w.member_id
    `)
    return new Map(Array.from(rows).map((row) => [row.member_id, num(row.n)]))
  },

  /** The job each person is on right now (in progress), if any: the car and the first service. Never a phone. */
  async onNow(vendorId: string) {
    const rows = await db.execute<{
      member_id: string
      ref: string
      plate: string | null
      make: string | null
      model: string | null
      service: string | null
    }>(sql`
      SELECT DISTINCT ON (w.member_id) w.member_id,
             coalesce('own:' || j.id, 'detlio:' || b.id) AS ref,
             coalesce(car.plate, v.license_plate) AS plate,
             coalesce(car.make, v.make) AS make,
             coalesce(car.model, v.model) AS model,
             coalesce(
               (SELECT l.label FROM garage_job_lines l WHERE l.job_id = j.id ORDER BY l.id LIMIT 1),
               (SELECT bi.name FROM booking_items bi WHERE bi.booking_id = b.id ORDER BY bi.sort_order LIMIT 1)
             ) AS service
        FROM garage_job_workers w
        LEFT JOIN garage_jobs j ON j.id = w.garage_job_id AND j.status = 'in_progress'
        LEFT JOIN garage_customer_cars car ON car.id = j.car_id
        LEFT JOIN bookings b ON b.id = w.booking_id AND b.status = 'in_progress'
        LEFT JOIN user_vehicles v ON v.id = b.vehicle_id
       WHERE w.vendor_id = ${vendorId} AND (j.id IS NOT NULL OR b.id IS NOT NULL)
       ORDER BY w.member_id, w.created_at DESC
    `)
    return new Map(
      Array.from(rows).map((row) => [
        row.member_id,
        { ref: row.ref, plate: row.plate, make: row.make, model: row.model, service: row.service },
      ])
    )
  },

  /** Advances and salary paid to each person between two IST dates (expenses with a member). */
  async pay(vendorId: string, startDate: string, endDate: string) {
    const rows = await db.execute<{ member_id: string; advance: number | string; salary: number | string }>(sql`
      SELECT member_id,
             coalesce(sum(amount_paise) FILTER (WHERE category = 'advance'), 0) AS advance,
             coalesce(sum(amount_paise) FILTER (WHERE category = 'salary'), 0) AS salary
        FROM garage_expenses
       WHERE vendor_id = ${vendorId} AND deleted_at IS NULL AND member_id IS NOT NULL
         AND spent_on >= ${startDate}::date AND spent_on < ${endDate}::date
       GROUP BY member_id
    `)
    return new Map(Array.from(rows).map((row) => [row.member_id, { advancePaise: num(row.advance), salaryPaise: num(row.salary) }]))
  },

  async count(vendorId: string) {
    const rows = await db.execute<{ n: number | string }>(sql`
      SELECT count(*) AS n FROM garage_team_members WHERE vendor_id = ${vendorId} AND deleted_at IS NULL
    `)
    return num(Array.from(rows)[0]?.n)
  },
}
