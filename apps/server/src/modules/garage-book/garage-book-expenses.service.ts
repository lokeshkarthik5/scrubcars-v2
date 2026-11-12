import { randomUUID } from 'node:crypto'
import { AppError } from '../../lib/errors.js'
import {
  EXPENSE_CATEGORIES,
  GARAGE_BOOK_2_LIMITS,
  istMonth,
  monthBounds,
  nextMonth,
  sameDayIn,
  type ExpenseCategory,
} from '../../lib/garage-book.js'
import { addDays, istDateKey } from '../../lib/ist.js'
import { expensesRepository as repo, type ExpenseRow } from './garage-book-expenses.repository.js'
import { garageBookRepository } from './garage-book.repository.js'
import type { CreateExpenseInput, UpdateExpenseInput } from './garage-book.validation.js'
import { notFound, type Viewer } from './garage-book.viewer.js'

/**
 * Expenses (0074; owner only, routes and all). What the garage spends, so
 * Profit is real: profit = takings − spent, where takings is the whole
 * garage's, exactly as Stats counts them (own walk-ins paid at the job,
 * money paid back, and Detlio earnings for the month).
 *
 * "Every month" (rent, salaries): the expense is copied into each later
 * month when that month is first read, never ahead of today's month, once
 * per month (a unique index on the series and month). Switching it off, or
 * deleting the latest copy, stops the series there.
 */

function view(row: ExpenseRow) {
  return {
    id: row.id,
    category: row.category,
    amountPaise: row.amountPaise,
    spentOn: row.spentOn,
    note: row.note,
    method: row.method,
    member: row.memberId ? { id: row.memberId, name: row.memberName ?? '' } : null,
    everyMonth: row.everyMonth,
    fromOrder: row.supplyOrderId ? { id: row.supplyOrderId, supplier: row.supplierName } : null,
  }
}

/** A date the owner may write an expense on: within the last year, or the next month. */
function checkSpentOn(spentOn: string, now: Date) {
  const today = istDateKey(now)
  if (spentOn < addDays(today, -400) || spentOn > addDays(today, 31)) {
    throw new AppError(400, 'Pick a date within the last year.', 'WHEN_OUT_OF_RANGE')
  }
}

export const expensesService = {
  /**
   * Copies each "every month" series forward into `month`, from its latest
   * month, never past today's month and at most two years at once.
   */
  async ensureRepeats(vendorId: string, month: string, now = new Date()) {
    const target = month < istMonth(now) ? month : istMonth(now)
    const series = await repo.latestInSeries(vendorId, target)
    for (const row of series) {
      if (!row.everyMonth || row.deleted || row.seriesMonth >= target) continue
      let copyMonth = row.seriesMonth
      for (let n = 0; n < GARAGE_BOOK_2_LIMITS.repeatMonthsMax && copyMonth < target; n++) {
        copyMonth = nextMonth(copyMonth)
        await repo.insertRepeat({
          vendorId,
          category: row.category,
          amountPaise: row.amountPaise,
          spentOn: sameDayIn(copyMonth, row.spentOn),
          note: row.note,
          method: row.method,
          memberId: row.memberId,
          everyMonth: true,
          seriesId: row.seriesId,
          seriesMonth: copyMonth,
          createdBy: row.createdBy,
        })
      }
    }
  },

  /** What one month spent, and its profit. */
  async month(viewer: Viewer, month: string | undefined, now = new Date()) {
    const key = month ?? istMonth(now)
    const bounds = monthBounds(key)
    if (!bounds) throw new AppError(400, 'A month as YYYY-MM', 'INVALID_MONTH')
    await this.ensureRepeats(viewer.vendorId, key, now)
    const [rows, taken] = await Promise.all([
      repo.between(viewer.vendorId, `${key}-01`, `${nextMonth(key)}-01`),
      garageBookRepository.takings(viewer.vendorId, bounds.start, bounds.end),
    ])
    const totals = Object.fromEntries(EXPENSE_CATEGORIES.map((category) => [category, 0])) as Record<ExpenseCategory, number>
    for (const row of rows) totals[row.category] += row.amountPaise
    const spentPaise = rows.reduce((sum, row) => sum + row.amountPaise, 0)
    const takenPaise = taken.ownPaise + taken.detlioPaise
    return {
      month: key,
      expenses: rows.map(view),
      totals,
      spentPaise,
      takenPaise,
      profitPaise: takenPaise - spentPaise,
    }
  },

  async create(viewer: Viewer, input: CreateExpenseInput, now = new Date()) {
    checkSpentOn(input.spentOn, now)
    if (input.memberId && !(await repo.memberExists(viewer.vendorId, input.memberId))) notFound('Team member')
    const id = randomUUID()
    const everyMonth = input.everyMonth ?? false
    await repo.insert({
      id,
      vendorId: viewer.vendorId,
      category: input.category,
      amountPaise: input.amountPaise,
      spentOn: input.spentOn,
      note: input.note?.trim() || null,
      method: input.method ?? null,
      memberId: input.memberId ?? null,
      everyMonth,
      // Its own series from the start when it repeats, so its copies can find it.
      seriesId: everyMonth ? id : null,
      seriesMonth: everyMonth ? input.spentOn.slice(0, 7) : null,
      createdBy: viewer.userId,
    })
    return view((await repo.one(viewer.vendorId, id))!)
  },

  async update(viewer: Viewer, id: string, input: UpdateExpenseInput, now = new Date()) {
    const row = await repo.one(viewer.vendorId, id)
    if (!row) notFound('Expense')
    if (input.spentOn) checkSpentOn(input.spentOn, now)
    if (row.seriesId && input.spentOn && input.spentOn.slice(0, 7) !== row.spentOn.slice(0, 7)) {
      throw new AppError(
        400,
        'A monthly expense stays in its month. Delete it and add it again in the other month.',
        'REPEAT_MONTH_FIXED'
      )
    }
    if (input.memberId && !(await repo.memberExists(viewer.vendorId, input.memberId))) notFound('Team member')
    // A supply order's bill keeps its amount and category: the order says what it cost.
    if (row.supplyOrderId && (input.amountPaise !== undefined || input.category !== undefined)) {
      throw new AppError(400, 'This came from a supply order, so its amount stays as ordered.', 'EXPENSE_FROM_ORDER')
    }
    const startsSeries = input.everyMonth === true && !row.seriesId
    const spentOn = input.spentOn ?? row.spentOn
    await repo.update(viewer.vendorId, id, {
      ...(input.category !== undefined ? { category: input.category } : {}),
      ...(input.amountPaise !== undefined ? { amountPaise: input.amountPaise } : {}),
      ...(input.spentOn !== undefined ? { spentOn: input.spentOn } : {}),
      ...(input.note !== undefined ? { note: input.note?.trim() || null } : {}),
      ...(input.method !== undefined ? { method: input.method } : {}),
      ...(input.memberId !== undefined ? { memberId: input.memberId } : {}),
      ...(input.everyMonth !== undefined ? { everyMonth: input.everyMonth } : {}),
      ...(startsSeries ? { seriesId: id, seriesMonth: spentOn.slice(0, 7) } : {}),
    })
    return view((await repo.one(viewer.vendorId, id))!)
  },

  async remove(viewer: Viewer, id: string) {
    const row = await repo.one(viewer.vendorId, id)
    if (!row) notFound('Expense')
    await repo.softDelete(viewer.vendorId, id)
    return { id, deleted: true }
  },

  /** Spent in a month, for Stats' profit: null when nothing was written down that month. */
  async spentIn(vendorId: string, month: string, now = new Date(), options: { copy?: boolean } = {}) {
    if (options.copy !== false) await this.ensureRepeats(vendorId, month, now)
    const spent = await repo.spent(vendorId, `${month}-01`, `${nextMonth(month)}-01`)
    return spent.count > 0 ? spent.totalPaise : null
  },
}
