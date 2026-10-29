import { and, asc, eq } from 'drizzle-orm'
import { db } from '../../db/index.js'
import { garageClosureRequests, users, vendors } from '../../db/schema.js'
import { hasPgCode } from '../../lib/errors.js'

export type ClosureRequestRecord = typeof garageClosureRequests.$inferSelect

export const garageClosureRepository = {
  async findGarage(vendorId: string) {
    const [row] = await db
      .select({ id: vendors.id, businessName: vendors.businessName, ownerId: vendors.ownerId, deletedAt: vendors.deletedAt })
      .from(vendors)
      .where(eq(vendors.id, vendorId))
      .limit(1)
    return row ?? null
  },

  async userName(userId: string): Promise<string | null> {
    const [row] = await db.select({ name: users.name }).from(users).where(eq(users.id, userId)).limit(1)
    return row?.name ?? null
  },

  async findOpen(vendorId: string): Promise<ClosureRequestRecord | null> {
    const [row] = await db
      .select()
      .from(garageClosureRequests)
      .where(and(eq(garageClosureRequests.vendorId, vendorId), eq(garageClosureRequests.status, 'open')))
      .limit(1)
    return row ?? null
  },

  /** Null when one is open already (the partial unique index). */
  async insert(values: { vendorId: string; requestedBy: string; requestedByName: string; reason: string }) {
    try {
      const [row] = await db.insert(garageClosureRequests).values(values).returning()
      return row ?? null
    } catch (error) {
      if (hasPgCode(error, '23505')) return null
      throw error
    }
  },

  /** The owner takes it back: conditional on still open. */
  async cancelOpen(vendorId: string, at: Date): Promise<ClosureRequestRecord | null> {
    const [row] = await db
      .update(garageClosureRequests)
      .set({ status: 'cancelled', cancelledAt: at, updatedAt: at })
      .where(and(eq(garageClosureRequests.vendorId, vendorId), eq(garageClosureRequests.status, 'open')))
      .returning()
    return row ?? null
  },

  /** Every open request, oldest first, with the garage's name (admin). */
  listOpen() {
    return db
      .select({ request: garageClosureRequests, garageName: vendors.businessName })
      .from(garageClosureRequests)
      .innerJoin(vendors, eq(vendors.id, garageClosureRequests.vendorId))
      .where(eq(garageClosureRequests.status, 'open'))
      .orderBy(asc(garageClosureRequests.createdAt))
      .limit(200)
  },
}
