import { asc, eq, sql } from 'drizzle-orm'
import { db } from '../../db/index.js'
import { vendors, zones } from '../../db/schema.js'
import { vendorNotInBin } from '../vendors/vendors.predicates.js'
import type { Conn } from '../leads/leads.repository.js'

export type ZoneRecord = typeof zones.$inferSelect
export type ZonePatch = Partial<
  Pick<ZoneRecord, 'name' | 'lat' | 'lng' | 'priority' | 'target' | 'updatedAt'>
>

export const coverageRepository = {
  /** Every zone: the priority ones first, each group A–Z (GET /zones' order). */
  listZones(conn: Conn = db): Promise<ZoneRecord[]> {
    return conn
      .select()
      .from(zones)
      .orderBy(sql`${zones.priority} DESC`, asc(zones.name))
  },

  async findZone(id: string, conn: Conn = db): Promise<ZoneRecord | undefined> {
    const [row] = await conn
      .select()
      .from(zones)
      .where(eq(zones.id, id))
      .limit(1)
    return row
  },

  async insertZone(
    values: Pick<
      ZoneRecord,
      'slug' | 'name' | 'lat' | 'lng' | 'priority' | 'target'
    > & { createdAt: Date; updatedAt: Date },
    conn: Conn = db
  ): Promise<ZoneRecord> {
    const [row] = await conn.insert(zones).values(values).returning()
    return row!
  },

  async updateZone(
    id: string,
    patch: ZonePatch,
    conn: Conn = db
  ): Promise<ZoneRecord | undefined> {
    const [row] = await conn
      .update(zones)
      .set(patch)
      .where(eq(zones.id, id))
      .returning()
    return row
  },

  async deleteZone(id: string, conn: Conn = db): Promise<boolean> {
    const rows = await conn
      .delete(zones)
      .where(eq(zones.id, id))
      .returning({ id: zones.id })
    return rows.length > 0
  },

  /** Every garage not in the Bin, for the map's dots and the zones' counts. */
  listGarages(conn: Conn = db) {
    return conn
      .select({
        id: vendors.id,
        businessName: vendors.businessName,
        phone: vendors.phone,
        lat: vendors.lat,
        lng: vendors.lng,
        status: vendors.status,
        isVerified: vendors.isVerified,
        bookingsPausedAt: vendors.bookingsPausedAt,
        deletedAt: vendors.deletedAt,
      })
      .from(vendors)
      .where(vendorNotInBin())
      .orderBy(asc(vendors.businessName))
  },

  transaction<T>(
    work: (
      tx: Parameters<Parameters<typeof db.transaction>[0]>[0]
    ) => Promise<T>
  ): Promise<T> {
    return db.transaction(work)
  },
}
