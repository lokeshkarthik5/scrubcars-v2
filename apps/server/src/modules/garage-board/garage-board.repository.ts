import { inArray } from 'drizzle-orm'
import { db } from '../../db/index.js'
import { adminSettings, vendors } from '../../db/schema.js'

export type AdminSettingKey = (typeof adminSettings.$inferSelect)['key']

export const garageBoardRepository = {
  /** The stored settings for these keys; a key never set has no row. */
  listSettings(keys: AdminSettingKey[]) {
    return db.select().from(adminSettings).where(inArray(adminSettings.key, keys))
  },

  async saveSetting(key: AdminSettingKey, value: Record<string, unknown>, updatedByName: string, now: Date) {
    const [row] = await db
      .insert(adminSettings)
      .values({ key, value, updatedByName, updatedAt: now })
      .onConflictDoUpdate({
        target: adminSettings.key,
        set: { value, updatedByName, updatedAt: now },
      })
      .returning()
    return row!
  },

  findGarages(vendorIds: string[]) {
    return db
      .select({ id: vendors.id, deletedAt: vendors.deletedAt, purgedAt: vendors.purgedAt })
      .from(vendors)
      .where(inArray(vendors.id, vendorIds))
  },

  setColourTags(
    vendorIds: string[],
    values: {
      colourTag: 'green' | 'amber' | 'red' | 'blue' | null
      colourTagCallOn: string | null
      colourTagSetBy: string | null
      colourTagSetAt: Date | null
    }
  ) {
    return db
      .update(vendors)
      .set(values)
      .where(inArray(vendors.id, vendorIds))
      .returning({
        id: vendors.id,
        colourTag: vendors.colourTag,
        colourTagCallOn: vendors.colourTagCallOn,
        colourTagSetBy: vendors.colourTagSetBy,
        colourTagSetAt: vendors.colourTagSetAt,
      })
  },
}
