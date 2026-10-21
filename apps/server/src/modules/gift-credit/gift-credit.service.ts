import { runInBackground } from '../../lib/background.js'
import { AppError } from '../../lib/errors.js'
import {
  EXPIRING_SOON_DAYS,
  balanceOf,
  expiringWithin,
  nextExpiry,
  paise,
  rupees,
  type CreditEntryKind,
} from '../../lib/gift-credit.js'
import { logger } from '../../lib/logger.js'
import { giftCreditRepository } from './gift-credit.repository.js'

const log = logger.child({ module: 'gift-credit' })

const DAY_MS = 24 * 60 * 60 * 1000
/** Bookings whose credit the cron gives back per run, and customers whose expired credit it writes off. */
const RETURN_SWEEP_LIMIT = 50
const EXPIRY_SWEEP_LIMIT = 50

/** How each ledger row reads on the customer's credit screen. */
const ENTRY_LABELS: Record<CreditEntryKind, string> = {
  redeem: 'Gift redeemed',
  debit: 'Paid for a booking',
  refund: 'Back from a cancelled booking',
  expiry: 'Expired',
  adjustment: 'Adjusted by Detlio',
}

export interface CreditView {
  balance: string
  /** The credit that runs out first, and when. */
  nextExpiry: { amount: string; at: string } | null
  /** Credit that runs out within 30 days. */
  expiringSoon: string
  entries: Array<{
    id: string
    kind: CreditEntryKind
    label: string
    amount: string
    at: string
    expiresAt: string | null
    bookingId: string | null
    /** A team adjustment's reason (admin only; never sent to the customer). */
    reason?: string | null
  }>
}

async function creditView(userId: string, now: Date, options: { withReasons: boolean }): Promise<CreditView> {
  const entries = await giftCreditRepository.listEntries(userId)
  const recent = await giftCreditRepository.listRecentEntries(userId, 50)
  const next = nextExpiry(entries, now)
  return {
    balance: rupees(balanceOf(entries, now)),
    nextExpiry: next ? { amount: rupees(next.paise), at: next.at.toISOString() } : null,
    expiringSoon: rupees(expiringWithin(entries, now, EXPIRING_SOON_DAYS)),
    entries: recent.map((entry) => ({
      id: entry.id,
      kind: entry.kind,
      label: ENTRY_LABELS[entry.kind],
      amount: rupees(paise(entry.amount)),
      at: entry.createdAt.toISOString(),
      expiresAt: entry.expiresAt?.toISOString() ?? null,
      bookingId: entry.bookingId,
      ...(options.withReasons && { reason: entry.reason }),
    })),
  }
}

export const giftCreditService = {
  /** The customer's own credit: balance, what runs out first, and the latest rows. */
  myCredit(userId: string, now = new Date()) {
    return creditView(userId, now, { withReasons: false })
  },

  /** What the customer can spend right now, in paise (checkout). */
  async availablePaise(userId: string, now = new Date()): Promise<number> {
    return balanceOf(await giftCreditRepository.listEntries(userId), now)
  },

  /**
   * After a cancel commits: gives the booking's credit part back, if it had
   * one and its money is owed back. Called from refundsService.queueAutoRefund
   * (every cancel path calls it), whatever AUTO_REFUNDS and GIFTS_ENABLED
   * say: the customer's own money goes back either way. The cron's sweep
   * catches anything this misses.
   */
  returnCreditLater(bookingId: string): void {
    runInBackground('gift_credit_return', () => giftCreditService.returnCredit(bookingId))
  },

  async returnCredit(bookingId: string, now = new Date()) {
    const result = await giftCreditRepository.returnBookingCredit(bookingId, now)
    if (result.kind === 'returned') {
      log.info(
        { bookingId, rootBookingId: result.rootBookingId, userId: result.userId, amount: result.amount },
        'gift_credit:returned'
      )
    }
    return result
  },

  /**
   * The pending-digest cron's part (runs whether or not GIFTS_ENABLED is on,
   * since credit already on accounts must still come back and run out as
   * promised): gives back credit a cancel missed and writes off expired
   * credit. Bounded batches.
   */
  async sweep(options: { dryRun: boolean }, now = new Date()) {
    const toReturn = await giftCreditRepository.listCreditToReturn(RETURN_SWEEP_LIMIT)
    const expiredUsers = await giftCreditRepository.listUsersWithExpiredCredit(now, EXPIRY_SWEEP_LIMIT)
    if (options.dryRun) return { returned: toReturn.length, expiredCustomers: expiredUsers.length, expired: '0.00' }

    let returned = 0
    for (const bookingId of toReturn) {
      try {
        if ((await giftCreditService.returnCredit(bookingId, now)).kind === 'returned') returned += 1
      } catch (err) {
        log.error({ err, bookingId }, 'gift_credit:return_failed')
      }
    }
    let expiredPaise = 0
    for (const userId of expiredUsers) {
      try {
        expiredPaise += await giftCreditRepository.writeExpiries(userId, now)
      } catch (err) {
        log.error({ err, userId }, 'gift_credit:expiry_failed')
      }
    }
    if (expiredPaise > 0) log.info({ customers: expiredUsers.length, amount: rupees(expiredPaise) }, 'gift_credit:expired')
    return { returned, expiredCustomers: expiredUsers.length, expired: rupees(expiredPaise) }
  },

  // ─── Admin ─────────────────────────────────────────────────────────────────

  async customerCredit(userId: string, now = new Date()) {
    const customer = await giftCreditRepository.findCustomerById(userId)
    if (!customer) throw new AppError(404, 'Customer not found', 'CUSTOMER_NOT_FOUND')
    return { customer, credit: await creditView(userId, now, { withReasons: true }) }
  },

  async findCustomer(phone: string, now = new Date()) {
    const customer = await giftCreditRepository.findCustomerByPhone(phone)
    if (!customer) throw new AppError(404, 'No customer has that phone number', 'CUSTOMER_NOT_FOUND')
    return { customer, credit: await creditView(customer.id, now, { withReasons: true }) }
  },

  async adjust(input: { userId: string; amount: number; reason: string; actorName: string; actorSub: string }, now = new Date()) {
    const customer = await giftCreditRepository.findCustomerById(input.userId)
    if (!customer) throw new AppError(404, 'Customer not found', 'CUSTOMER_NOT_FOUND')
    const result = await giftCreditRepository.adjust({
      userId: input.userId,
      amountPaise: Math.round(input.amount * 100),
      reason: input.reason,
      actorName: input.actorName,
      actorSub: input.actorSub,
      now,
    })
    if (result.kind === 'refused') {
      switch (result.refusal) {
        case 'zero':
          throw new AppError(400, 'Enter an amount other than ₹0', 'CREDIT_ADJUSTMENT_ZERO')
        case 'too_large':
          throw new AppError(400, 'One adjustment can be at most ₹10,000', 'CREDIT_ADJUSTMENT_TOO_LARGE')
        case 'over_balance':
          throw new AppError(409, "That's more than the customer's credit", 'CREDIT_ADJUSTMENT_OVER_BALANCE')
      }
    }
    log.info({ userId: input.userId, amount: input.amount, actorName: input.actorName }, 'gift_credit:adjusted')
    return { customer, credit: await creditView(input.userId, now, { withReasons: true }) }
  },

  async outstanding(now = new Date()) {
    const soonBy = new Date(now.getTime() + EXPIRING_SOON_DAYS * DAY_MS)
    const [outstanding, totals] = [
      await giftCreditRepository.outstanding(now, soonBy),
      await giftCreditRepository.totalsByKind(),
    ]
    const negate = (value: string | undefined) => rupees(-paise(value))
    return {
      ...outstanding,
      /** Credit spent on bookings, net of what came back from cancellations. */
      spent: negate(totals.debit),
      returned: totals.refund ?? '0.00',
      expired: negate(totals.expiry),
      adjusted: totals.adjustment ?? '0.00',
    }
  },

  topBalances(now = new Date()) {
    return giftCreditRepository.topBalances(now, 100)
  },

  /** Whether the account has credit records (DELETE /users/me refuses it then). */
  hasCreditRecords(userId: string) {
    return giftCreditRepository.hasCreditEntries(userId)
  },

}
