import { desc, eq, inArray, sql } from 'drizzle-orm'
import { db } from '../../db/index.js'
import { adminAuditLog, agreementAcceptances, agreementVersions, users, vendors } from '../../db/schema.js'

export type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0]
type Conn = typeof db | Tx

export type AgreementVersionRecord = typeof agreementVersions.$inferSelect
export type AgreementAcceptanceRecord = typeof agreementAcceptances.$inferSelect

/** Reads, through the plain connection or the transaction. */
function reads(conn: Conn) {
  return {
    /** The version garages are asked to accept: the highest. */
    async latest(): Promise<AgreementVersionRecord | undefined> {
      const [row] = await conn.select().from(agreementVersions).orderBy(desc(agreementVersions.version)).limit(1)
      return row
    },

    /** Every version, newest first, with how many garages accepted each. */
    async listVersions() {
      return conn
        .select({
          id: agreementVersions.id,
          version: agreementVersions.version,
          fileUrl: agreementVersions.fileUrl,
          sizeBytes: agreementVersions.sizeBytes,
          note: agreementVersions.note,
          publishedAt: agreementVersions.publishedAt,
          publishedBy: agreementVersions.publishedBy,
          acceptances: sql<number>`(SELECT count(*)::int FROM agreement_acceptances aa WHERE aa.version_id = ${agreementVersions.id})`,
        })
        .from(agreementVersions)
        .orderBy(desc(agreementVersions.version))
    },

    /** Each of these garages' highest accepted version (absent: none). */
    async acceptedVersions(vendorIds: string[]): Promise<Map<string, number>> {
      if (vendorIds.length === 0) return new Map()
      const rows = await conn
        .select({
          vendorId: agreementAcceptances.vendorId,
          version: sql<number>`max(${agreementAcceptances.version})::int`,
        })
        .from(agreementAcceptances)
        .where(inArray(agreementAcceptances.vendorId, vendorIds))
        .groupBy(agreementAcceptances.vendorId)
      return new Map(rows.map((row) => [row.vendorId, row.version]))
    },

    /** A garage's acceptances, newest version first: what, when and who. */
    listAcceptances(vendorId: string) {
      return conn
        .select({
          version: agreementAcceptances.version,
          acceptedAt: agreementAcceptances.acceptedAt,
          acceptedByName: agreementAcceptances.acceptedByName,
        })
        .from(agreementAcceptances)
        .where(eq(agreementAcceptances.vendorId, vendorId))
        .orderBy(desc(agreementAcceptances.version))
    },

    async findAcceptance(vendorId: string, versionId: string): Promise<AgreementAcceptanceRecord | undefined> {
      const [row] = await conn
        .select()
        .from(agreementAcceptances)
        .where(sql`${agreementAcceptances.vendorId} = ${vendorId} AND ${agreementAcceptances.versionId} = ${versionId}`)
      return row
    },

    /** The name and phone on the account accepting, for the record. */
    async findUser(userId: string) {
      const [row] = await conn.select({ name: users.name, phone: users.phone }).from(users).where(eq(users.id, userId))
      return row
    },

    async findGarage(vendorId: string) {
      const [row] = await conn
        .select({ id: vendors.id, businessName: vendors.businessName, deletedAt: vendors.deletedAt })
        .from(vendors)
        .where(eq(vendors.id, vendorId))
      return row
    },
  }
}

/** The writes, inside a transaction. */
function writes(tx: Tx) {
  return {
    /**
     * One publish at a time: `pg_advisory_xact_lock('agreements:publish')`,
     * taken on its own, so two admins can never publish the same version.
     */
    async lockPublishing() {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext('agreements:publish')::bigint)`)
    },

    async insertVersion(values: {
      version: number
      fileKey: string
      fileUrl: string
      sizeBytes: number
      note: string | null
      publishedBy: string
      publishedBySub: string
    }): Promise<AgreementVersionRecord> {
      const [row] = await tx.insert(agreementVersions).values(values).returning()
      return row!
    },

    /** The acceptance, once per garage and version; undefined when it was already there. */
    async insertAcceptance(values: {
      vendorId: string
      versionId: string
      version: number
      userId: string
      acceptedByName: string
      ipHash: string | null
    }): Promise<AgreementAcceptanceRecord | undefined> {
      const [row] = await tx.insert(agreementAcceptances).values(values).onConflictDoNothing().returning()
      return row
    },

    async insertAudit(entry: {
      action: 'agreement_published'
      actorSub: string
      actorName: string
      summary: Record<string, unknown>
      detail: Record<string, unknown>
    }) {
      await tx.insert(adminAuditLog).values(entry)
    },
  }
}

export type AgreementsWork = ReturnType<typeof reads> & ReturnType<typeof writes>

export const agreementsRepository = {
  ...reads(db),

  transaction<T>(work: (repo: AgreementsWork) => Promise<T>): Promise<T> {
    return db.transaction(async (tx) => {
      await tx.execute(sql`set local statement_timeout = '10s'`)
      return work({ ...reads(tx), ...writes(tx) })
    })
  },
}
