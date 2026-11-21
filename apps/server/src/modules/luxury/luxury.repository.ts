import { eq, sql } from 'drizzle-orm'
import { db } from '../../db/index.js'
import { adminAuditLog, luxuryApplications, vendors, type LuxuryApplicationRecord } from '../../db/schema.js'

type Db = typeof db
type Tx = Parameters<Parameters<Db['transaction']>[0]>[0]
type Actor = { sub: string; name: string }

/** The garage as the badge reads it. */
export interface LuxuryVendorRow {
  id: string
  businessName: string
  deletedAt: Date | null
  luxuryApprovedAt: Date | null
  luxuryApprovedBy: string | null
  luxuryBrands: string[] | null
}

const vendorColumns = {
  id: vendors.id,
  businessName: vendors.businessName,
  deletedAt: vendors.deletedAt,
  luxuryApprovedAt: vendors.luxuryApprovedAt,
  luxuryApprovedBy: vendors.luxuryApprovedBy,
  luxuryBrands: vendors.luxuryBrands,
}

export type ApplicationValues = Pick<
  LuxuryApplicationRecord,
  'status' | 'brands' | 'photos' | 'coveredBay' | 'products' | 'staff' | 'sentAt' | 'timesSent' | 'sentBy'
>

function reads(handle: Db | Tx) {
  return {
    async findApplication(vendorId: string): Promise<LuxuryApplicationRecord | undefined> {
      const [row] = await handle.select().from(luxuryApplications).where(eq(luxuryApplications.vendorId, vendorId))
      return row
    },

    /** A garage that was never deleted forever (one in the Bin is returned, with its deletedAt). */
    async findVendor(vendorId: string): Promise<LuxuryVendorRow | undefined> {
      const [row] = await handle
        .select(vendorColumns)
        .from(vendors)
        .where(sql`${vendors.id} = ${vendorId} and ${vendors.purgedAt} is null`)
      return row
    },
  }
}

export const luxuryRepository = {
  ...reads(db),

  /** Every application's status, for the admin Garages list (one read; a row per garage that applied). */
  listApplicationStates(): Promise<Array<Pick<LuxuryApplicationRecord, 'vendorId' | 'status' | 'sentAt' | 'timesSent'>>> {
    return db
      .select({
        vendorId: luxuryApplications.vendorId,
        status: luxuryApplications.status,
        sentAt: luxuryApplications.sentAt,
        timesSent: luxuryApplications.timesSent,
      })
      .from(luxuryApplications)
  },

  /**
   * One garage's luxury write, under `pg_advisory_xact_lock('luxury:<garage>')`
   * so a send and a decision, or two decisions, never cross. The lock is
   * taken on its own, before any read.
   */
  async locked<T>(vendorId: string, work: (w: ReturnType<typeof writes>) => Promise<T>): Promise<T> {
    return db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`luxury:${vendorId}`})::bigint)`)
      return work(writes(tx))
    })
  },
}

function writes(tx: Tx) {
  return {
    ...reads(tx),

    async saveApplication(vendorId: string, values: ApplicationValues): Promise<LuxuryApplicationRecord> {
      const [row] = await tx
        .insert(luxuryApplications)
        .values({ vendorId, ...values })
        .onConflictDoUpdate({
          target: luxuryApplications.vendorId,
          set: { ...values, teamNote: null, updatedAt: sql`now()` },
        })
        .returning()
      return row!
    },

    async decide(
      vendorId: string,
      patch: { status: LuxuryApplicationRecord['status']; teamNote: string | null; decidedBy: string }
    ): Promise<LuxuryApplicationRecord> {
      const [row] = await tx
        .update(luxuryApplications)
        .set({ ...patch, decidedAt: sql`now()`, updatedAt: sql`now()` })
        .where(eq(luxuryApplications.vendorId, vendorId))
        .returning()
      return row!
    },

    /** The badge itself: given (with its brands) or taken away (all null). */
    async setBadge(
      vendorId: string,
      badge: { approvedBy: string; brands: string[] } | null
    ): Promise<void> {
      await tx
        .update(vendors)
        .set(
          badge
            ? { luxuryApprovedAt: sql`now()`, luxuryApprovedBy: badge.approvedBy, luxuryBrands: badge.brands }
            : { luxuryApprovedAt: null, luxuryApprovedBy: null, luxuryBrands: null }
        )
        .where(eq(vendors.id, vendorId))
    },

    async setBrands(vendorId: string, brands: string[]): Promise<void> {
      await tx.update(vendors).set({ luxuryBrands: brands }).where(eq(vendors.id, vendorId))
    },

    async audit(
      action: string,
      actor: Actor,
      garage: { id: string; businessName: string },
      detail: Record<string, unknown>
    ): Promise<void> {
      await tx.insert(adminAuditLog).values({
        action,
        actorSub: actor.sub,
        actorName: actor.name,
        summary: { vendorId: garage.id, garage: garage.businessName },
        detail,
      })
    },
  }
}
