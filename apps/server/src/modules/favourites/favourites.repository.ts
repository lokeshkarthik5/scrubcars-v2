import { and, count, desc, eq, sql } from 'drizzle-orm'
import { db } from '../../db/index.js'
import { userFavouriteVendors, users, vendors } from '../../db/schema.js'
import { vendorPageOpen, vendorPagesOpen } from '../vendors/vendors.predicates.js'

// A customer's saved garages (0039). Every read and write here is scoped to
// the user id the service passes, which is always the session's.

export const favouritesRepository = {
  findUser(userId: string) {
    return db.query.users.findFirst({
      where: eq(users.id, userId),
      columns: { id: true, status: true },
    })
  },

  /**
   * The customer's saved garages that customers can open (active, verified,
   * not in the Bin: the garage page's own rule), newest saved first, with
   * whether each is paused. A garage that left the app stays saved, unseen,
   * and comes back if it returns.
   */
  listOpen(userId: string) {
    return db
      .select({ vendorId: userFavouriteVendors.vendorId, pausedAt: vendors.bookingsPausedAt })
      .from(userFavouriteVendors)
      .innerJoin(vendors, eq(vendors.id, userFavouriteVendors.vendorId))
      .where(and(eq(userFavouriteVendors.userId, userId), vendorPagesOpen()))
      .orderBy(desc(userFavouriteVendors.createdAt), userFavouriteVendors.vendorId)
  },

  /** Whether customers can open this garage's page, which is what may be saved. */
  async garageOpen(vendorId: string): Promise<boolean> {
    const [row] = await db.select({ id: vendors.id }).from(vendors).where(vendorPageOpen(vendorId)).limit(1)
    return Boolean(row)
  },

  /**
   * Saves a garage if the customer has room, under a lock on their saves so
   * two taps at once cannot both take the last place. `decide` is the
   * service's rule, given what was read under the lock; a refusal it returns
   * is passed back and nothing is written. Saving one already saved writes
   * nothing and keeps when it was first saved.
   *
   * A transaction-scoped advisory lock keyed on the customer, taken on its
   * own and never alongside the booking-write locks (like complaints').
   */
  saveUnderLimit<R extends string>(input: {
    userId: string
    vendorId: string
    decide: (facts: { alreadySaved: boolean; count: number }) => R | null
  }): Promise<{ refusal: R | null }> {
    return db.transaction(async (tx) => {
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtext(${`favourites:${input.userId}`})::bigint)`
      )

      const [existing] = await tx
        .select({ vendorId: userFavouriteVendors.vendorId })
        .from(userFavouriteVendors)
        .where(
          and(eq(userFavouriteVendors.userId, input.userId), eq(userFavouriteVendors.vendorId, input.vendorId))
        )
        .limit(1)
      const [counted] = await tx
        .select({ n: count() })
        .from(userFavouriteVendors)
        .innerJoin(vendors, eq(vendors.id, userFavouriteVendors.vendorId))
        .where(and(eq(userFavouriteVendors.userId, input.userId), vendorPagesOpen()))

      const refusal = input.decide({ alreadySaved: Boolean(existing), count: Number(counted?.n ?? 0) })
      if (refusal) return { refusal }

      await tx
        .insert(userFavouriteVendors)
        .values({ userId: input.userId, vendorId: input.vendorId })
        .onConflictDoNothing()
      return { refusal: null }
    })
  },

  /** Unsaves a garage. Nothing to remove is not an error: DELETE is idempotent. */
  async remove(userId: string, vendorId: string) {
    await db
      .delete(userFavouriteVendors)
      .where(and(eq(userFavouriteVendors.userId, userId), eq(userFavouriteVendors.vendorId, vendorId)))
  },
}
