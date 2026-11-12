import { and, eq, sql } from 'drizzle-orm'
import { db } from '../../db/index.js'
import {
  garageStockItems,
  garageStockMoves,
  garageStockUsage,
  garageSupplyOrders,
  garageSuppliers,
  type GarageStockMoveKind,
  type GarageStockUnit,
  type GarageSupplyOrderLine,
  type GarageSupplyOrderStatus,
} from '../../db/schema.js'
import { at, num, type Tx } from './garage-book.repository.js'

/**
 * Stock and supplies' reads and writes (0074). Levels are numeric(12, 3) in
 * the item's own unit; postgres-js gives them back as text, so each goes
 * through `num()`.
 */

export interface ItemRow {
  id: string
  name: string
  unit: GarageStockUnit
  level: number
  lowAt: number
  packSize: number | null
  packPricePaise: number | null
  supplierId: string | null
  supplierName: string | null
  /** The most any one service uses of it. */
  maxUse: number | null
  usedThisMonth: number
  jobsThisMonth: number
}

export interface OrderRow {
  id: string
  supplierId: string
  supplierName: string
  supplierPhone: string | null
  status: GarageSupplyOrderStatus
  lines: GarageSupplyOrderLine[]
  totalPaise: number
  sentAt: Date
  receivedAt: Date | null
  expenseId: string | null
}

const nullableNum = (value: unknown) => (value === null || value === undefined ? null : Number(value))

async function readItems(executor: Tx | typeof db, where: ReturnType<typeof sql>, monthStart: Date): Promise<ItemRow[]> {
  const from = sql`${monthStart.toISOString()}::timestamptz`
  const rows = await executor.execute<{
    id: string
    name: string
    unit: GarageStockUnit
    level: string
    low_at: string
    pack_size: string | null
    pack_price_paise: number | null
    supplier_id: string | null
    supplier_name: string | null
    max_use: string | null
    used: string | null
    jobs: number | string
  }>(sql`
    SELECT i.id, i.name, i.unit, i.level, i.low_at, i.pack_size, i.pack_price_paise, i.supplier_id,
           s.name AS supplier_name,
           (SELECT max(u.amount) FROM garage_stock_usage u WHERE u.item_id = i.id) AS max_use,
           (SELECT -sum(m.delta) FROM garage_stock_moves m WHERE m.item_id = i.id AND m.kind = 'used' AND m.created_at >= ${from}) AS used,
           (SELECT count(*) FROM garage_stock_moves m WHERE m.item_id = i.id AND m.kind = 'used' AND m.created_at >= ${from}) AS jobs
      FROM garage_stock_items i
      LEFT JOIN garage_suppliers s ON s.id = i.supplier_id AND s.deleted_at IS NULL
     WHERE ${where} AND i.deleted_at IS NULL
     ORDER BY i.name
  `)
  return Array.from(rows).map((row) => ({
    id: row.id,
    name: row.name,
    unit: row.unit,
    level: num(row.level),
    lowAt: num(row.low_at),
    packSize: nullableNum(row.pack_size),
    packPricePaise: nullableNum(row.pack_price_paise),
    supplierId: row.supplier_name ? row.supplier_id : null,
    supplierName: row.supplier_name,
    maxUse: nullableNum(row.max_use),
    usedThisMonth: num(row.used),
    jobsThisMonth: num(row.jobs),
  }))
}

export const stockRepository = {
  transaction<T>(work: (tx: Tx) => Promise<T>) {
    return db.transaction(work)
  },

  items(vendorId: string, monthStart: Date) {
    return readItems(db, sql`i.vendor_id = ${vendorId}`, monthStart)
  },

  async item(vendorId: string, id: string, monthStart: Date, executor: Tx | typeof db = db) {
    const [row] = await readItems(executor, sql`i.vendor_id = ${vendorId} AND i.id = ${id}`, monthStart)
    return row ?? null
  },

  async countItems(vendorId: string) {
    const rows = await db.execute<{ n: number | string; low: number | string }>(sql`
      SELECT count(*) AS n, count(*) FILTER (WHERE low_at > 0 AND level <= low_at) AS low
        FROM garage_stock_items WHERE vendor_id = ${vendorId} AND deleted_at IS NULL
    `)
    const row = Array.from(rows)[0]
    return { items: num(row?.n), low: num(row?.low) }
  },

  async insertItem(data: {
    vendorId: string
    name: string
    unit: GarageStockUnit
    level: number
    lowAt: number
    packSize: number | null
    packPricePaise: number | null
    supplierId: string | null
  }) {
    const [row] = await db
      .insert(garageStockItems)
      .values({
        ...data,
        level: String(data.level),
        lowAt: String(data.lowAt),
        packSize: data.packSize === null ? null : String(data.packSize),
      })
      .returning({ id: garageStockItems.id })
    return row!
  },

  async updateItem(
    vendorId: string,
    id: string,
    data: Partial<{ name: string; unit: GarageStockUnit; lowAt: number; packSize: number | null; packPricePaise: number | null; supplierId: string | null }>
  ) {
    const set: Record<string, unknown> = { ...data }
    if (data.lowAt !== undefined) set.lowAt = String(data.lowAt)
    if (data.packSize !== undefined) set.packSize = data.packSize === null ? null : String(data.packSize)
    if (Object.keys(set).length === 0) return
    await db
      .update(garageStockItems)
      .set(set)
      .where(and(eq(garageStockItems.vendorId, vendorId), eq(garageStockItems.id, id)))
  },

  async deleteItem(vendorId: string, id: string) {
    await db
      .update(garageStockItems)
      .set({ deletedAt: new Date() })
      .where(and(eq(garageStockItems.vendorId, vendorId), eq(garageStockItems.id, id), sql`${garageStockItems.deletedAt} is null`))
  },

  /** The item's level, locked until the transaction ends: two counts or two jobs at once change it one after the other. */
  async lockItem(tx: Tx, vendorId: string, id: string) {
    const rows = await tx.execute<{ level: string }>(sql`
      SELECT level FROM garage_stock_items WHERE vendor_id = ${vendorId} AND id = ${id} AND deleted_at IS NULL FOR UPDATE
    `)
    const row = Array.from(rows)[0]
    return row ? num(row.level) : null
  },

  async setLevel(tx: Tx, id: string, level: number) {
    await tx.update(garageStockItems).set({ level: String(level) }).where(eq(garageStockItems.id, id))
  },

  /**
   * Writes a move. A 'used' move for a job that already used this item
   * writes nothing (the unique index) and answers false, so the level is
   * left alone.
   */
  async insertMove(
    tx: Tx,
    data: {
      vendorId: string
      itemId: string
      kind: GarageStockMoveKind
      delta: number
      levelAfter: number
      garageJobId?: string | null
      bookingId?: string | null
      supplyOrderId?: string | null
      createdBy: string | null
    }
  ) {
    const rows = await tx
      .insert(garageStockMoves)
      .values({ ...data, delta: String(data.delta), levelAfter: String(data.levelAfter) })
      .onConflictDoNothing()
      .returning({ id: garageStockMoves.id })
    return rows.length > 0
  },

  async usage(itemId: string) {
    const rows = await db
      .select({ serviceId: garageStockUsage.serviceId, amount: garageStockUsage.amount })
      .from(garageStockUsage)
      .where(eq(garageStockUsage.itemId, itemId))
    return rows.map((row) => ({ serviceId: row.serviceId, amount: num(row.amount) }))
  },

  async replaceUsage(tx: Tx, itemId: string, rows: Array<{ serviceId: string; amount: number }>) {
    await tx.delete(garageStockUsage).where(eq(garageStockUsage.itemId, itemId))
    const kept = rows.filter((row) => row.amount > 0)
    if (kept.length > 0) {
      await tx.insert(garageStockUsage).values(kept.map((row) => ({ itemId, serviceId: row.serviceId, amount: String(row.amount) })))
    }
  },

  /** What each of these services uses, of this garage's items still in stock. */
  async usageForServices(vendorId: string, serviceIds: string[], executor: Tx | typeof db = db) {
    if (serviceIds.length === 0) return []
    const rows = await executor.execute<{ item_id: string; service_id: string; amount: string }>(sql`
      SELECT u.item_id, u.service_id, u.amount
        FROM garage_stock_usage u JOIN garage_stock_items i ON i.id = u.item_id
       WHERE i.vendor_id = ${vendorId} AND i.deleted_at IS NULL
         AND u.service_id IN (${sql.join(serviceIds.map((id) => sql`${id}`), sql`, `)})
    `)
    return Array.from(rows).map((row) => ({ itemId: row.item_id, serviceId: row.service_id, amount: num(row.amount) }))
  },

  async moves(itemId: string, limit = 30) {
    const rows = await db.execute<{
      id: string
      kind: GarageStockMoveKind
      delta: string
      level_after: string
      garage_job_id: string | null
      booking_id: string | null
      supply_order_id: string | null
      created_by: string | null
      by_name: string | null
      created_at: Date | string
    }>(sql`
      SELECT m.id, m.kind, m.delta, m.level_after, m.garage_job_id, m.booking_id, m.supply_order_id,
             m.created_by, u.name AS by_name, m.created_at
        FROM garage_stock_moves m LEFT JOIN users u ON u.id = m.created_by
       WHERE m.item_id = ${itemId}
       ORDER BY m.created_at DESC, m.id DESC
       LIMIT ${limit}
    `)
    return Array.from(rows).map((row) => ({
      id: row.id,
      kind: row.kind,
      delta: num(row.delta),
      levelAfter: num(row.level_after),
      jobRef: row.garage_job_id ? `own:${row.garage_job_id}` : row.booking_id ? `detlio:${row.booking_id}` : null,
      orderId: row.supply_order_id,
      by: row.created_by ? { id: row.created_by, name: row.by_name } : null,
      at: at(row.created_at)!.toISOString(),
    }))
  },

  /** A Detlio booking's services at this garage, for its stock use. */
  async bookingServices(vendorId: string, bookingId: string) {
    const rows = await db.execute<{ service_id: string | null }>(sql`
      SELECT bi.service_id FROM booking_items bi JOIN bookings b ON b.id = bi.booking_id
       WHERE b.id = ${bookingId} AND b.vendor_id = ${vendorId} AND b.status = 'completed'
    `)
    return Array.from(rows).flatMap((row) => (row.service_id ? [{ serviceId: row.service_id, qty: 1 }] : []))
  },

  // ─── Suppliers ─────────────────────────────────────────────────────────────

  async suppliers(vendorId: string) {
    const rows = await db.execute<{ id: string; name: string; phone: string | null; last_order_at: Date | string | null }>(sql`
      SELECT s.id, s.name, s.phone,
             (SELECT max(o.sent_at) FROM garage_supply_orders o WHERE o.supplier_id = s.id AND o.status <> 'cancelled') AS last_order_at
        FROM garage_suppliers s
       WHERE s.vendor_id = ${vendorId} AND s.deleted_at IS NULL
       ORDER BY s.name
    `)
    return Array.from(rows).map((row) => ({ id: row.id, name: row.name, phone: row.phone, lastOrderAt: at(row.last_order_at) }))
  },

  async supplier(vendorId: string, id: string) {
    const [row] = await db
      .select()
      .from(garageSuppliers)
      .where(and(eq(garageSuppliers.vendorId, vendorId), eq(garageSuppliers.id, id), sql`${garageSuppliers.deletedAt} is null`))
      .limit(1)
    return row ?? null
  },

  async insertSupplier(data: { vendorId: string; name: string; phone: string | null }) {
    const [row] = await db.insert(garageSuppliers).values(data).returning()
    return row!
  },

  async updateSupplier(vendorId: string, id: string, data: Partial<{ name: string; phone: string | null }>) {
    if (Object.keys(data).length === 0) return
    await db.update(garageSuppliers).set(data).where(and(eq(garageSuppliers.vendorId, vendorId), eq(garageSuppliers.id, id)))
  },

  async deleteSupplier(vendorId: string, id: string) {
    await db
      .update(garageSuppliers)
      .set({ deletedAt: new Date() })
      .where(and(eq(garageSuppliers.vendorId, vendorId), eq(garageSuppliers.id, id), sql`${garageSuppliers.deletedAt} is null`))
  },

  async countSuppliers(vendorId: string) {
    const rows = await db.execute<{ n: number | string }>(sql`
      SELECT count(*) AS n FROM garage_suppliers WHERE vendor_id = ${vendorId} AND deleted_at IS NULL
    `)
    return num(Array.from(rows)[0]?.n)
  },

  // ─── Supply orders ─────────────────────────────────────────────────────────

  async insertOrder(data: {
    vendorId: string
    supplierId: string
    lines: GarageSupplyOrderLine[]
    totalPaise: number
    createdBy: string | null
  }) {
    const [row] = await db.insert(garageSupplyOrders).values(data).returning({ id: garageSupplyOrders.id })
    return row!
  },

  async order(vendorId: string, id: string, executor: Tx | typeof db = db): Promise<OrderRow | null> {
    const [row] = await readOrders(executor, sql`o.vendor_id = ${vendorId} AND o.id = ${id}`, 1)
    return row ?? null
  },

  async orders(vendorId: string, limit = 20) {
    return readOrders(db, sql`o.vendor_id = ${vendorId}`, limit)
  },

  async lockOrder(tx: Tx, id: string) {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`garage-supply-order:${id}`})::bigint)`)
  },

  async markReceived(tx: Tx, id: string, expenseId: string | null, receivedAt: Date) {
    await tx
      .update(garageSupplyOrders)
      .set({ status: 'received', receivedAt, expenseId })
      .where(eq(garageSupplyOrders.id, id))
  },

  async setPackPrice(vendorId: string, itemId: string, packPricePaise: number) {
    await db
      .update(garageStockItems)
      .set({ packPricePaise })
      .where(and(eq(garageStockItems.vendorId, vendorId), eq(garageStockItems.id, itemId)))
  },

  async lowItemsNamed(vendorId: string) {
    const rows = await db.execute<{ name: string }>(sql`
      SELECT name FROM garage_stock_items
       WHERE vendor_id = ${vendorId} AND deleted_at IS NULL AND low_at > 0 AND level <= low_at ORDER BY name
    `)
    return Array.from(rows).map((row) => row.name)
  },
}

async function readOrders(executor: Tx | typeof db, where: ReturnType<typeof sql>, limit: number): Promise<OrderRow[]> {
  const rows = await executor.execute<{
    id: string
    supplier_id: string
    supplier_name: string
    supplier_phone: string | null
    status: GarageSupplyOrderStatus
    lines: GarageSupplyOrderLine[] | string
    total_paise: number | string
    sent_at: Date | string
    received_at: Date | string | null
    expense_id: string | null
  }>(sql`
    SELECT o.id, o.supplier_id, s.name AS supplier_name, s.phone AS supplier_phone, o.status, o.lines,
           o.total_paise, o.sent_at, o.received_at, o.expense_id
      FROM garage_supply_orders o JOIN garage_suppliers s ON s.id = o.supplier_id
     WHERE ${where}
     ORDER BY o.sent_at DESC
     LIMIT ${limit}
  `)
  return Array.from(rows).map((row) => ({
    id: row.id,
    supplierId: row.supplier_id,
    supplierName: row.supplier_name,
    supplierPhone: row.supplier_phone,
    status: row.status,
    lines: typeof row.lines === 'string' ? (JSON.parse(row.lines) as GarageSupplyOrderLine[]) : row.lines,
    totalPaise: num(row.total_paise),
    sentAt: at(row.sent_at)!,
    receivedAt: at(row.received_at),
    expenseId: row.expense_id,
  }))
}
