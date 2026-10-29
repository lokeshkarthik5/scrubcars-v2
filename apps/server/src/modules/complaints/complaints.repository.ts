import { and, asc, count, desc, eq, gte, inArray, lt, or, sql, type SQL } from 'drizzle-orm'
import { db } from '../../db/index.js'
import { bookings, complaints, users, vendors } from '../../db/schema.js'
import type { ComplaintStatus } from '../../lib/complaints.js'

export type ComplaintRecord = typeof complaints.$inferSelect
export type ComplaintInsert = typeof complaints.$inferInsert

/** The admin list's filters, as the service hands them over. */
export type ComplaintListFilter = 'open' | 'overdue' | 'resolved' | 'all'

/** The two received times the overdue rule compares against (lib/complaints.ts overdueCutoffs). */
export interface OverdueCutoffs {
  openReceivedBefore: Date
  unfinishedReceivedBefore: Date
}

const UNFINISHED: ComplaintStatus[] = ['open', 'acknowledged']
const FINISHED: ComplaintStatus[] = ['resolved', 'closed']

/**
 * Overdue, as SQL: the same rule as complaintOverdue, with the cutoffs worked
 * out in TypeScript. The clock runs from when the complaint was received.
 */
function overdueWhere(cutoffs: OverdueCutoffs): SQL {
  return or(
    and(eq(complaints.status, 'open'), lt(complaints.receivedAt, cutoffs.openReceivedBefore)),
    and(inArray(complaints.status, UNFINISHED), lt(complaints.receivedAt, cutoffs.unfinishedReceivedBefore))
  )!
}

function filterWhere(filter: ComplaintListFilter, cutoffs: OverdueCutoffs): SQL | undefined {
  switch (filter) {
    case 'open':
      return inArray(complaints.status, UNFINISHED)
    case 'overdue':
      return overdueWhere(cutoffs)
    case 'resolved':
      return inArray(complaints.status, FINISHED)
    case 'all':
      return undefined
  }
}

/** A complaint with what admin shows beside it: whether the account is still there, and the booking. */
const adminColumns = {
  complaint: complaints,
  // A deleted account (0066) keeps its row, blanked: it counts as gone.
  accountExists: sql<boolean>`${users.id} is not null and ${users.deletedAt} is null`,
  bookingScheduledAt: bookings.scheduledAt,
  bookingStatus: bookings.status,
}

export type AdminComplaintRow = {
  complaint: ComplaintRecord
  accountExists: boolean
  bookingScheduledAt: Date | null
  bookingStatus: string | null
}

export const complaintsRepository = {
  /** The account raising a complaint: its name and phone are snapshotted onto the row. */
  findCustomer(userId: string) {
    return db.query.users.findFirst({
      where: eq(users.id, userId),
      columns: { id: true, name: true, phone: true, status: true },
    })
  },

  /**
   * A booking the complaint may be about: only one of this customer's own.
   * Someone else's booking reads as no booking, so the answer never says
   * whether it exists.
   */
  async findOwnBooking(userId: string, bookingId: string) {
    const [row] = await db
      .select({ id: bookings.id, vendorId: bookings.vendorId, garageName: vendors.businessName })
      .from(bookings)
      .leftJoin(vendors, eq(vendors.id, bookings.vendorId))
      .where(and(eq(bookings.id, bookingId), eq(bookings.userId, userId)))
      .limit(1)
    return row ?? null
  },

  /**
   * Inserts a complaint if the customer has room for one, under a lock on
   * their complaints so two taps at the same moment cannot both take the
   * last place. `decide` is the service's rule, given the counts read under
   * the lock: a refusal it returns is passed back and nothing is written.
   *
   * The lock is a transaction-scoped advisory lock keyed on the customer,
   * taken on its own and never alongside the booking-write locks, so it sits
   * outside their order (like service media's). The number comes from the
   * sequence as the row is written.
   */
  insertUnderLimits<R extends string>(input: {
    userId: string
    values: Omit<ComplaintInsert, 'userId'>
    /** The start of the hour the per-hour limit counts. */
    since: Date
    decide: (counts: { unfinished: number; lastHour: number }) => R | null
  }): Promise<{ created: ComplaintRecord } | { created: null; refusal: R }> {
    return db.transaction(async (tx) => {
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtext(${`complaints:${input.userId}`})::bigint)`
      )

      const [counts] = await tx
        .select({
          unfinished: sql<number>`count(*) filter (where ${inArray(complaints.status, UNFINISHED)})`,
          lastHour: sql<number>`count(*) filter (where ${gte(complaints.createdAt, input.since)})`,
        })
        .from(complaints)
        .where(eq(complaints.userId, input.userId))

      const refusal = input.decide({
        unfinished: Number(counts?.unfinished ?? 0),
        lastHour: Number(counts?.lastHour ?? 0),
      })
      if (refusal) return { created: null, refusal }

      const [created] = await tx
        .insert(complaints)
        .values({ ...input.values, userId: input.userId })
        .returning()
      return { created }
    })
  },

  /**
   * A complaint the team logged from a call or a message. No per-customer
   * limits and so no lock: the team is not a script. `receivedAt` is never
   * later than the database's own now(), which the received_at CHECK
   * compares against created_at (the app's clock and the database's can
   * differ by a moment).
   */
  async insertLogged(values: Omit<ComplaintInsert, 'source' | 'receivedAt' | 'loggedBy'> & {
    source: Exclude<ComplaintRecord['source'], 'app'>
    receivedAt: Date
    loggedBy: string
  }): Promise<ComplaintRecord> {
    const [created] = await db
      .insert(complaints)
      .values({
        ...values,
        receivedAt: sql`least(${values.receivedAt.toISOString()}::timestamptz, now())`,
      })
      .returning()
    return created!
  },

  /** The account with this phone (users.phone is unique, ten digits), whatever its kind. */
  findUserByPhone(phone: string) {
    return db.query.users.findFirst({
      where: eq(users.phone, phone),
      columns: { id: true, name: true, phone: true },
    })
  },

  /**
   * Bookings whose 8-character reference (the first eight characters of the
   * id) is this one. Almost always one; two at most in practice, which the
   * service tells apart by the customer or refuses. A cast and a prefix
   * match, so not indexed: pilot-sized, and only when the team types one.
   */
  findBookingsByReference(reference: string) {
    return db
      .select({
        id: bookings.id,
        userId: bookings.userId,
        vendorId: bookings.vendorId,
        garageName: vendors.businessName,
        scheduledAt: bookings.scheduledAt,
        status: bookings.status,
      })
      .from(bookings)
      .leftJoin(vendors, eq(vendors.id, bookings.vendorId))
      .where(sql`${bookings.id}::text like ${`${reference}%`}`)
      .limit(5)
  },

  /** The customer's own complaints, newest first by when we received them. */
  listForCustomer(userId: string, limit: number) {
    return db
      .select()
      .from(complaints)
      .where(eq(complaints.userId, userId))
      .orderBy(desc(complaints.receivedAt), desc(complaints.number))
      .limit(limit)
  },

  /** One filter of the admin list, oldest or newest first. */
  async listForAdmin(input: {
    filter: ComplaintListFilter
    cutoffs: OverdueCutoffs
    order: 'oldest' | 'newest'
    limit: number
  }): Promise<AdminComplaintRow[]> {
    const rows = await db
      .select(adminColumns)
      .from(complaints)
      .leftJoin(users, eq(users.id, complaints.userId))
      .leftJoin(bookings, eq(bookings.id, complaints.bookingId))
      .where(filterWhere(input.filter, input.cutoffs))
      // By when it was received: the clock's own order, so a call logged
      // late sits where its time puts it.
      .orderBy(
        input.order === 'oldest' ? asc(complaints.receivedAt) : desc(complaints.receivedAt),
        asc(complaints.number)
      )
      .limit(input.limit)
    return rows.map((row) => ({ ...row, accountExists: Boolean(row.accountExists) }))
  },

  /** How many each filter holds, in one read. */
  async countForAdmin(cutoffs: OverdueCutoffs) {
    const [row] = await db
      .select({
        open: sql<number>`count(*) filter (where ${inArray(complaints.status, UNFINISHED)})`,
        overdue: sql<number>`count(*) filter (where ${overdueWhere(cutoffs)})`,
        resolved: sql<number>`count(*) filter (where ${inArray(complaints.status, FINISHED)})`,
        all: count(),
      })
      .from(complaints)
    return {
      open: Number(row?.open ?? 0),
      overdue: Number(row?.overdue ?? 0),
      resolved: Number(row?.resolved ?? 0),
      all: Number(row?.all ?? 0),
    }
  },

  async findForAdmin(id: string): Promise<AdminComplaintRow | null> {
    const [row] = await db
      .select(adminColumns)
      .from(complaints)
      .leftJoin(users, eq(users.id, complaints.userId))
      .leftJoin(bookings, eq(bookings.id, complaints.bookingId))
      .where(eq(complaints.id, id))
      .limit(1)
    return row ? { ...row, accountExists: Boolean(row.accountExists) } : null
  },

  /**
   * Moves a complaint on, only from the statuses given (the service's rule):
   * two people pressing at once, or a press on a page that is out of date,
   * changes nothing the second time. Null when it was not in one of them, or
   * does not exist.
   *
   * Resolving or closing an open complaint is its response, so the
   * acknowledgement is stamped then too, unless it already has one.
   */
  async moveTo(
    id: string,
    from: readonly ComplaintStatus[],
    to:
      | { status: 'acknowledged'; by: string; at: Date }
      | { status: 'resolved'; by: string; at: Date; resolutionNote: string }
      | { status: 'closed'; by: string; at: Date; resolutionNote?: string }
  ) {
    const at = to.at.toISOString()
    const acknowledgement = {
      acknowledgedAt: sql`coalesce(${complaints.acknowledgedAt}, ${at}::timestamptz)`,
      acknowledgedBy: sql`coalesce(${complaints.acknowledgedBy}, ${to.by})`,
    }
    const values =
      to.status === 'acknowledged'
        ? { status: to.status, acknowledgedAt: to.at, acknowledgedBy: to.by }
        : to.status === 'resolved'
          ? {
              status: to.status,
              ...acknowledgement,
              resolvedAt: to.at,
              resolvedBy: to.by,
              resolutionNote: to.resolutionNote,
            }
          : {
              status: to.status,
              ...acknowledgement,
              closedAt: to.at,
              closedBy: to.by,
              ...(to.resolutionNote !== undefined ? { resolutionNote: to.resolutionNote } : {}),
            }
    const [row] = await db
      .update(complaints)
      .set({ ...values, updatedAt: to.at })
      .where(and(eq(complaints.id, id), inArray(complaints.status, [...from])))
      .returning({ id: complaints.id })
    return row ?? null
  },

  /** Whether a complaint exists, to tell "not found" from "already done". */
  async exists(id: string): Promise<boolean> {
    const [row] = await db.select({ id: complaints.id }).from(complaints).where(eq(complaints.id, id)).limit(1)
    return Boolean(row)
  },

  async setAdminNote(id: string, adminNote: string | null) {
    const [row] = await db
      .update(complaints)
      .set({ adminNote, updatedAt: new Date() })
      .where(eq(complaints.id, id))
      .returning({ id: complaints.id })
    return row ?? null
  },

  findUserById(id: string) {
    return db.query.users.findFirst({ where: eq(users.id, id), columns: { name: true, phone: true } })
  },
}
