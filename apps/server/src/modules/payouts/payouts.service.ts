import { bookingReference } from '../../lib/booking-ops.js'
import { FREE_BOOKINGS, queuePositions } from '../../lib/commission.js'
import { AppError, hasPgCode } from '../../lib/errors.js'
import { addDays, istDateKey, istMidnight, istParts } from '../../lib/ist.js'
import { logger } from '../../lib/logger.js'
import {
  PAYOUT_CYCLE_HOURS,
  firstNameOf,
  isOverdue,
  maskedAccount,
  paiseToRupees,
  payableLines,
  planPayout,
  statementLines,
  summariseBalance,
  type EarningChain,
  type SettledPart,
  type StatementLine,
} from '../../lib/payouts.js'
import { vendorInBin } from '../../lib/vendor-bin.js'
import {
  payoutsRepository,
  type EarningChainRow,
  type EarningItemRow,
  type GarageRow,
  type PayoutAccountRecord,
  type PayoutItemRecord,
  type PayoutRecord,
  type PayoutsReads,
} from './payouts.repository.js'
import type {
  EarningsStatementQuery,
  PayoutAccountInput,
  RecordPayoutInput,
} from './payouts.validation.js'

const log = logger.child({ module: 'payouts' })

/** Postgres's query_canceled (statement_timeout) and unique_violation. */
const TIMED_OUT = '57014'
const UNIQUE_VIOLATION = '23505'

/** How many of a garage's payouts its page lists. */
const PAYOUT_HISTORY = 100

/** Rupees as the API's figures carry them: a number, to the paisa. */
const rupees = (paise: number) => Number(paiseToRupees(paise))

function groupBy<T>(rows: T[], key: (row: T) => string): Map<string, T[]> {
  const map = new Map<string, T[]>()
  for (const row of rows) {
    const k = key(row)
    const list = map.get(k)
    if (list) list.push(row)
    else map.set(k, [row])
  }
  return map
}

// ─── Reading the lines ───────────────────────────────────────────────────────

interface Loaded {
  lines: StatementLine[]
  chains: Map<string, EarningChainRow & { items: EarningItemRow[] }>
  /** Each garage's received bookings so far, for "booking 12 of your first 25". */
  usedFree: Map<string, number>
}

/**
 * Every statement line of one garage (or all), as lib/payouts.ts works them
 * out from the bookings, their money, the free-25 queue and what payouts
 * have paid so far. Reads one after another on the one connection.
 */
async function loadLines(reads: PayoutsReads, now: Date, vendorId?: string): Promise<Loaded> {
  const rows = await reads.earningChains(vendorId)
  const items = groupBy(await reads.earningItems(vendorId), (item) => item.rootId)
  const refunds = groupBy(await reads.earningRefunds(vendorId), (refund) => refund.rootId)
  const settled = groupBy(await reads.settled(vendorId), (part) => part.rootId)
  // Booked up to now, a minute ahead for a clock a little behind the database's.
  const queue = await reads.queue(new Date(now.getTime() + 60_000), vendorId)
  const positions = queuePositions(queue)

  const usedFree = new Map<string, number>()
  for (const chain of queue) {
    if (positions.has(chain.rootId)) usedFree.set(chain.vendorId, (usedFree.get(chain.vendorId) ?? 0) + 1)
  }

  const chains = new Map<string, EarningChainRow & { items: EarningItemRow[] }>()
  const earning: EarningChain[] = rows.map((row) => {
    const chainItems = (items.get(row.rootId) ?? []).sort((a, b) => a.sortOrder - b.sortOrder)
    chains.set(row.rootId, { ...row, items: chainItems })
    return {
      ...row,
      items: chainItems,
      refunds: (refunds.get(row.rootId) ?? []).map((refund) => ({
        amount: refund.amount,
        gatewayStatus: refund.gatewayStatus,
      })),
    }
  })
  const settledByRoot = new Map<string, SettledPart[]>(
    [...settled].map(([root, parts]) => [
      root,
      parts.map((part) => ({
        payoutId: part.payoutId,
        amountPaise: Math.round(Number(part.amount) * 100),
        reference: part.reference,
        paidAt: part.paidAt,
      })),
    ])
  )
  return { lines: statementLines(earning, positions, settledByRoot), chains, usedFree }
}

/** A read that ran out of time is a 503 with something to do about it, not a 500. */
async function readOnly<T>(work: (reads: PayoutsReads) => Promise<T>): Promise<T> {
  try {
    return await payoutsRepository.readOnly(work)
  } catch (error) {
    if (hasPgCode(error, TIMED_OUT)) {
      log.warn({ err: error }, 'payouts:timed_out')
      throw new AppError(503, 'These figures took too long to work out. Try again in a minute.', 'PAYOUTS_TIMEOUT')
    }
    throw error
  }
}

// ─── Views ───────────────────────────────────────────────────────────────────

/**
 * One booking's line, for the garage's Earnings and admin's Payouts alike.
 * The customer is named by first name only; nothing else about them.
 */
function lineView(line: StatementLine, chain: (EarningChainRow & { items: EarningItemRow[] }) | undefined) {
  const e = line.earning
  return {
    bookingId: line.rootId,
    reference: bookingReference(line.rootId),
    payableFrom: line.payableFrom.toISOString(),
    scheduledAt: chain?.scheduledAt.toISOString() ?? null,
    customerFirstName: firstNameOf(chain?.customerName),
    services: chain?.items.map((item) => item.name) ?? [],
    bookingType: chain?.bookingType ?? null,
    /** 'job', 'customer_no_show', or null when it earns nothing any more. */
    kind: e.kind,
    price: rupees(e.pricePaise),
    detlioPromo: rupees(e.detlioPromoPaise),
    garagePromo: rupees(e.garagePromoPaise),
    /** The garage's part of refunds on it. */
    refunds: rupees(e.refundSharePaise),
    commission: {
      rates: e.commissionRates,
      amount: rupees(e.commissionPaise),
      /** Its place in the first 25 (no commission), or null. */
      freePosition: e.freePosition,
      freeOf: FREE_BOOKINGS,
    },
    share: rupees(e.sharePaise),
    heldByGarage: rupees(e.heldByGaragePaise),
    /** What Detlio owes on it in all, and what is still to settle. */
    due: rupees(e.duePaise),
    paid: rupees(line.balance.settledPaise),
    balance: rupees(line.balance.balancePaise),
    status: line.balance.status,
    payouts: line.settled.map((part) => ({
      payoutId: part.payoutId,
      reference: part.reference,
      paidAt: part.paidAt.toISOString(),
      amount: rupees(part.amountPaise),
    })),
  }
}

function summaryView(lines: StatementLine[], now: Date) {
  const summary = summariseBalance(lines, now)
  return {
    balanceDue: rupees(summary.balancePaise),
    bookingsDue: summary.bookings,
    oldestUnpaidAt: summary.oldestUnpaidAt?.toISOString() ?? null,
    overdue: summary.overdue,
  }
}

function payoutView(payout: PayoutRecord) {
  return {
    id: payout.id,
    amount: Number(payout.amount),
    method: payout.method,
    reference: payout.reference,
    paidAt: payout.paidAt.toISOString(),
    coversFrom: payout.coversFrom.toISOString(),
    coversUpTo: payout.coversUpTo.toISOString(),
  }
}

/** A payout as admin sees it: who recorded it, the note, and what it paid booking by booking. */
function adminPayoutView(payout: PayoutRecord, items: PayoutItemRecord[]) {
  return {
    ...payoutView(payout),
    note: payout.note,
    recordedBy: payout.recordedBy,
    recordedAt: payout.createdAt.toISOString(),
    items: items.map((item) => ({
      bookingId: item.bookingId,
      reference: item.bookingRef,
      kind: item.kind,
      payableFrom: item.payableFrom.toISOString(),
      price: Number(item.price),
      detlioPromo: Number(item.detlioPromo),
      garagePromo: Number(item.garagePromo),
      refunds: Number(item.refunds),
      commission: Number(item.commission),
      freePosition: item.freePosition,
      share: Number(item.garageShare),
      heldByGarage: Number(item.heldByGarage),
      amount: Number(item.amount),
    })),
  }
}

/** Payout details in full: only on the garage's own Payouts page in admin. */
function accountView(account: PayoutAccountRecord | undefined) {
  if (!account) return null
  return {
    accountName: account.accountName,
    accountNumber: account.accountNumber,
    ifsc: account.ifsc,
    upiId: account.upiId,
    updatedBy: account.updatedBy,
    updatedAt: account.updatedAt.toISOString(),
  }
}

function garageView(garage: GarageRow) {
  return {
    id: garage.id,
    name: garage.businessName,
    inBin: garage.deletedAt !== null,
    deleted: garage.purgedAt !== null,
  }
}

// ─── Refusals ────────────────────────────────────────────────────────────────

function garageNotFound() {
  return new AppError(404, 'Garage not found', 'VENDOR_NOT_FOUND')
}

function stateChanged() {
  return new AppError(
    409,
    'The balance changed while this was open: a booking finished, was paid, or was refunded. Nothing was recorded. Check the new figure and record it again.',
    'PAYOUT_STATE_CHANGED'
  )
}

/** The month a moment is in, in IST, as the instants it starts and ends. */
function istMonth(now: Date): { start: Date; end: Date } {
  const p = istParts(now)
  const key = (year: number, month: number) => `${year}-${String(month + 1).padStart(2, '0')}-01`
  const next = p.month === 11 ? key(p.year + 1, 0) : key(p.year, p.month + 1)
  return { start: istMidnight(key(p.year, p.month)), end: istMidnight(next) }
}

/** The days a garage's Earnings list shows when it names none: the last 30, today included. */
export const DEFAULT_STATEMENT_DAYS = 30

export const payoutsService = {
  /**
   * The garage's Earnings: what Detlio owes it now, what it was paid this
   * month, and every booking that earned it money in the range (by the day
   * it became payable), with commission, refunds, its share and whether it
   * has been paid. Owner seats only (the route); one garage only, the
   * tenant's.
   */
  async statement(vendorId: string, query: EarningsStatementQuery, now = new Date()) {
    const today = istDateKey(now)
    const range =
      query.from && query.to
        ? { from: query.from, to: query.to }
        : { from: addDays(today, -(DEFAULT_STATEMENT_DAYS - 1)), to: today }

    return readOnly(async (reads) => {
      const { lines, chains, usedFree } = await loadLines(reads, now, vendorId)
      const month = istMonth(now)
      const paidThisMonth = await reads.paidBetween(vendorId, month.start, month.end)
      const payouts = (await reads.payouts(vendorId, PAYOUT_HISTORY)).filter((payout) => {
        const day = istDateKey(payout.paidAt)
        return day >= range.from && day <= range.to
      })
      const used = usedFree.get(vendorId) ?? 0

      return {
        range,
        cycleHours: PAYOUT_CYCLE_HOURS,
        summary: {
          ...summaryView(lines, now),
          paidThisMonth: Number(paidThisMonth),
          freeBookings: { used: Math.min(used, FREE_BOOKINGS), of: FREE_BOOKINGS },
        },
        lines: lines
          .filter((line) => {
            const day = istDateKey(line.payableFrom)
            return day >= range.from && day <= range.to
          })
          .map((line) => lineView(line, chains.get(line.rootId))),
        payouts: payouts.map(payoutView),
      }
    })
  },

  /**
   * Admin's Payouts list: every garage with money on its statement, with
   * what is due, since when (flagged past the 24-hour cycle), its last
   * payout and how it is paid, masked.
   */
  async list(now = new Date()) {
    return readOnly(async (reads) => {
      const { lines, chains } = await loadLines(reads, now)
      const byGarage = groupBy(lines, (line) => chains.get(line.rootId)!.vendorId)
      const garages = new Map((await reads.garages([...byGarage.keys()])).map((g) => [g.id, g]))
      const lastPayouts = await reads.lastPayouts()
      const accounts = new Map((await reads.accounts()).map((account) => [account.vendorId, account]))

      const rows = [...byGarage].map(([vendorId, garageLines]) => {
        const garage = garages.get(vendorId)
        const last = lastPayouts.get(vendorId)
        return {
          garage: garage
            ? garageView(garage)
            : { id: vendorId, name: 'Garage', inBin: false, deleted: true },
          ...summaryView(garageLines, now),
          lastPayout: last ? { amount: Number(last.amount), paidAt: last.paidAt.toISOString() } : null,
          account: maskedAccount(accounts.get(vendorId) ?? null),
        }
      })
      // Most overdue first, then the most owed, then by name.
      rows.sort(
        (a, b) =>
          Number(b.overdue) - Number(a.overdue) ||
          (a.oldestUnpaidAt ?? '9').localeCompare(b.oldestUnpaidAt ?? '9') ||
          b.balanceDue - a.balanceDue ||
          a.garage.name.localeCompare(b.garage.name)
      )
      const due = rows.filter((row) => row.balanceDue > 0)
      return {
        cycleHours: PAYOUT_CYCLE_HOURS,
        totals: {
          garagesDue: due.length,
          totalDue: rupees(due.reduce((sum, row) => sum + Math.round(row.balanceDue * 100), 0)),
          overdueGarages: due.filter((row) => row.overdue).length,
          oldestUnpaidAt:
            due
              .map((row) => row.oldestUnpaidAt)
              .filter((at): at is string => at !== null)
              .sort()[0] ?? null,
        },
        garages: rows,
      }
    })
  },

  /**
   * One garage's Payouts page: its balance, the bookings Record payout
   * would settle now (and the moment that was worked out at, which the
   * dialog sends back), its payout history with what each paid, and its
   * payout details in full.
   */
  async garage(vendorId: string, now = new Date()) {
    return readOnly(async (reads) => {
      const garage = await reads.garage(vendorId)
      if (!garage) throw garageNotFound()
      const { lines, chains, usedFree } = await loadLines(reads, now, vendorId)
      const payouts = await reads.payouts(vendorId, PAYOUT_HISTORY)
      const items = groupBy(await reads.payoutItems(payouts.map((p) => p.id)), (item) => item.payoutId)
      const account = await reads.account(vendorId)
      const plan = planPayout(lines, now)

      return {
        garage: garageView(garage),
        cycleHours: PAYOUT_CYCLE_HOURS,
        upTo: now.toISOString(),
        summary: summaryView(lines, now),
        freeBookings: { used: Math.min(usedFree.get(vendorId) ?? 0, FREE_BOOKINGS), of: FREE_BOOKINGS },
        /** What Record payout would pay now, or why it can't. */
        payable: plan.ok
          ? { amount: rupees(plan.amountPaise), bookings: plan.lines.length, refusal: null }
          : { amount: 0, bookings: 0, refusal: plan.reason },
        due: payableLines(lines, now).map((line) => lineView(line, chains.get(line.rootId))),
        lines: lines.map((line) => lineView(line, chains.get(line.rootId))),
        payouts: payouts.map((payout) => adminPayoutView(payout, items.get(payout.id) ?? [])),
        account: accountView(account),
      }
    })
  },

  /**
   * Records a payout Detlio has made to a garage, in one transaction:
   *
   *   1. the garage's payout lock, `payouts:<garage>` (taken on its own);
   *   2. its lines worked out again from the rows as they are now;
   *   3. every line payable by `upTo` with a balance is settled, only if
   *      they still come to the amount the dialog showed (409
   *      PAYOUT_STATE_CHANGED otherwise; the same press twice finds nothing
   *      due and is refused too);
   *   4. the payout row, then one item per booking with its figures.
   *
   * A garage in the Bin can still be paid what it earned; a reference used
   * before for the same garage is refused (409 PAYOUT_REFERENCE_USED).
   */
  async record(sub: string, vendorId: string, input: RecordPayoutInput, now = new Date()) {
    const upTo = new Date(input.upTo)
    const paidAt = new Date(input.paidAt)
    // A minute's grace for a browser clock a little ahead.
    if (upTo.getTime() > now.getTime() + 60_000 || paidAt.getTime() > now.getTime() + 60_000) {
      throw new AppError(400, 'That time is in the future. Pick a time up to now.', 'PAYOUT_IN_FUTURE')
    }

    try {
      const payout = await payoutsRepository.transaction(async (repo) => {
        const garage = await repo.garage(vendorId)
        if (!garage) throw garageNotFound()
        await repo.lockGarage(vendorId)

        const { lines } = await loadLines(repo, now, vendorId)
        const plan = planPayout(lines, upTo)
        if (!plan.ok) {
          throw plan.reason === 'owed_back'
            ? new AppError(
                409,
                'This garage owes Detlio more than Detlio owes it. Nothing to pay: it comes off its next payout.',
                'PAYOUT_OWED_BACK'
              )
            : new AppError(409, 'Nothing is due to this garage now.', 'PAYOUT_NOTHING_DUE')
        }
        if (plan.amountPaise !== Math.round(input.amount * 100)) throw stateChanged()

        const row = await repo.insertPayout({
          vendorId,
          amount: paiseToRupees(plan.amountPaise),
          method: input.method,
          reference: input.reference,
          paidAt,
          coversFrom: plan.coversFrom,
          coversUpTo: plan.coversUpTo,
          note: input.note ?? null,
          recordedBy: input.actorName,
          recordedBySub: sub.slice(0, 100),
        })
        const items = await repo.insertItems(
          plan.lines.map((line) => ({
            payoutId: row.id,
            bookingId: line.rootId,
            bookingRef: bookingReference(line.rootId),
            kind: line.earning.kind ?? ('none' as const),
            payableFrom: line.payableFrom,
            price: paiseToRupees(line.earning.pricePaise),
            detlioPromo: paiseToRupees(line.earning.detlioPromoPaise),
            garagePromo: paiseToRupees(line.earning.garagePromoPaise),
            refunds: paiseToRupees(line.earning.refundSharePaise),
            commission: paiseToRupees(line.earning.commissionPaise),
            freePosition: line.earning.freePosition,
            garageShare: paiseToRupees(line.earning.sharePaise),
            heldByGarage: paiseToRupees(line.earning.heldByGaragePaise),
            amount: paiseToRupees(line.balance.balancePaise),
          }))
        )
        return adminPayoutView(row, items)
      })

      log.info(
        { vendorId, payoutId: payout.id, amount: payout.amount, bookings: payout.items.length, by: input.actorName },
        'payouts:recorded'
      )
      return payout
    } catch (error) {
      if (error instanceof AppError) throw error
      if (hasPgCode(error, UNIQUE_VIOLATION)) {
        throw new AppError(
          409,
          'A payout with this reference is already recorded for this garage.',
          'PAYOUT_REFERENCE_USED'
        )
      }
      if (hasPgCode(error, TIMED_OUT)) {
        throw new AppError(503, 'Another payout for this garage is being recorded. Try again in a minute.', 'PAYOUTS_BUSY')
      }
      throw error
    }
  },

  /** A garage's payout details in full (admin only), or null when none are saved. */
  async account(vendorId: string) {
    return readOnly(async (reads) => {
      const garage = await reads.garage(vendorId)
      if (!garage || garage.purgedAt) throw garageNotFound()
      return accountView(await reads.account(vendorId))
    })
  },

  /**
   * Saves a garage's payout details (admin only). A garage in the Bin is
   * read-only, like every other admin write on it; a deleted one is gone.
   */
  async saveAccount(vendorId: string, input: PayoutAccountInput) {
    return payoutsRepository.transaction(async (repo) => {
      const garage = await repo.garage(vendorId)
      if (!garage || garage.purgedAt) throw garageNotFound()
      if (garage.deletedAt) throw vendorInBin()
      const account = await repo.upsertAccount({
        vendorId,
        accountName: input.accountName,
        accountNumber: input.accountNumber,
        ifsc: input.ifsc,
        upiId: input.upiId,
        updatedBy: input.actorName,
      })
      log.info({ vendorId, by: input.actorName }, 'payouts:account_saved')
      return accountView(account)
    })
  },

  async removeAccount(vendorId: string) {
    await payoutsRepository.transaction(async (repo) => {
      const garage = await repo.garage(vendorId)
      if (!garage || garage.purgedAt) throw garageNotFound()
      if (garage.deletedAt) throw vendorInBin()
      await repo.deleteAccount(vendorId)
    })
    log.info({ vendorId }, 'payouts:account_removed')
    return null
  },

  /**
   * The morning digest's line: how many garages Detlio owes, how much in
   * all, and the oldest unpaid booking. Null when nothing is due.
   */
  async dueSummary(now = new Date()): Promise<{ garages: number; total: string; oldestUnpaidAt: Date | null; overdue: boolean } | null> {
    const { totals } = await this.list(now)
    if (totals.garagesDue === 0) return null
    const oldest = totals.oldestUnpaidAt ? new Date(totals.oldestUnpaidAt) : null
    return {
      garages: totals.garagesDue,
      total: totals.totalDue.toFixed(2),
      oldestUnpaidAt: oldest,
      overdue: isOverdue(oldest, now),
    }
  },
}
