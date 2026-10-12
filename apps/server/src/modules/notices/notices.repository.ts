import { and, count, desc, eq, gte, inArray, lte, sql } from 'drizzle-orm'
import { db } from '../../db/index.js'
import { bookings, noticeDismissals, notices, users, vendors } from '../../db/schema.js'

export type NoticeRecord = typeof notices.$inferSelect
export type NoticeInsert = typeof notices.$inferInsert

export const noticesRepository = {
  /** Every notice, newest first, with how many customers closed each one. */
  async listNotices() {
    const rows = await db
      .select({
        notice: notices,
        vendorName: vendors.businessName,
        dismissals: sql<number>`(
          select count(*) from notice_dismissals d where d.notice_id = ${notices.id}
        )`,
      })
      .from(notices)
      .leftJoin(vendors, eq(vendors.id, notices.vendorId))
      .orderBy(desc(notices.startsAt), desc(notices.createdAt))
      // Notices are never deleted, so the list grows; the newest are what
      // ops works with.
      .limit(200)
    return rows.map((row) => ({
      ...row.notice,
      vendorName: row.vendorName,
      dismissals: Number(row.dismissals),
    }))
  },

  async findNotice(id: string) {
    const [row] = await db
      .select({ notice: notices, vendorName: vendors.businessName })
      .from(notices)
      .leftJoin(vendors, eq(vendors.id, notices.vendorId))
      .where(eq(notices.id, id))
    if (!row) return null
    const [dismissed] = await db
      .select({ value: count() })
      .from(noticeDismissals)
      .where(eq(noticeDismissals.noticeId, id))
    return { ...row.notice, vendorName: row.vendorName, dismissals: Number(dismissed?.value ?? 0) }
  },

  async createNotice(values: NoticeInsert) {
    const [row] = await db.insert(notices).values(values).returning()
    return row
  },

  async updateNotice(id: string, values: Partial<NoticeInsert>) {
    const [row] = await db
      .update(notices)
      .set({ ...values, updatedAt: new Date() })
      .where(eq(notices.id, id))
      .returning()
    return row
  },

  async vendorExists(vendorId: string): Promise<boolean> {
    const row = await db.query.vendors.findFirst({
      where: eq(vendors.id, vendorId),
      columns: { id: true },
    })
    return Boolean(row)
  },

  /** Signed-up customers who can use the app: who an 'all' notice reaches. */
  async countCustomers(): Promise<number> {
    const [row] = await db
      .select({ value: count() })
      .from(users)
      .where(and(eq(users.isCustomer, true), eq(users.status, 'active')))
    return Number(row?.value ?? 0)
  },

  /**
   * Customers with a booking still to happen (or under way) in the window,
   * optionally at one garage: who a booking-window notice reaches.
   */
  async countCustomersWithBookingBetween(input: { from: Date; to: Date; vendorId?: string }) {
    const [row] = await db
      .select({ value: sql<number>`count(distinct ${bookings.userId})` })
      .from(bookings)
      .where(
        and(
          inArray(bookings.status, ['pending', 'confirmed', 'in_progress']),
          gte(bookings.scheduledAt, input.from),
          lte(bookings.scheduledAt, input.to),
          input.vendorId ? eq(bookings.vendorId, input.vendorId) : undefined
        )
      )
    return Number(row?.value ?? 0)
  },

  findUserById(id: string) {
    return db.query.users.findFirst({ where: eq(users.id, id), columns: { name: true, phone: true } })
  },
}
