import {
  and,
  asc,
  desc,
  eq,
  inArray,
  isNotNull,
  isNull,
  lte,
  or,
  sql,
} from 'drizzle-orm'
import { db } from '../../db/index.js'
import { adminLogins, leads, vendors, zones } from '../../db/schema.js'
import { vendorNotInBin } from '../vendors/vendors.predicates.js'

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0]
/** The pool, or a transaction the write runs in (one connection: never mix the two inside one). */
export type Conn = typeof db | Tx

export type LeadRecord = typeof leads.$inferSelect
export type NewLead = typeof leads.$inferInsert
export type LeadPatch = Partial<
  Omit<NewLead, 'id' | 'createdAt' | 'createdByName'>
>

/** A garage as the duplicate check and the finder see it. */
export interface GarageForMatch {
  id: string
  businessName: string
  phone: string | null
  whatsapp: string | null
  lat: number | null
  lng: number | null
  status: string
  isVerified: boolean
  bookingsPausedAt: Date | null
  deletedAt: Date | null
}

export const leadsRepository = {
  listAll(conn: Conn = db): Promise<LeadRecord[]> {
    return conn
      .select()
      .from(leads)
      .orderBy(desc(leads.createdAt), asc(leads.id))
  },

  async findById(id: string, conn: Conn = db): Promise<LeadRecord | undefined> {
    const [row] = await conn
      .select()
      .from(leads)
      .where(eq(leads.id, id))
      .limit(1)
    return row
  },

  /** The lead that became this garage, if one did. */
  async findByVendor(
    vendorId: string,
    conn: Conn = db
  ): Promise<LeadRecord | undefined> {
    const [row] = await conn
      .select()
      .from(leads)
      .where(eq(leads.vendorId, vendorId))
      .limit(1)
    return row
  },

  insert(rows: NewLead[], conn: Conn = db): Promise<LeadRecord[]> {
    if (rows.length === 0) return Promise.resolve([])
    return conn.insert(leads).values(rows).returning()
  },

  async update(
    id: string,
    patch: LeadPatch,
    conn: Conn = db
  ): Promise<LeadRecord | undefined> {
    const [row] = await conn
      .update(leads)
      .set(patch)
      .where(eq(leads.id, id))
      .returning()
    return row
  },

  async remove(id: string, conn: Conn = db): Promise<boolean> {
    const rows = await conn
      .delete(leads)
      .where(eq(leads.id, id))
      .returning({ id: leads.id })
    return rows.length > 0
  },

  /**
   * The lead becomes the garage just made from it: onboarded, linked. Only
   * while it is linked to no garage yet, so two Creates can never both
   * claim one lead (the second changes nothing).
   */
  async markOnboarded(
    id: string,
    vendorId: string,
    now: Date,
    conn: Conn = db
  ): Promise<boolean> {
    const rows = await conn
      .update(leads)
      .set({
        vendorId,
        status: 'onboarded',
        onboardedAt: now,
        notInterestedReason: null,
        notInterestedOn: null,
        retryAfter: null,
        updatedAt: now,
      })
      .where(and(eq(leads.id, id), isNull(leads.vendorId)))
      .returning({ id: leads.id })
    return rows.length > 0
  },

  /** Every zone, for the zone rule. */
  listZones(conn: Conn = db) {
    return conn
      .select({
        id: zones.id,
        name: zones.name,
        lat: zones.lat,
        lng: zones.lng,
      })
      .from(zones)
      .orderBy(sql`${zones.priority} DESC`, asc(zones.name))
  },

  /** Every garage not in the Bin, with what the duplicate check and the live rule read. */
  listGaragesForMatch(conn: Conn = db): Promise<GarageForMatch[]> {
    return conn
      .select({
        id: vendors.id,
        businessName: vendors.businessName,
        phone: vendors.phone,
        whatsapp: vendors.whatsapp,
        lat: vendors.lat,
        lng: vendors.lng,
        status: vendors.status,
        isVerified: vendors.isVerified,
        bookingsPausedAt: vendors.bookingsPausedAt,
        deletedAt: vendors.deletedAt,
      })
      .from(vendors)
      .where(vendorNotInBin())
  },

  async findGarage(id: string, conn: Conn = db) {
    const [row] = await conn
      .select({
        id: vendors.id,
        deletedAt: vendors.deletedAt,
        purgedAt: vendors.purgedAt,
      })
      .from(vendors)
      .where(eq(vendors.id, id))
      .limit(1)
    return row
  },

  /** An active personal login, for "Assign to". */
  async findActiveLogin(id: string, conn: Conn = db) {
    const [row] = await conn
      .select({ id: adminLogins.id, name: adminLogins.name })
      .from(adminLogins)
      .where(and(eq(adminLogins.id, id), eq(adminLogins.status, 'active')))
      .limit(1)
    return row
  },

  /** Leads holding Google's details long enough to be refreshed, the oldest first. */
  listGoogleDue(before: Date, limit: number, conn: Conn = db) {
    return conn
      .select({
        id: leads.id,
        googlePlaceId: leads.googlePlaceId,
        googleFetchedAt: leads.googleFetchedAt,
        pinSource: leads.pinSource,
        lat: leads.lat,
        lng: leads.lng,
        zoneId: leads.zoneId,
      })
      .from(leads)
      .where(
        and(
          isNotNull(leads.googleFetchedAt),
          lte(leads.googleFetchedAt, before)
        )
      )
      .orderBy(asc(leads.googleFetchedAt), asc(leads.id))
      .limit(limit)
  },

  /**
   * Writes a refresh's outcome, only if nobody refreshed it since it was
   * read (the same fetched date), so two overlapping runs never fight.
   */
  async applyGoogleRefresh(
    id: string,
    readAt: Date,
    patch: LeadPatch,
    conn: Conn = db
  ): Promise<boolean> {
    const rows = await conn
      .update(leads)
      .set(patch)
      .where(and(eq(leads.id, id), eq(leads.googleFetchedAt, readAt)))
      .returning({ id: leads.id })
    return rows.length > 0
  },

  /** Leads with a pin, for re-working out zones after the zones changed. */
  listPinned(conn: Conn = db) {
    return conn
      .select({
        id: leads.id,
        lat: leads.lat,
        lng: leads.lng,
        zoneId: leads.zoneId,
      })
      .from(leads)
      .where(isNotNull(leads.lat))
  },

  async setZones(
    moves: Array<{ id: string; zoneId: string | null }>,
    now: Date,
    conn: Conn = db
  ) {
    for (const move of moves) {
      await conn
        .update(leads)
        .set({ zoneId: move.zoneId, updatedAt: now })
        .where(eq(leads.id, move.id))
    }
  },

  countInZone(zoneId: string, conn: Conn = db) {
    return conn
      .select({ count: sql<number>`count(*)::int` })
      .from(leads)
      .where(eq(leads.zoneId, zoneId))
      .then(([row]) => row?.count ?? 0)
  },

  /** Leads that already hold one of these place ids. */
  listByPlaceIds(googleIds: string[], olaIds: string[], conn: Conn = db) {
    const conditions = []
    if (googleIds.length)
      conditions.push(inArray(leads.googlePlaceId, googleIds))
    if (olaIds.length) conditions.push(inArray(leads.olaPlaceId, olaIds))
    if (conditions.length === 0) return Promise.resolve([])
    return conn
      .select({
        id: leads.id,
        googlePlaceId: leads.googlePlaceId,
        olaPlaceId: leads.olaPlaceId,
      })
      .from(leads)
      .where(or(...conditions))
  },

  transaction<T>(work: (tx: Tx) => Promise<T>): Promise<T> {
    return db.transaction(work)
  },
}
