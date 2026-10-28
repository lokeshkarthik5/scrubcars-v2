import { and, eq, inArray, isNotNull, isNull, sql } from 'drizzle-orm'
import { db } from '../../db/index.js'
import { adminAuditLog, tierSwitches, vendorCertifications, vendorTierStandings, vendors } from '../../db/schema.js'
import type { Tier } from '../../lib/tiers.js'

export const tiersRepository = {
  /** Admin's per-tier switches; a tier with no row is not here (it reads as on). */
  listSwitches() {
    return db
      .select({ tier: tierSwitches.tier, shown: tierSwitches.shown, updatedAt: tierSwitches.updatedAt, updatedBy: tierSwitches.updatedBy })
      .from(tierSwitches)
  },

  /** One tier on or off for customers, with who did it, and its audit row, together. */
  async setSwitch(tier: Tier, shown: boolean, actor: { sub: string; name: string }) {
    return db.transaction(async (tx) => {
      const [before] = await tx.select({ shown: tierSwitches.shown }).from(tierSwitches).where(eq(tierSwitches.tier, tier))
      await tx
        .insert(tierSwitches)
        .values({ tier, shown, updatedBy: actor.name })
        .onConflictDoUpdate({
          target: tierSwitches.tier,
          set: { shown, updatedBy: actor.name, updatedAt: sql`now()` },
        })
      if (before?.shown !== shown) {
        await tx.insert(adminAuditLog).values({
          action: shown ? 'tier_shown' : 'tier_hidden',
          actorSub: actor.sub,
          actorName: actor.name,
          summary: { tier },
          detail: { shown, before: before?.shown ?? true },
        })
      }
    })
  },

  /** Of these garages, the ones holding Silver (SILVER_GARAGE's column). */
  async listSilverIds(vendorIds: string[]): Promise<Set<string>> {
    if (vendorIds.length === 0) return new Set()
    const rows = await db
      .select({ vendorId: vendorTierStandings.vendorId })
      .from(vendorTierStandings)
      .where(and(inArray(vendorTierStandings.vendorId, vendorIds), isNotNull(vendorTierStandings.silverAt)))
    return new Set(rows.map((row) => row.vendorId))
  },

  /** Of these garages, the ones Detlio Certified, i.e. Gold (CERTIFIED_GARAGE's columns). */
  async listGoldIds(vendorIds: string[]): Promise<Set<string>> {
    if (vendorIds.length === 0) return new Set()
    const rows = await db
      .select({ vendorId: vendorCertifications.vendorId })
      .from(vendorCertifications)
      .where(
        and(
          inArray(vendorCertifications.vendorId, vendorIds),
          isNotNull(vendorCertifications.certifiedAt),
          isNull(vendorCertifications.revokedAt)
        )
      )
    return new Set(rows.map((row) => row.vendorId))
  },

  /** Of these garages, the ones whose medal admin hid. */
  async listHiddenIds(vendorIds: string[]): Promise<Set<string>> {
    if (vendorIds.length === 0) return new Set()
    const rows = await db
      .select({ id: vendors.id })
      .from(vendors)
      .where(and(inArray(vendors.id, vendorIds), eq(vendors.tierHidden, true)))
    return new Set(rows.map((row) => row.id))
  },

  async findGarage(vendorId: string) {
    const [row] = await db
      .select({
        id: vendors.id,
        businessName: vendors.businessName,
        tierHidden: vendors.tierHidden,
        deletedAt: vendors.deletedAt,
        purgedAt: vendors.purgedAt,
      })
      .from(vendors)
      .where(eq(vendors.id, vendorId))
    return row
  },

  /**
   * Hide or show one garage's medal, and its audit row, together. Only a
   * change writes: the same answer twice changes nothing. Undefined when the
   * garage is gone.
   */
  async setHidden(vendorId: string, hidden: boolean, actor: { sub: string; name: string }) {
    return db.transaction(async (tx) => {
      const [before] = await tx
        .select({ tierHidden: vendors.tierHidden, businessName: vendors.businessName })
        .from(vendors)
        .where(eq(vendors.id, vendorId))
        .for('update')
      if (!before) return undefined
      if (before.tierHidden !== hidden) {
        await tx.update(vendors).set({ tierHidden: hidden }).where(eq(vendors.id, vendorId))
        await tx.insert(adminAuditLog).values({
          action: hidden ? 'garage_medal_hidden' : 'garage_medal_shown',
          actorSub: actor.sub,
          actorName: actor.name,
          summary: { vendorId, garage: before.businessName },
          detail: { hidden },
        })
      }
      return { changed: before.tierHidden !== hidden }
    })
  },
}
