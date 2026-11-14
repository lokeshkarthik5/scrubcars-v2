import { env } from '../../lib/env.js'
import { AppError } from '../../lib/errors.js'
import { runInBackground } from '../../lib/background.js'
import {
  GARAGE_BOOK_2_LIMITS,
  istMonth,
  isLow,
  jobsLeft,
  monthBounds,
  rupeesText,
  stockAmount,
  stockAmountText,
  stockShare,
  suggestPacks,
} from '../../lib/garage-book.js'
import { istDateKey } from '../../lib/ist.js'
import { logger } from '../../lib/logger.js'
import type { GarageSupplyOrderLine } from '../../db/schema.js'
import { expensesRepository } from './garage-book-expenses.repository.js'
import { stockRepository as repo, type ItemRow, type OrderRow } from './garage-book-stock.repository.js'
import { garageBookRepository } from './garage-book.repository.js'
import type {
  CreateStockInput,
  StockUsageInput,
  SupplierInput,
  SupplyOrderInput,
  UpdateStockInput,
  UpdateSupplierInput,
} from './garage-book.validation.js'
import { money, normalisePhone, notFound, whatsAppUrl, type Viewer } from './garage-book.viewer.js'

const log = logger.child({ module: 'garage-book-stock' })

/**
 * Stock and supplies (stage 3; owner decisions 6 and 7, 12 Nov).
 *
 *   - Every item has a unit, a level, a low mark and how much each service
 *     uses. Finishing a job takes that off by itself: a walk-in marked done,
 *     or a Detlio booking completed (after the booking's own transaction,
 *     in the background, so it can never fail or slow the booking). A job
 *     uses its stock once, however often it is retried (a unique index).
 *   - "Count it" corrects the level, any seat; the history keeps every move.
 *   - Staff see levels and count; prices, suppliers and orders are the
 *     owner's.
 *   - The garage's own supplier: "Send order on WhatsApp" opens a filled-in
 *     message; "Received" adds the stock and puts the bill in Expenses, once.
 *     Detlio sells nothing.
 */

function monthStart(now: Date) {
  return monthBounds(istMonth(now))!.start
}

/** What one of a job uses, as the dial's "about N washes" counts it: this month's average, else the most a service uses. */
function perJob(row: ItemRow) {
  return row.jobsThisMonth > 0 ? row.usedThisMonth / row.jobsThisMonth : row.maxUse
}

function itemView(viewer: Viewer, row: ItemRow) {
  return {
    id: row.id,
    name: row.name,
    unit: row.unit,
    level: row.level,
    lowAt: row.lowAt,
    packSize: row.packSize,
    share: stockShare(row.level, row.packSize, row.lowAt),
    low: isLow(row.level, row.lowAt),
    jobsLeft: jobsLeft(row.level, perJob(row)),
    usedThisMonth: row.usedThisMonth,
    jobsThisMonth: row.jobsThisMonth,
    supplier: money(viewer, row.supplierId ? { id: row.supplierId, name: row.supplierName ?? '' } : null),
    packPricePaise: money(viewer, row.packPricePaise),
  }
}

function orderView(order: OrderRow) {
  return {
    id: order.id,
    supplier: { id: order.supplierId, name: order.supplierName },
    status: order.status,
    lines: order.lines,
    totalPaise: order.totalPaise,
    sentAt: order.sentAt.toISOString(),
    receivedAt: order.receivedAt?.toISOString() ?? null,
    expenseId: order.expenseId,
  }
}

/** "Foam shampoo 5 L × 2": one order line as the WhatsApp writes it. */
function lineText(line: GarageSupplyOrderLine) {
  const pack = line.packSize ? ` ${stockAmountText(line.packSize, line.unit)}` : ''
  return `• ${line.name}${pack} × ${line.packs}`
}

export function orderMessage(input: { supplier: string; garage: string; lines: GarageSupplyOrderLine[]; totalPaise: number }) {
  return [
    `Hello ${input.supplier}, an order from ${input.garage}:`,
    ...input.lines.map(lineText),
    input.totalPaise > 0 ? `Total ${rupeesText(input.totalPaise)}.` : null,
    'Please send it. Thank you!',
  ]
    .filter(Boolean)
    .join('\n')
}

async function checkSupplier(vendorId: string, supplierId: string | null | undefined) {
  if (supplierId && !(await repo.supplier(vendorId, supplierId))) notFound('Supplier')
}

export const stockService = {
  async stock(viewer: Viewer, now = new Date()) {
    const rows = await repo.items(viewer.vendorId, monthStart(now))
    const items = rows.map((row) => itemView(viewer, row))
    const low = items.filter((item) => item.low)
    return { items, lowCount: low.length, lowNames: low.map((item) => item.name) }
  },

  async item(viewer: Viewer, id: string, now = new Date()) {
    const row = await repo.item(viewer.vendorId, id, monthStart(now))
    if (!row) notFound('Item')
    const [usage, services, moves] = [
      await repo.usage(id),
      await garageBookRepository.priceList(viewer.vendorId),
      await repo.moves(id, 30),
    ]
    const used = new Map(usage.map((row) => [row.serviceId, row.amount]))
    return {
      item: itemView(viewer, row),
      // Every service on the price list, with what one of it uses (0 for none).
      usage: services.map((service) => ({ serviceId: service.id, name: service.name, isAddon: service.isAddon, amount: used.get(service.id) ?? 0 })),
      moves,
    }
  },

  async createItem(viewer: Viewer, input: CreateStockInput, now = new Date()) {
    if ((await repo.countItems(viewer.vendorId)).items >= GARAGE_BOOK_2_LIMITS.stockItemsMax) {
      throw new AppError(400, `Keep ${GARAGE_BOOK_2_LIMITS.stockItemsMax} items at most.`, 'STOCK_FULL')
    }
    await checkSupplier(viewer.vendorId, input.supplierId)
    const level = stockAmount(input.level)
    const { id } = await repo.insertItem({
      vendorId: viewer.vendorId,
      name: input.name.trim(),
      unit: input.unit,
      level,
      lowAt: stockAmount(input.lowAt),
      packSize: input.packSize ? stockAmount(input.packSize) : null,
      packPricePaise: input.packPricePaise ?? null,
      supplierId: input.supplierId ?? null,
    })
    if (level > 0) {
      await repo.transaction((tx) =>
        repo.insertMove(tx, { vendorId: viewer.vendorId, itemId: id, kind: 'manual', delta: level, levelAfter: level, createdBy: viewer.userId })
      )
    }
    return (await this.item(viewer, id, now)).item
  },

  async updateItem(viewer: Viewer, id: string, input: UpdateStockInput, now = new Date()) {
    const row = await repo.item(viewer.vendorId, id, monthStart(now))
    if (!row) notFound('Item')
    await checkSupplier(viewer.vendorId, input.supplierId)
    await repo.updateItem(viewer.vendorId, id, {
      ...(input.name !== undefined ? { name: input.name.trim() } : {}),
      ...(input.unit !== undefined ? { unit: input.unit } : {}),
      ...(input.lowAt !== undefined ? { lowAt: stockAmount(input.lowAt) } : {}),
      ...(input.packSize !== undefined ? { packSize: input.packSize === null ? null : stockAmount(input.packSize) } : {}),
      ...(input.packPricePaise !== undefined ? { packPricePaise: input.packPricePaise } : {}),
      ...(input.supplierId !== undefined ? { supplierId: input.supplierId } : {}),
    })
    return (await this.item(viewer, id, now)).item
  },

  async deleteItem(viewer: Viewer, id: string, now = new Date()) {
    if (!(await repo.item(viewer.vendorId, id, monthStart(now)))) notFound('Item')
    await repo.deleteItem(viewer.vendorId, id)
    return { id, deleted: true }
  },

  /** "Count it": the level as counted, any seat. The difference is kept in the history. */
  async count(viewer: Viewer, id: string, level: number, now = new Date()) {
    const counted = stockAmount(level)
    await repo.transaction(async (tx) => {
      const before = await repo.lockItem(tx, viewer.vendorId, id)
      if (before === null) notFound('Item')
      await repo.insertMove(tx, {
        vendorId: viewer.vendorId,
        itemId: id,
        kind: 'counted',
        delta: stockAmount(counted - before),
        levelAfter: counted,
        createdBy: viewer.userId,
      })
      await repo.setLevel(tx, id, counted)
    })
    return (await this.item(viewer, id, now)).item
  },

  /** How much one of each service uses, the whole list at once (0 takes a service off). */
  async setUsage(viewer: Viewer, id: string, rows: StockUsageInput, now = new Date()) {
    if (!(await repo.item(viewer.vendorId, id, monthStart(now)))) notFound('Item')
    const services = new Set((await garageBookRepository.priceList(viewer.vendorId)).map((service) => service.id))
    if (rows.some((row) => !services.has(row.serviceId))) notFound('Service')
    const byService = new Map(rows.map((row) => [row.serviceId, stockAmount(row.amount)]))
    await repo.transaction((tx) =>
      repo.replaceUsage(
        tx,
        id,
        Array.from(byService, ([serviceId, amount]) => ({ serviceId, amount }))
      )
    )
    return this.item(viewer, id, now)
  },

  /**
   * Takes a finished job's stock off: each item, what the job's services use
   * of it times how many. Once per job and item, however often this runs
   * (the 'used' move is unique), and never below zero. Answers how many
   * items it changed.
   */
  async useForJob(input: {
    vendorId: string
    garageJobId?: string
    bookingId?: string
    lines: Array<{ serviceId: string | null; qty: number }>
    userId: string | null
  }) {
    const qty = new Map<string, number>()
    for (const line of input.lines) {
      if (line.serviceId) qty.set(line.serviceId, (qty.get(line.serviceId) ?? 0) + line.qty)
    }
    if (qty.size === 0) return 0
    const rows = await repo.usageForServices(input.vendorId, [...qty.keys()])
    const byItem = new Map<string, number>()
    for (const row of rows) byItem.set(row.itemId, (byItem.get(row.itemId) ?? 0) + row.amount * (qty.get(row.serviceId) ?? 0))
    let changed = 0
    for (const [itemId, use] of byItem) {
      if (use <= 0) continue
      await repo.transaction(async (tx) => {
        const before = await repo.lockItem(tx, input.vendorId, itemId)
        if (before === null) return
        const after = stockAmount(Math.max(0, before - use))
        const written = await repo.insertMove(tx, {
          vendorId: input.vendorId,
          itemId,
          kind: 'used',
          delta: stockAmount(after - before),
          levelAfter: after,
          garageJobId: input.garageJobId ?? null,
          bookingId: input.bookingId ?? null,
          createdBy: input.userId,
        })
        if (written) {
          await repo.setLevel(tx, itemId, after)
          changed += 1
        }
      })
    }
    return changed
  },

  /**
   * A walk-in just finished: its stock comes off. Best effort: a failure
   * here is logged and never fails the job, which is already saved.
   */
  async afterWalkInDone(vendorId: string, job: { id: string; lines: Array<{ serviceId: string | null; qty: number }> }, userId: string) {
    try {
      await this.useForJob({ vendorId, garageJobId: job.id, lines: job.lines, userId })
    } catch (err) {
      log.error({ err, vendorId, jobId: job.id }, 'stock:walk_in_use_failed')
    }
  },

  /**
   * A Detlio booking was completed (bookings.service, after its transaction):
   * its services' stock comes off in the background, so it can never fail
   * or slow the completion. Nothing while GARAGE_BOOK is off.
   */
  afterDetlioCompletion(vendorId: string, bookingId: string) {
    if (!env.garageBook) return
    runInBackground('garage_book_stock_use', async () => {
      const lines = await repo.bookingServices(vendorId, bookingId)
      // The job used it, not a person: no one is named on the move.
      await this.useForJob({ vendorId, bookingId, lines, userId: null })
    })
  },

  // ─── Suppliers (owner) ─────────────────────────────────────────────────────

  async suppliers(viewer: Viewer) {
    const rows = await repo.suppliers(viewer.vendorId)
    return rows.map((row) => ({ id: row.id, name: row.name, phone: row.phone, lastOrderAt: row.lastOrderAt?.toISOString() ?? null }))
  },

  async createSupplier(viewer: Viewer, input: SupplierInput) {
    if ((await repo.countSuppliers(viewer.vendorId)) >= GARAGE_BOOK_2_LIMITS.suppliersMax) {
      throw new AppError(400, `Keep ${GARAGE_BOOK_2_LIMITS.suppliersMax} suppliers at most.`, 'SUPPLIERS_FULL')
    }
    const row = await repo.insertSupplier({ vendorId: viewer.vendorId, name: input.name.trim(), phone: normalisePhone(input.phone) })
    return { id: row.id, name: row.name, phone: row.phone, lastOrderAt: null }
  },

  async updateSupplier(viewer: Viewer, id: string, input: UpdateSupplierInput) {
    if (!(await repo.supplier(viewer.vendorId, id))) notFound('Supplier')
    await repo.updateSupplier(viewer.vendorId, id, {
      ...(input.name !== undefined ? { name: input.name.trim() } : {}),
      ...(input.phone !== undefined ? { phone: normalisePhone(input.phone) } : {}),
    })
    return (await this.suppliers(viewer)).find((row) => row.id === id)!
  },

  async deleteSupplier(viewer: Viewer, id: string) {
    if (!(await repo.supplier(viewer.vendorId, id))) notFound('Supplier')
    await repo.deleteSupplier(viewer.vendorId, id)
    return { id, deleted: true }
  },

  // ─── Supply orders (owner) ─────────────────────────────────────────────────

  /**
   * An order to the garage's supplier: written as sent, with the WhatsApp
   * filled in (wa.me to the supplier's number, when it is a mobile). A price
   * typed for a line becomes that item's price for next time.
   */
  async createOrder(viewer: Viewer, input: SupplyOrderInput, now = new Date()) {
    const supplier = await repo.supplier(viewer.vendorId, input.supplierId)
    if (!supplier) notFound('Supplier')
    const garage = await garageBookRepository.vendor(viewer.vendorId)
    if (!garage) notFound('Garage')
    const items = new Map((await repo.items(viewer.vendorId, monthStart(now))).map((row) => [row.id, row]))
    const lines: GarageSupplyOrderLine[] = []
    for (const line of input.lines) {
      const item = items.get(line.itemId)
      if (!item) notFound('Item')
      const price = line.packPricePaise ?? item.packPricePaise ?? 0
      if (line.packPricePaise !== undefined && line.packPricePaise !== item.packPricePaise) {
        await repo.setPackPrice(viewer.vendorId, item.id, line.packPricePaise)
      }
      lines.push({ itemId: item.id, name: item.name, packs: line.packs, packSize: item.packSize, unit: item.unit, packPricePaise: price })
    }
    const totalPaise = lines.reduce((sum, line) => sum + line.packs * line.packPricePaise, 0)
    const { id } = await repo.insertOrder({ vendorId: viewer.vendorId, supplierId: supplier.id, lines, totalPaise, createdBy: viewer.userId })
    const message = orderMessage({ supplier: supplier.name, garage: garage.businessName, lines, totalPaise })
    return {
      order: orderView((await repo.order(viewer.vendorId, id))!),
      message,
      whatsappUrl: supplier.phone ? whatsAppUrl(supplier.phone, message) : null,
    }
  },

  async orders(viewer: Viewer) {
    return (await repo.orders(viewer.vendorId)).map(orderView)
  },

  /**
   * The order came: each line's packs go onto its item's level, and the bill
   * goes into Expenses (supplies). Once: a second tap answers the same
   * order and adds nothing.
   */
  async receive(viewer: Viewer, id: string, now = new Date()) {
    const result = await repo.transaction(async (tx) => {
      await repo.lockOrder(tx, id)
      const order = await repo.order(viewer.vendorId, id, tx)
      if (!order) notFound('Order')
      if (order.status === 'received') return { added: false }
      if (order.status === 'cancelled') throw new AppError(400, 'This order was cancelled.', 'ORDER_CANCELLED')
      for (const line of order.lines) {
        const before = await repo.lockItem(tx, viewer.vendorId, line.itemId)
        // An item deleted since the order went: its bill still counts, its stock has nowhere to go.
        if (before === null) continue
        const delta = stockAmount(line.packs * (line.packSize ?? 1))
        const after = stockAmount(before + delta)
        await repo.insertMove(tx, {
          vendorId: viewer.vendorId,
          itemId: line.itemId,
          kind: 'received',
          delta,
          levelAfter: after,
          supplyOrderId: order.id,
          createdBy: viewer.userId,
        })
        await repo.setLevel(tx, line.itemId, after)
      }
      // The bill, when the order had prices: an order with none has nothing to put in Expenses.
      const expense =
        order.totalPaise > 0
          ? await expensesRepository.insert(
              {
                vendorId: viewer.vendorId,
                category: 'supplies',
                amountPaise: order.totalPaise,
                spentOn: istDateKey(now),
                note: order.lines.map((line) => `${line.name} × ${line.packs}`).join(', ').slice(0, 200),
                method: null,
                memberId: null,
                everyMonth: false,
                seriesId: null,
                seriesMonth: null,
                supplyOrderId: order.id,
                createdBy: viewer.userId,
              },
              tx
            )
          : null
      await repo.markReceived(tx, order.id, expense?.id ?? null, now)
      return { added: true }
    })
    const order = (await repo.order(viewer.vendorId, id))!
    return { order: orderView(order), added: result.added }
  },

  /** Low items, grouped by supplier, with the packs to order filled in. */
  async suggest(viewer: Viewer, now = new Date()) {
    const [items, suppliers] = [await repo.items(viewer.vendorId, monthStart(now)), await repo.suppliers(viewer.vendorId)]
    const groups = new Map<string, { supplier: (typeof suppliers)[number] | null; lines: Array<Record<string, unknown>>; totalPaise: number }>()
    for (const item of items.filter((row) => isLow(row.level, row.lowAt))) {
      const key = item.supplierId ?? 'none'
      const group = groups.get(key) ?? { supplier: suppliers.find((s) => s.id === item.supplierId) ?? null, lines: [], totalPaise: 0 }
      const packs = suggestPacks(item.level, item.lowAt, item.packSize)
      group.lines.push({
        itemId: item.id,
        name: item.name,
        unit: item.unit,
        level: item.level,
        packSize: item.packSize,
        packPricePaise: item.packPricePaise,
        packs,
      })
      group.totalPaise += packs * (item.packPricePaise ?? 0)
      groups.set(key, group)
    }
    return {
      groups: Array.from(groups.values()).map((group) => ({
        supplier: group.supplier
          ? { id: group.supplier.id, name: group.supplier.name, phone: group.supplier.phone, lastOrderAt: group.supplier.lastOrderAt?.toISOString() ?? null }
          : null,
        lines: group.lines,
        totalPaise: group.totalPaise,
      })),
    }
  },
}
