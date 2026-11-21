import { and, desc, eq, inArray, isNotNull, sql } from 'drizzle-orm'
import { db } from '../../db/index.js'
import { adminAuditLog, leads, vendors } from '../../db/schema.js'
import type { Conn, LeadPatch, LeadRecord, NewLead } from '../leads/leads.repository.js'

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0]

/** The audit actions a link and an unlink write. */
export const GARAGE_GOOGLE_AUDIT = {
  linked: 'garage_google_linked',
  unlinked: 'garage_google_unlinked',
} as const

/**
 * Google rating for new garages (21 Nov 2026): the garage's Google listing,
 * kept on its lead (no table of its own). Queries only; the rules are
 * lib/garage-google.ts.
 */
export const garageGoogleRepository = {
  async findGarage(id: string, conn: Conn = db) {
    const [row] = await conn
      .select({
        id: vendors.id,
        businessName: vendors.businessName,
        lat: vendors.lat,
        lng: vendors.lng,
        deletedAt: vendors.deletedAt,
        purgedAt: vendors.purgedAt,
      })
      .from(vendors)
      .where(eq(vendors.id, id))
      .limit(1)
    return row
  },

  /** The garage's lead under its row lock (at most one: leads_vendor_id_key). */
  async lockLeadOfGarage(vendorId: string, conn: Conn = db): Promise<LeadRecord | undefined> {
    const [row] = await conn
      .select()
      .from(leads)
      .where(eq(leads.vendorId, vendorId))
      .for('update')
      .limit(1)
    return row
  },

  /** The lead holding this Google place, under its row lock (place ids are unique). */
  async lockLeadOfPlace(placeId: string, conn: Conn = db): Promise<LeadRecord | undefined> {
    const [row] = await conn
      .select()
      .from(leads)
      .where(eq(leads.googlePlaceId, placeId))
      .for('update')
      .limit(1)
    return row
  },

  /** Who holds these places now: the lead, and the garage it became. */
  listPlaceHolders(placeIds: string[], conn: Conn = db) {
    if (placeIds.length === 0) return Promise.resolve([])
    return conn
      .select({
        leadId: leads.id,
        name: leads.name,
        googleName: leads.googleName,
        placeId: sql<string>`${leads.googlePlaceId}`,
        vendorId: leads.vendorId,
        garageName: vendors.businessName,
      })
      .from(leads)
      .leftJoin(vendors, eq(vendors.id, leads.vendorId))
      .where(inArray(leads.googlePlaceId, placeIds))
  },

  /** Every garage's Google listing, for the Garages list: leads linked to a garage with a place id. */
  listListings(conn: Conn = db) {
    return conn
      .select({
        id: leads.id,
        vendorId: sql<string>`${leads.vendorId}`,
        source: leads.source,
        googlePlaceId: sql<string>`${leads.googlePlaceId}`,
        googleName: leads.googleName,
        googleAddress: leads.googleAddress,
        googleRating: leads.googleRating,
        googleReviewCount: leads.googleReviewCount,
        googleFetchedAt: leads.googleFetchedAt,
      })
      .from(leads)
      .where(and(isNotNull(leads.vendorId), isNotNull(leads.googlePlaceId)))
  },

  /** The newest Link to Google listing per garage (who and when), from the audit log. */
  async listLatestLinks(conn: Conn = db) {
    const rows = await conn
      .selectDistinctOn([sql`${adminAuditLog.summary}->>'vendorId'`], {
        vendorId: sql<string>`${adminAuditLog.summary}->>'vendorId'`,
        actorName: adminAuditLog.actorName,
        createdAt: adminAuditLog.createdAt,
      })
      .from(adminAuditLog)
      .where(eq(adminAuditLog.action, GARAGE_GOOGLE_AUDIT.linked))
      .orderBy(sql`${adminAuditLog.summary}->>'vendorId'`, desc(adminAuditLog.createdAt))
    return rows
  },

  insertLead(row: NewLead, conn: Conn) {
    return conn.insert(leads).values(row).returning()
  },

  async updateLead(id: string, patch: LeadPatch, conn: Conn) {
    const [row] = await conn.update(leads).set(patch).where(eq(leads.id, id)).returning()
    return row
  },

  audit(
    conn: Conn,
    entry: {
      action: (typeof GARAGE_GOOGLE_AUDIT)[keyof typeof GARAGE_GOOGLE_AUDIT]
      actor: { sub: string; name: string }
      summary: Record<string, unknown>
      detail: Record<string, unknown>
    }
  ) {
    return conn.insert(adminAuditLog).values({
      action: entry.action,
      actorSub: entry.actor.sub,
      actorName: entry.actor.name,
      summary: entry.summary,
      detail: entry.detail,
    })
  },

  transaction<T>(work: (tx: Tx) => Promise<T>): Promise<T> {
    return db.transaction(work)
  },
}
