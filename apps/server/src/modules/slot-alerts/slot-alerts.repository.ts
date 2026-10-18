import { and, asc, count, desc, eq, gt, inArray, isNull, lt, sql } from 'drizzle-orm'
import { db } from '../../db/index.js'
import { slotAlerts, users, vendors } from '../../db/schema.js'
import type { BookingType } from '../../lib/booking-types.js'
import type { SlotAlertWindow } from '../../lib/slot-alerts.js'
import { getDayOfWeekFromDate } from '../../lib/slots.js'
import { bookingsRepository } from '../bookings/bookings.repository.js'
import { vendorPageOpen } from '../vendors/vendors.predicates.js'
import { vendorsRepository } from '../vendors/vendors.repository.js'

// "Notify me if a slot opens" (0047). A customer's reads and writes are
// scoped to the user id the service passes, which is always the session's.
// "Waiting" is notified_at IS NULL and expires_at still ahead: the service
// passes `now`, so the rule reads one clock.

/** What an alert row carries for the rules and the screens. */
const ALERT_COLUMNS = {
  id: slotAlerts.id,
  userId: slotAlerts.userId,
  vendorId: slotAlerts.vendorId,
  date: slotAlerts.date,
  window: slotAlerts.timeWindow,
  bookingType: slotAlerts.bookingType,
  durationMins: slotAlerts.durationMins,
  serviceIds: slotAlerts.serviceIds,
  createdAt: slotAlerts.createdAt,
  expiresAt: slotAlerts.expiresAt,
  notifiedAt: slotAlerts.notifiedAt,
}

function waiting(now: Date) {
  return and(isNull(slotAlerts.notifiedAt), gt(slotAlerts.expiresAt, now))
}

export interface NewSlotAlert {
  userId: string
  vendorId: string
  date: string
  window: SlotAlertWindow
  bookingType: BookingType
  durationMins: number
  serviceIds: string[]
  expiresAt: Date
}

export const slotAlertsRepository = {
  findUser(userId: string) {
    return db.query.users.findFirst({
      where: eq(users.id, userId),
      columns: { id: true, status: true },
    })
  },

  /**
   * The garage as the slot rule and the booking type read it, only while
   * customers can open its page (vendorPageOpen: active, verified, not in the
   * Bin; a paused one is returned, and has no slots).
   */
  async findGarage(vendorId: string) {
    const [row] = await db
      .select({
        id: vendors.id,
        businessName: vendors.businessName,
        bookingsPausedAt: vendors.bookingsPausedAt,
        slotIntervalMins: vendors.slotIntervalMins,
        bays: vendors.bays,
        jobsPerDay: vendors.jobsPerDay,
        dropinEnabled: vendors.dropinEnabled,
        doorstepEnabled: vendors.doorstepEnabled,
        pickup: vendors.pickup,
        pickupRadiusKm: vendors.pickupRadiusKm,
        pickupTermsAcceptedAt: vendors.pickupTermsAcceptedAt,
      })
      .from(vendors)
      .where(vendorPageOpen(vendorId))
      .limit(1)
    return row
  },

  /** The garage's live services among these ids (packages included), for the job's length. */
  findServices(vendorId: string, serviceIds: string[]) {
    return vendorsRepository.findPublicServices(vendorId, serviceIds)
  },

  /**
   * The day's facts the slot rule reads: that weekday's hours, a holiday,
   * and the bookings holding capacity (listCapacityHolders, the picker's own
   * read). Plain reads, no locks.
   */
  async readDay(vendorId: string, date: string) {
    const [hours, closure, busy] = await Promise.all([
      vendorsRepository.findWorkingHoursForDay(vendorId, getDayOfWeekFromDate(date)),
      bookingsRepository.findClosure(vendorId, date),
      bookingsRepository.listCapacityHolders({ vendorId, date }),
    ])
    return { hours: hours ?? null, isHoliday: Boolean(closure), busy }
  },

  /**
   * Sets an alert if the customer has room, under a lock on their alerts so
   * two taps at once cannot both take the last place. The one already
   * waiting for this garage and date is updated in place (new window, type
   * and job) rather than added: one per garage and date. `decide` is the
   * service's rule over what was read under the lock; a refusal is passed
   * back and nothing is written.
   *
   * A transaction-scoped advisory lock keyed on the customer
   * (`slot-alerts:<userId>`), taken on its own and never alongside the
   * booking-write locks (like complaints' and favourites').
   */
  setUnderLimit<R extends string>(input: {
    alert: NewSlotAlert
    now: Date
    decide: (facts: { activeCount: number; replacing: boolean }) => R | null
  }) {
    const { alert, now } = input
    return db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`slot-alerts:${alert.userId}`})::bigint)`)

      const [existing] = await tx
        .select({ id: slotAlerts.id, expiresAt: slotAlerts.expiresAt })
        .from(slotAlerts)
        .where(
          and(
            eq(slotAlerts.userId, alert.userId),
            eq(slotAlerts.vendorId, alert.vendorId),
            eq(slotAlerts.date, alert.date),
            isNull(slotAlerts.notifiedAt)
          )
        )
        .limit(1)
      const [counted] = await tx
        .select({ n: count() })
        .from(slotAlerts)
        .where(and(eq(slotAlerts.userId, alert.userId), waiting(now)))

      const refusal = input.decide({ activeCount: Number(counted?.n ?? 0), replacing: Boolean(existing) })
      if (refusal) return { refusal, row: null, replaced: false }

      const values = {
        timeWindow: alert.window,
        bookingType: alert.bookingType,
        durationMins: alert.durationMins,
        serviceIds: alert.serviceIds,
        expiresAt: alert.expiresAt,
      }
      if (existing) {
        const [row] = await tx
          .update(slotAlerts)
          .set({ ...values, createdAt: now, lastCheckedAt: null })
          .where(and(eq(slotAlerts.id, existing.id), isNull(slotAlerts.notifiedAt)))
          .returning(ALERT_COLUMNS)
        return { refusal: null, row: row ?? null, replaced: true }
      }
      const [row] = await tx
        .insert(slotAlerts)
        .values({ ...values, userId: alert.userId, vendorId: alert.vendorId, date: alert.date })
        .returning(ALERT_COLUMNS)
      return { refusal: null, row, replaced: false }
    })
  },

  /** The customer's waiting alerts, soonest day first, with the garage's name. */
  listWaiting(userId: string, now: Date) {
    return db
      .select({ ...ALERT_COLUMNS, vendorName: vendors.businessName })
      .from(slotAlerts)
      .innerJoin(vendors, eq(vendors.id, slotAlerts.vendorId))
      .where(and(eq(slotAlerts.userId, userId), waiting(now)))
      .orderBy(asc(slotAlerts.date), asc(slotAlerts.createdAt))
  },

  /**
   * Cancels one of the customer's waiting alerts. Anyone else's, one already
   * sent, or none at all, deletes nothing: the service answers 404 alike.
   */
  async removeWaiting(userId: string, id: string): Promise<boolean> {
    const rows = await db
      .delete(slotAlerts)
      .where(and(eq(slotAlerts.id, id), eq(slotAlerts.userId, userId), isNull(slotAlerts.notifiedAt)))
      .returning({ id: slotAlerts.id })
    return rows.length > 0
  },

  /** A garage's waiting alerts for one date, oldest first (first set, first told). */
  listWaitingForGarageDay(vendorId: string, date: string, now: Date, limit: number) {
    return db
      .select(ALERT_COLUMNS)
      .from(slotAlerts)
      .where(and(eq(slotAlerts.vendorId, vendorId), eq(slotAlerts.date, date), waiting(now)))
      .orderBy(asc(slotAlerts.createdAt), asc(slotAlerts.id))
      .limit(limit)
  },

  /** The dates a garage has waiting alerts on, soonest first. */
  async listWaitingDatesForGarage(vendorId: string, now: Date, limit: number): Promise<string[]> {
    const rows = await db
      .selectDistinct({ date: slotAlerts.date })
      .from(slotAlerts)
      .where(and(eq(slotAlerts.vendorId, vendorId), waiting(now)))
      .orderBy(asc(slotAlerts.date))
      .limit(limit)
    return rows.map((row) => row.date)
  },

  /**
   * The garage-days with waiting alerts, the longest unchecked first, for the
   * cron's sweep. Bounded.
   */
  listGarageDaysForSweep(now: Date, limit: number) {
    const oldest = sql<Date>`min(coalesce(${slotAlerts.lastCheckedAt}, ${slotAlerts.createdAt}))`
    return db
      .select({ vendorId: slotAlerts.vendorId, date: slotAlerts.date })
      .from(slotAlerts)
      .where(waiting(now))
      .groupBy(slotAlerts.vendorId, slotAlerts.date)
      .orderBy(oldest)
      .limit(limit)
  },

  /**
   * Marks an alert told, about this time. Conditional on it still waiting,
   * so two re-checks at once tell the customer once: the one that gets the
   * row sends.
   */
  async claim(id: string, slotAt: Date, now: Date): Promise<boolean> {
    const rows = await db
      .update(slotAlerts)
      .set({ notifiedAt: now, notifiedSlotAt: slotAt, lastCheckedAt: now })
      .where(and(eq(slotAlerts.id, id), waiting(now)))
      .returning({ id: slotAlerts.id })
    return rows.length > 0
  },

  async markChecked(ids: string[], now: Date) {
    if (ids.length === 0) return
    await db
      .update(slotAlerts)
      .set({ lastCheckedAt: now })
      .where(and(inArray(slotAlerts.id, ids), isNull(slotAlerts.notifiedAt)))
  },

  /** Deletes up to `limit` alerts whose day ended before `before`: told or not. */
  async purgeEndedBefore(before: Date, limit: number): Promise<number> {
    const doomed = db
      .select({ id: slotAlerts.id })
      .from(slotAlerts)
      .where(lt(slotAlerts.expiresAt, before))
      .orderBy(asc(slotAlerts.expiresAt))
      .limit(limit)
    const rows = await db
      .delete(slotAlerts)
      .where(inArray(slotAlerts.id, doomed))
      .returning({ id: slotAlerts.id })
    return rows.length
  },

  /**
   * The customer's alerts told since `since`, newest first, for Updates:
   * the garage's name and the time they were told about. Bounded.
   */
  listToldSince(userId: string, since: Date) {
    return db
      .select({
        id: slotAlerts.id,
        vendorId: slotAlerts.vendorId,
        vendorName: vendors.businessName,
        date: slotAlerts.date,
        bookingType: slotAlerts.bookingType,
        serviceIds: slotAlerts.serviceIds,
        notifiedAt: slotAlerts.notifiedAt,
        notifiedSlotAt: slotAlerts.notifiedSlotAt,
      })
      .from(slotAlerts)
      .innerJoin(vendors, eq(vendors.id, slotAlerts.vendorId))
      .where(and(eq(slotAlerts.userId, userId), gt(slotAlerts.notifiedAt, since)))
      .orderBy(desc(slotAlerts.notifiedAt))
      .limit(20)
  },
}
