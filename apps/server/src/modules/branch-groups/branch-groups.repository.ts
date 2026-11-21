import { and, asc, eq, inArray, isNotNull, isNull, ne, sql } from 'drizzle-orm'
import { db } from '../../db/index.js'
import { adminAuditLog, garageGroups, servicePackageItems, services, vendors } from '../../db/schema.js'
import type { GroupService, ServiceColumns } from '../../lib/branch-groups.js'
import { LISTED_TO_CUSTOMERS } from '../vendors/vendors.predicates.js'

export type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0]
type Conn = typeof db | Tx

/** What the group rules read of a garage. */
const GARAGE_COLUMNS = {
  id: vendors.id,
  businessName: vendors.businessName,
  groupId: vendors.groupId,
  deletedAt: vendors.deletedAt,
  purgedAt: vendors.purgedAt,
}

/**
 * Branch groups (0081). Every read takes the connection it runs on, so the
 * writes and the reads they are planned from share one transaction; with
 * the API's single database connection, a read on `db` inside a transaction
 * would wait for itself.
 */
export const branchGroupsRepository = {
  inTransaction<T>(work: (tx: Tx) => Promise<T>): Promise<T> {
    return db.transaction(work)
  },

  async findGarage(id: string, conn: Conn = db) {
    const [row] = await conn.select(GARAGE_COLUMNS).from(vendors).where(eq(vendors.id, id))
    return row ?? null
  },

  /** The garages, locked for the rest of the transaction, in id order (so two links never wait on each other). */
  lockGarages(ids: string[], tx: Tx) {
    return tx
      .select(GARAGE_COLUMNS)
      .from(vendors)
      .where(inArray(vendors.id, ids))
      .orderBy(asc(vendors.id))
      .for('update')
  },

  /**
   * Every garage of the group locked for the rest of the transaction, in id
   * order as lockGarages, so "All N branches" plans and writes with nothing
   * moving under it: no other branch save, link or remove in between.
   */
  async lockGroup(groupId: string, tx: Tx) {
    await tx.select({ id: vendors.id }).from(vendors).where(eq(vendors.groupId, groupId)).orderBy(asc(vendors.id)).for('update')
  },

  async findGroup(id: string, conn: Conn = db) {
    const [row] = await conn.select().from(garageGroups).where(eq(garageGroups.id, id))
    return row ?? null
  },

  /** The group's garages out of the Bin, the first one made (the main branch) first. */
  listGroupGarages(groupId: string, conn: Conn = db) {
    return conn
      .select({
        id: vendors.id,
        businessName: vendors.businessName,
        address: vendors.address,
        pincode: vendors.pincode,
        status: vendors.status,
        isVerified: vendors.isVerified,
        bookingsPausedAt: vendors.bookingsPausedAt,
        deletedAt: vendors.deletedAt,
        showWhenCityOff: vendors.showWhenCityOff,
        cityId: vendors.cityId,
        createdAt: vendors.createdAt,
      })
      .from(vendors)
      .where(and(eq(vendors.groupId, groupId), isNull(vendors.deletedAt), isNull(vendors.purgedAt)))
      .orderBy(asc(vendors.createdAt), asc(vendors.id))
  },

  /** How many garages are in the group, the Bin's included (a garage restored comes back to it). */
  async countGroupMembers(groupId: string, conn: Conn = db) {
    const [row] = await conn
      .select({ count: sql<number>`count(*)::int` })
      .from(vendors)
      .where(and(eq(vendors.groupId, groupId), isNull(vendors.purgedAt)))
    return row?.count ?? 0
  },

  /** The garages' plain services, hidden ones too; never packages, add-ons or deleted ones. */
  listPlainServices(vendorIds: string[], conn: Conn = db) {
    if (vendorIds.length === 0) return Promise.resolve([])
    return conn
      .select({
        id: services.id,
        vendorId: services.vendorId,
        name: services.name,
        description: services.description,
        category: services.category,
        pricingType: services.pricingType,
        price: services.price,
        priceHatchback: services.priceHatchback,
        priceSedan: services.priceSedan,
        priceSuv: services.priceSuv,
        approxPrice: services.approxPrice,
        durationMins: services.durationMins,
        commissionRate: services.commissionRate,
        isActive: services.isActive,
      })
      .from(services)
      .where(
        and(
          inArray(services.vendorId, vendorIds),
          isNull(services.deletedAt),
          ne(services.category, 'package'),
          eq(services.isAddon, false)
        )
      )
      .orderBy(asc(services.name), asc(services.id))
  },

  /** For each service, the packages (not deleted) that hold it, by name. */
  async listPackagesHolding(serviceIds: string[], conn: Conn = db) {
    if (serviceIds.length === 0) return []
    return conn
      .select({ serviceId: servicePackageItems.serviceId, name: services.name })
      .from(servicePackageItems)
      .innerJoin(services, eq(servicePackageItems.packageId, services.id))
      .where(and(inArray(servicePackageItems.serviceId, serviceIds), isNull(services.deletedAt)))
  },

  async createGroup(name: string, tx: Tx) {
    const [row] = await tx.insert(garageGroups).values({ name }).returning({ id: garageGroups.id })
    return row!.id
  },

  setGroup(vendorIds: string[], groupId: string | null, tx: Tx) {
    return tx.update(vendors).set({ groupId }).where(inArray(vendors.id, vendorIds))
  },

  /** Every garage out of the group, then the group itself. */
  async dissolveGroup(groupId: string, tx: Tx) {
    await tx.update(vendors).set({ groupId: null }).where(eq(vendors.groupId, groupId))
    await tx.delete(garageGroups).where(eq(garageGroups.id, groupId))
  },

  updateService(serviceId: string, vendorId: string, columns: ServiceColumns, tx: Tx) {
    return tx
      .update(services)
      .set(columns as Partial<typeof services.$inferInsert>)
      .where(and(eq(services.id, serviceId), eq(services.vendorId, vendorId), isNull(services.deletedAt)))
  },

  /**
   * "Not this" on the category hint (0080), for this garage's own services
   * only: kept from when it was first turned down; cleared on false.
   */
  async setHintsDismissed(serviceIds: string[], vendorId: string, dismissed: boolean, tx: Tx) {
    if (serviceIds.length === 0) return
    await tx
      .update(services)
      .set({ categoryHintDismissedAt: dismissed ? new Date() : null })
      .where(
        and(
          inArray(services.id, serviceIds),
          eq(services.vendorId, vendorId),
          isNull(services.deletedAt),
          dismissed ? isNull(services.categoryHintDismissedAt) : isNotNull(services.categoryHintDismissedAt)
        )
      )
  },

  insertServices(rows: Array<{ vendorId: string; categoryHintDismissedAt?: Date } & ServiceColumns>, tx: Tx) {
    if (rows.length === 0) return Promise.resolve([])
    return tx
      .insert(services)
      .values(rows.map((row) => ({ ...row, isActive: true }) as typeof services.$inferInsert))
      .returning({ id: services.id })
  },

  /**
   * Deleted for good, as the garage's own delete leaves a booked one: off,
   * listed nowhere again, still there for any booking that names it.
   */
  markServicesDeleted(rows: Array<{ serviceId: string; vendorId: string }>, tx: Tx) {
    if (rows.length === 0) return Promise.resolve([])
    return tx
      .update(services)
      .set({ isActive: false, deletedAt: new Date() })
      .where(
        and(
          inArray(
            services.id,
            rows.map((row) => row.serviceId)
          ),
          inArray(
            services.vendorId,
            rows.map((row) => row.vendorId)
          ),
          isNull(services.deletedAt)
        )
      )
  },

  insertAudit(
    row: { action: string; actorSub: string; actorName: string; summary: Record<string, unknown>; detail: Record<string, unknown> },
    tx: Tx
  ) {
    return tx.insert(adminAuditLog).values(row)
  },

  // ─── Customers ─────────────────────────────────────────────────────────────

  /**
   * The garage's other branches customers can find (LISTED_TO_CUSTOMERS, the
   * lists' own rule), in the group's order. One read, whatever the size of
   * the group; nothing about a branch that is not live.
   */
  async listLiveBranches(vendorId: string) {
    const rows = await db.execute<{ id: string; business_name: string; lat: number | null; lng: number | null }>(sql`
      SELECT v.id, v.business_name, v.lat, v.lng
        FROM vendors me
        JOIN vendors v ON v.group_id = me.group_id AND v.id <> me.id
       WHERE me.id = ${vendorId} AND me.group_id IS NOT NULL AND ${LISTED_TO_CUSTOMERS}
       ORDER BY v.created_at ASC, v.id ASC
    `)
    return Array.from(rows).map((row) => ({
      id: row.id,
      businessName: row.business_name,
      lat: row.lat === null ? null : Number(row.lat),
      lng: row.lng === null ? null : Number(row.lng),
    }))
  },

  /**
   * For a page of garage cards, each one's group name and how many of its
   * branches customers can find, itself included: one read for the page.
   * Only a garage that is itself live comes back (a saved garage paused
   * since is never "1 of 2" beside two others).
   */
  async listCardGroups(vendorIds: string[]) {
    if (vendorIds.length === 0) return []
    const rows = await db.execute<{ id: string; name: string; live: number }>(sql`
      SELECT me.id, g.name, count(v.id)::int AS live
        FROM vendors me
        JOIN garage_groups g ON g.id = me.group_id
        JOIN vendors v ON v.group_id = me.group_id
       WHERE me.id IN (${sql.join(
         vendorIds.map((id) => sql`${id}::uuid`),
         sql`, `
       )}) AND ${LISTED_TO_CUSTOMERS}
       GROUP BY me.id, g.name
      HAVING bool_or(v.id = me.id)
    `)
    return Array.from(rows).map((row) => ({ vendorId: row.id, groupName: row.name, liveCount: Number(row.live) }))
  },
}

export type GroupServiceRow = Omit<GroupService, 'packageNames'>
