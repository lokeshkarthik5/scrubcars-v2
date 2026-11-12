import { and, eq, sql } from 'drizzle-orm'
import { db } from '../../db/index.js'
import { garageExpenses, type GarageExpenseCategory } from '../../db/schema.js'
import { num, type Tx } from './garage-book.repository.js'

/** Expenses' reads and writes (0073), scoped to the garage resolveTenant produced. */

export interface ExpenseRow {
  id: string
  category: GarageExpenseCategory
  amountPaise: number
  spentOn: string
  note: string | null
  method: 'cash' | 'upi' | 'bank' | null
  memberId: string | null
  memberName: string | null
  everyMonth: boolean
  seriesId: string | null
  seriesMonth: string | null
  supplyOrderId: string | null
  supplierName: string | null
  createdAt: Date
}

export interface NewExpense {
  id?: string
  vendorId: string
  category: GarageExpenseCategory
  amountPaise: number
  spentOn: string
  note: string | null
  method: 'cash' | 'upi' | 'bank' | null
  memberId: string | null
  everyMonth: boolean
  seriesId: string | null
  seriesMonth: string | null
  supplyOrderId?: string | null
  createdBy: string | null
}

async function readExpenses(executor: Tx | typeof db, where: ReturnType<typeof sql>): Promise<ExpenseRow[]> {
  const rows = await executor.execute<{
    id: string
    category: GarageExpenseCategory
    amount_paise: number | string
    spent_on: string | Date
    note: string | null
    method: 'cash' | 'upi' | 'bank' | null
    member_id: string | null
    member_name: string | null
    every_month: boolean
    series_id: string | null
    series_month: string | null
    supply_order_id: string | null
    supplier_name: string | null
    created_at: Date | string
  }>(sql`
    SELECT e.id, e.category, e.amount_paise, e.spent_on::text AS spent_on, e.note, e.method, e.member_id,
           m.name AS member_name, e.every_month, e.series_id, e.series_month, e.supply_order_id,
           s.name AS supplier_name, e.created_at
      FROM garage_expenses e
      LEFT JOIN garage_team_members m ON m.id = e.member_id
      LEFT JOIN garage_supply_orders o ON o.id = e.supply_order_id
      LEFT JOIN garage_suppliers s ON s.id = o.supplier_id
     WHERE ${where}
     ORDER BY e.spent_on DESC, e.created_at DESC
  `)
  return Array.from(rows).map((row) => ({
    id: row.id,
    category: row.category,
    amountPaise: num(row.amount_paise),
    spentOn: String(row.spent_on).slice(0, 10),
    note: row.note,
    method: row.method,
    memberId: row.member_id,
    memberName: row.member_name,
    everyMonth: Boolean(row.every_month),
    seriesId: row.series_id,
    seriesMonth: row.series_month,
    supplyOrderId: row.supply_order_id,
    supplierName: row.supplier_name,
    createdAt: row.created_at instanceof Date ? row.created_at : new Date(row.created_at),
  }))
}

export const expensesRepository = {
  /** The month's expenses (IST dates, the end exclusive), newest first. */
  async between(vendorId: string, startDate: string, endDate: string) {
    return readExpenses(
      db,
      sql`e.vendor_id = ${vendorId} AND e.deleted_at IS NULL AND e.spent_on >= ${startDate}::date AND e.spent_on < ${endDate}::date`
    )
  },

  async one(vendorId: string, id: string, executor: Tx | typeof db = db) {
    const [row] = await readExpenses(executor, sql`e.vendor_id = ${vendorId} AND e.id = ${id} AND e.deleted_at IS NULL`)
    return row ?? null
  },

  async insert(data: NewExpense, executor: Tx | typeof db = db) {
    const [row] = await executor.insert(garageExpenses).values(data).returning({ id: garageExpenses.id })
    return row!
  },

  async update(
    vendorId: string,
    id: string,
    data: Partial<{
      category: GarageExpenseCategory
      amountPaise: number
      spentOn: string
      note: string | null
      method: 'cash' | 'upi' | 'bank' | null
      memberId: string | null
      everyMonth: boolean
      seriesId: string | null
      seriesMonth: string | null
    }>
  ) {
    if (Object.keys(data).length === 0) return
    await db
      .update(garageExpenses)
      .set(data)
      .where(and(eq(garageExpenses.vendorId, vendorId), eq(garageExpenses.id, id)))
  },

  async softDelete(vendorId: string, id: string) {
    await db
      .update(garageExpenses)
      .set({ deletedAt: new Date() })
      .where(and(eq(garageExpenses.vendorId, vendorId), eq(garageExpenses.id, id), sql`${garageExpenses.deletedAt} is null`))
  },

  /**
   * Each "every month" series' latest row on or before a month, deleted or
   * not: a series whose latest row was deleted or switched off stops there.
   */
  async latestInSeries(vendorId: string, month: string) {
    const rows = await db.execute<{
      series_id: string
      series_month: string
      category: GarageExpenseCategory
      amount_paise: number | string
      spent_on: string
      note: string | null
      method: 'cash' | 'upi' | 'bank' | null
      member_id: string | null
      every_month: boolean
      deleted: boolean
      created_by: string | null
    }>(sql`
      SELECT DISTINCT ON (series_id) series_id, series_month, category, amount_paise, spent_on::text AS spent_on,
             note, method, member_id, every_month, deleted_at IS NOT NULL AS deleted, created_by
        FROM garage_expenses
       WHERE vendor_id = ${vendorId} AND series_id IS NOT NULL AND series_month <= ${month}
       ORDER BY series_id, series_month DESC
    `)
    return Array.from(rows).map((row) => ({
      seriesId: row.series_id,
      seriesMonth: row.series_month,
      category: row.category,
      amountPaise: num(row.amount_paise),
      spentOn: String(row.spent_on).slice(0, 10),
      note: row.note,
      method: row.method,
      memberId: row.member_id,
      everyMonth: Boolean(row.every_month),
      deleted: Boolean(row.deleted),
      createdBy: row.created_by,
    }))
  },

  /** A copy of a series for a month, once: a second reader at the same moment finds it there. */
  async insertRepeat(data: NewExpense) {
    await db
      .insert(garageExpenses)
      .values(data)
      .onConflictDoNothing({
        target: [garageExpenses.seriesId, garageExpenses.seriesMonth],
        where: sql`${garageExpenses.seriesId} is not null`,
      })
  },

  /** Spent between two IST dates, all categories. */
  async spent(vendorId: string, startDate: string, endDate: string) {
    const rows = await db.execute<{ total: number | string; n: number | string }>(sql`
      SELECT coalesce(sum(amount_paise), 0) AS total, count(*) AS n FROM garage_expenses
       WHERE vendor_id = ${vendorId} AND deleted_at IS NULL
         AND spent_on >= ${startDate}::date AND spent_on < ${endDate}::date
    `)
    const row = Array.from(rows)[0]
    return { totalPaise: num(row?.total), count: num(row?.n) }
  },

  async memberExists(vendorId: string, memberId: string) {
    const rows = await db.execute<{ ok: boolean }>(sql`
      SELECT EXISTS (SELECT 1 FROM garage_team_members WHERE vendor_id = ${vendorId} AND id = ${memberId} AND deleted_at IS NULL) AS ok
    `)
    return Boolean(Array.from(rows)[0]?.ok)
  },

  /** Every expense the garage kept, for the Excel download. */
  async all(vendorId: string) {
    return readExpenses(db, sql`e.vendor_id = ${vendorId} AND e.deleted_at IS NULL`)
  },
}
