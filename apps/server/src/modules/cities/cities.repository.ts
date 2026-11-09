import { asc, eq, isNull, ne, sql } from 'drizzle-orm'
import { db } from '../../db/index.js'
import { adminAuditLog, adminSettings, cities, vendors } from '../../db/schema.js'
import { OTHER_TOWNS_SETTING_KEY, parseOtherTownsVisible } from '../../lib/cities.js'

export type CityRecord = typeof cities.$inferSelect
type Actor = { sub: string; name: string }

/** The city facts every audit row carries, so a deleted city is still named. */
function citySummary(city: CityRecord) {
  return { cityId: city.id, city: city.name }
}

export const citiesRepository = {
  /** Every city, A–Z. A handful of rows: read whole wherever a garage's city is needed. */
  listCities(): Promise<CityRecord[]> {
    return db.select().from(cities).orderBy(asc(cities.name), asc(cities.id))
  },

  async findCity(id: string): Promise<CityRecord | undefined> {
    const [row] = await db.select().from(cities).where(eq(cities.id, id))
    return row
  },

  /** The Other towns switch's stored value, or undefined when never set (shown). */
  async otherTownsValue(): Promise<unknown> {
    const [row] = await db
      .select({ value: adminSettings.value })
      .from(adminSettings)
      .where(eq(adminSettings.key, OTHER_TOWNS_SETTING_KEY))
    return row?.value
  },

  /**
   * Every garage not in the Bin with its stored city (vendors.city_id) and
   * what decides whether it is listed, for the Cities page's counts. One
   * read; the counting is the service's.
   */
  listGarageFacts() {
    return db
      .select({
        id: vendors.id,
        cityId: vendors.cityId,
        status: vendors.status,
        isVerified: vendors.isVerified,
        bookingsPausedAt: vendors.bookingsPausedAt,
        deletedAt: vendors.deletedAt,
        showWhenCityOff: vendors.showWhenCityOff,
      })
      .from(vendors)
      .where(isNull(vendors.deletedAt))
  },

  /** Another city than `exceptId` (or any) whose name has this key, for the duplicate check. */
  async listOtherCityNames(exceptId: string | null): Promise<Array<{ id: string; name: string }>> {
    return db
      .select({ id: cities.id, name: cities.name })
      .from(cities)
      .where(exceptId ? ne(cities.id, exceptId) : sql`true`)
  },

  /** Adds a city and its audit row, together. */
  async createCity(
    values: { name: string; lat: number; lng: number; reachKm: number; customersSee: boolean },
    actor: Actor
  ): Promise<CityRecord> {
    return db.transaction(async (tx) => {
      const [city] = await tx.insert(cities).values(values).returning()
      await tx.insert(adminAuditLog).values({
        action: 'city_added',
        actorSub: actor.sub,
        actorName: actor.name,
        summary: citySummary(city!),
        detail: { lat: city!.lat, lng: city!.lng, reachKm: city!.reachKm, customersSee: city!.customersSee },
      })
      return city!
    })
  },

  /**
   * Changes a city under its row lock, with an audit row saying what moved
   * from what. Turning "Customers see garages here" on or off is its own
   * action (city_shown / city_hidden), as the tier switches are. Undefined
   * when the city is gone.
   */
  async updateCity(
    id: string,
    patch: Partial<Pick<CityRecord, 'name' | 'lat' | 'lng' | 'reachKm' | 'customersSee'>>,
    actor: Actor
  ): Promise<CityRecord | undefined> {
    return db.transaction(async (tx) => {
      const [before] = await tx.select().from(cities).where(eq(cities.id, id)).for('update')
      if (!before) return undefined
      const changed = (Object.keys(patch) as Array<keyof typeof patch>).filter(
        (key) => patch[key] !== undefined && patch[key] !== before[key]
      )
      if (changed.length === 0) return before
      const [after] = await tx
        .update(cities)
        .set({ ...patch, updatedAt: sql`now()` })
        .where(eq(cities.id, id))
        .returning()
      const switched = changed.includes('customersSee')
      const edited = changed.filter((key) => key !== 'customersSee')
      if (switched) {
        await tx.insert(adminAuditLog).values({
          action: after!.customersSee ? 'city_shown' : 'city_hidden',
          actorSub: actor.sub,
          actorName: actor.name,
          summary: citySummary(after!),
          detail: { customersSee: after!.customersSee },
        })
      }
      if (edited.length > 0) {
        await tx.insert(adminAuditLog).values({
          action: 'city_edited',
          actorSub: actor.sub,
          actorName: actor.name,
          summary: citySummary(after!),
          detail: Object.fromEntries(edited.map((key) => [key, { from: before[key], to: after![key] }])),
        })
      }
      return after
    })
  },

  /**
   * Deletes a city and writes its audit row. The database moves its garages
   * in the same statement (0069's trigger on cities recomputes every
   * garage's city_id) to whichever city now holds them, or to Other towns.
   * False when it was already gone.
   */
  async deleteCity(id: string, actor: Actor): Promise<boolean> {
    return db.transaction(async (tx) => {
      const [before] = await tx.select().from(cities).where(eq(cities.id, id)).for('update')
      if (!before) return false
      await tx.delete(cities).where(eq(cities.id, id))
      await tx.insert(adminAuditLog).values({
        action: 'city_deleted',
        actorSub: actor.sub,
        actorName: actor.name,
        summary: citySummary(before),
        detail: { lat: before.lat, lng: before.lng, reachKm: before.reachKm, customersSee: before.customersSee },
      })
      return true
    })
  },

  /**
   * The Other towns switch, with who did it, and its audit row when it
   * changed, together. The row is read under its lock, as the tier switches
   * read theirs, so two admins flipping it at once each log what they saw.
   */
  async setOtherTowns(visible: boolean, actor: Actor): Promise<void> {
    await db.transaction(async (tx) => {
      const [before] = await tx
        .select({ value: adminSettings.value })
        .from(adminSettings)
        .where(eq(adminSettings.key, OTHER_TOWNS_SETTING_KEY))
        .for('update')
      const wasVisible = parseOtherTownsVisible(before?.value)
      await tx
        .insert(adminSettings)
        .values({ key: OTHER_TOWNS_SETTING_KEY, value: { visible }, updatedByName: actor.name })
        .onConflictDoUpdate({
          target: adminSettings.key,
          set: { value: { visible }, updatedByName: actor.name, updatedAt: sql`now()` },
        })
      if (wasVisible !== visible) {
        await tx.insert(adminAuditLog).values({
          action: visible ? 'other_towns_shown' : 'other_towns_hidden',
          actorSub: actor.sub,
          actorName: actor.name,
          summary: { city: null },
          detail: { visible, before: wasVisible },
        })
      }
    })
  },
}
