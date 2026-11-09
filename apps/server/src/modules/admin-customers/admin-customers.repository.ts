import { and, count, desc, eq, gt, ilike, isNull, like, or, type SQL } from 'drizzle-orm'
import { db } from '../../db/index.js'
import { bookings, rewardStamps, rewardVouchers, users } from '../../db/schema.js'

/** The most rows one search returns: the page is for finding one person. */
const SEARCH_LIMIT = 50

const CUSTOMER_COLUMNS = {
  id: users.id,
  name: users.name,
  phone: users.phone,
  createdAt: users.createdAt,
  deletedAt: users.deletedAt,
}

export const adminCustomersRepository = {
  /**
   * Customers whose phone holds these digits or whose name holds these
   * words, newest first; with neither, the newest. Deleted accounts are left
   * out (their name and number are gone).
   */
  search(input: { digits: string; words: string }) {
    const match: SQL[] = []
    if (input.digits.length >= 3) match.push(like(users.phone, `%${input.digits}%`))
    if (input.words.length >= 2) match.push(ilike(users.name, `%${input.words.replace(/[%_\\]/g, '')}%`))
    return db
      .select(CUSTOMER_COLUMNS)
      .from(users)
      .where(and(eq(users.isCustomer, true), isNull(users.deletedAt), match.length > 0 ? or(...match) : undefined))
      .orderBy(desc(users.createdAt))
      .limit(SEARCH_LIMIT)
  },

  async findCustomer(id: string) {
    const [row] = await db
      .select(CUSTOMER_COLUMNS)
      .from(users)
      .where(and(eq(users.id, id), eq(users.isCustomer, true)))
      .limit(1)
    return row
  },

  async countBookings(userId: string): Promise<number> {
    const [row] = await db.select({ n: count() }).from(bookings).where(eq(bookings.userId, userId))
    return row?.n ?? 0
  },

  /** Stamps still on their Shine Card (not voided, not lapsed), and reward vouchers issued. */
  async rewardCounts(userId: string, now: Date) {
    const [stamps] = await db
      .select({ n: count() })
      .from(rewardStamps)
      .where(and(eq(rewardStamps.userId, userId), isNull(rewardStamps.voidedAt), gt(rewardStamps.expiresAt, now)))
    const [vouchers] = await db.select({ n: count() }).from(rewardVouchers).where(eq(rewardVouchers.userId, userId))
    return { stamps: stamps?.n ?? 0, vouchers: vouchers?.n ?? 0 }
  },
}
