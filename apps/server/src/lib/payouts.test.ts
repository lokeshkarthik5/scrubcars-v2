import { describe, expect, test } from 'bun:test'
import { queuePositions, type QueuedChain } from './commission.js'
import {
  PAYOUT_CYCLE_HOURS,
  bookingBalance,
  bookingEarning,
  firstNameOf,
  isOverdue,
  maskAccountNumber,
  maskUpiId,
  maskedAccount,
  payableFrom,
  planPayout,
  statementLines,
  summariseBalance,
  type EarningChain,
  type SettledPart,
} from './payouts.js'
import { paidInAll } from './gift-credit.js'

const HOUR = 60 * 60 * 1000
const DONE = new Date('2026-10-16T06:00:00.000Z')
const SLOT = new Date('2026-10-16T04:30:00.000Z')

let nextId = 0
const chain = (overrides: Partial<EarningChain> = {}): EarningChain => ({
  rootId: `r${String(++nextId).padStart(4, '0')}`,
  vendorId: 'marina',
  status: 'completed',
  noShow: null,
  paymentMethod: 'online',
  paymentStatus: 'paid',
  paymentRefunded: '0.00',
  amount: '500.00',
  subtotalAmount: '500.00',
  discountFundedBy: null,
  items: [{ category: 'car_wash', amount: '500.00', pricingType: 'flat', sortOrder: 0 }],
  billsPaid: null,
  lastBillPaidAt: null,
  refunds: [],
  scheduledAt: SLOT,
  completedAt: DONE,
  cancelledAt: null,
  noShowMarkedAt: null,
  markedTest: false,
  ...overrides,
})

/** Past the free 25. */
const PAYING = 26

describe('bookingEarning — commission rates', () => {
  test('8% on a car wash', () => {
    const e = bookingEarning(chain(), PAYING)
    expect(e.kind).toBe('job')
    expect(e.pricePaise).toBe(50_000)
    expect(e.commissionRates).toEqual([0.08])
    expect(e.commissionPaise).toBe(4_000)
    expect(e.sharePaise).toBe(46_000)
    expect(e.duePaise).toBe(46_000)
  })

  test('8% on a package and on others', () => {
    for (const category of ['package', 'others'] as const) {
      const e = bookingEarning(
        chain({ items: [{ category, amount: '500.00', pricingType: 'flat', sortOrder: 0 }] }),
        PAYING
      )
      expect(e.commissionPaise).toBe(4_000)
    }
  })

  test('5% on detailing, coating and scratch removal', () => {
    for (const category of ['detailing', 'coating', 'scratch_removal'] as const) {
      const e = bookingEarning(
        chain({
          amount: '2000.00',
          subtotalAmount: '2000.00',
          items: [{ category, amount: '2000.00', pricingType: 'flat', sortOrder: 0 }],
        }),
        PAYING
      )
      expect(e.commissionRates).toEqual([0.05])
      expect(e.commissionPaise).toBe(10_000)
      expect(e.sharePaise).toBe(190_000)
    }
  })

  test('a mixed booking is charged per item and lists both rates', () => {
    const e = bookingEarning(
      chain({
        amount: '2500.00',
        subtotalAmount: '2500.00',
        items: [
          { category: 'car_wash', amount: '500.00', pricingType: 'flat', sortOrder: 0 },
          { category: 'detailing', amount: '2000.00', pricingType: 'flat', sortOrder: 1 },
        ],
      }),
      PAYING
    )
    expect(e.commissionRates).toEqual([0.08, 0.05])
    expect(e.commissionPaise).toBe(4_000 + 10_000)
  })
})

describe('bookingEarning — a service’s own rate is not for payouts (0061)', () => {
  test('a line with its own commission percent is still charged at its category’s rate', () => {
    const e = bookingEarning(
      chain({ items: [{ category: 'car_wash', amount: '500.00', pricingType: 'flat', sortOrder: 0, overrideRate: 0.2 }] }),
      PAYING
    )
    // 8% of 500, not 20%.
    expect(e.commissionPaise).toBe(4_000)
  })
})

describe('bookingEarning — the free 25', () => {
  test('the first 25 received bookings carry no commission, and say which one they were', () => {
    const e = bookingEarning(chain(), 12)
    expect(e.commissionPaise).toBe(0)
    expect(e.freePosition).toBe(12)
    expect(e.commissionRates).toEqual([])
    expect(e.sharePaise).toBe(50_000)
  })

  test('the 25th is free and the 26th is not', () => {
    expect(bookingEarning(chain(), 25).commissionPaise).toBe(0)
    expect(bookingEarning(chain(), 26).commissionPaise).toBe(4_000)
    expect(bookingEarning(chain(), 26).freePosition).toBeNull()
  })

  test('cancelled bookings use up places in the 25 (the queue is lib/commission.ts)', () => {
    const queue: QueuedChain[] = Array.from({ length: 27 }, (_, i) => ({
      rootId: `q${String(i).padStart(3, '0')}`,
      vendorId: 'marina',
      bookedAt: new Date(DONE.getTime() + i * 60_000),
      // Every fifth one was cancelled after it was paid: still received.
      status: i % 5 === 0 ? 'cancelled' : 'completed',
      acceptedBy: null,
      paymentStatus: i % 5 === 0 ? 'refunded' : 'paid',
      markedTest: false,
    }))
    const positions = queuePositions(queue)
    expect(positions.get('q024')).toBe(25)
    expect(positions.get('q025')).toBe(26)
    const e = bookingEarning(chain({ rootId: 'q025' }), positions.get('q025'))
    expect(e.commissionPaise).toBe(4_000)
  })
})

describe('bookingEarning — promos', () => {
  test('a promo Detlio funds is Detlio’s cost: the garage earns and is charged on the full price', () => {
    // ₹2,000 detailing, ₹200 off paid by Detlio: the customer paid ₹1,800.
    const e = bookingEarning(
      chain({
        amount: '1800.00',
        subtotalAmount: '2000.00',
        discountFundedBy: 'platform',
        items: [{ category: 'detailing', amount: '2000.00', pricingType: 'flat', sortOrder: 0 }],
      }),
      PAYING
    )
    expect(e.detlioPromoPaise).toBe(20_000)
    expect(e.garagePromoPaise).toBe(0)
    expect(e.collectedPaise).toBe(180_000)
    expect(e.commissionPaise).toBe(10_000)
    expect(e.sharePaise).toBe(190_000)
  })

  test('a promo the garage funds comes off what it earns, and off what commission is charged on', () => {
    // ₹2,000 detailing, ₹400 off paid by the garage.
    const e = bookingEarning(
      chain({
        amount: '1600.00',
        subtotalAmount: '2000.00',
        discountFundedBy: 'vendor',
        items: [{ category: 'detailing', amount: '2000.00', pricingType: 'flat', sortOrder: 0 }],
      }),
      PAYING
    )
    expect(e.detlioPromoPaise).toBe(0)
    expect(e.garagePromoPaise).toBe(40_000)
    expect(e.earnedPaise).toBe(160_000)
    expect(e.commissionPaise).toBe(8_000)
    expect(e.sharePaise).toBe(152_000)
  })
})

describe('bookingEarning — final bills', () => {
  test('a paid final bill is the garage’s, charged at the main service’s rate', () => {
    // ₹300 scratch check, then a ₹1,500 bill: ₹1,200 more paid in the app.
    const billPaidAt = new Date(DONE.getTime() + 5 * HOUR)
    const e = bookingEarning(
      chain({
        amount: '300.00',
        subtotalAmount: '300.00',
        items: [{ category: 'scratch_removal', amount: '300.00', pricingType: 'on_inspection', sortOrder: 0 }],
        billsPaid: '1200.00',
        lastBillPaidAt: billPaidAt,
      }),
      PAYING
    )
    expect(e.pricePaise).toBe(150_000)
    expect(e.commissionPaise).toBe(7_500)
    expect(e.sharePaise).toBe(142_500)
    // Payable once the bill is paid, not before.
    expect(e.payableFrom).toEqual(billPaidAt)
  })

  test('the bill is charged in full even when Detlio funded a promo at checkout', () => {
    const e = bookingEarning(
      chain({
        amount: '200.00',
        subtotalAmount: '300.00',
        discountFundedBy: 'platform',
        items: [{ category: 'car_wash', amount: '300.00', pricingType: 'on_inspection', sortOrder: 0 }],
        billsPaid: '1200.00',
      }),
      PAYING
    )
    // Commission on ₹300 + ₹1,200 at 8%.
    expect(e.commissionPaise).toBe(12_000)
    expect(e.sharePaise).toBe(150_000 - 12_000)
  })
})

describe('bookingEarning — extra work (0041)', () => {
  test('paid extra work is the garage’s, in the price and charged at the main service’s rate', () => {
    const paidAt = new Date(DONE.getTime() - HOUR)
    const e = bookingEarning(chain({ billsPaid: '450.00', lastBillPaidAt: paidAt }), PAYING)
    expect(e.pricePaise).toBe(95_000)
    expect(e.commissionPaise).toBe(7_600)
    expect(e.sharePaise).toBe(87_400)
    // Paid before the job was completed: payable from completion as usual.
    expect(e.payableFrom).toEqual(DONE)
  })
})

describe('bookingEarning — refunds', () => {
  test('a part refund comes off the garage’s figure, and its commission shrinks with it', () => {
    const e = bookingEarning(
      chain({ paymentRefunded: '100.00', refunds: [{ amount: '100.00', gatewayStatus: null }] }),
      PAYING
    )
    expect(e.refundsPaise).toBe(10_000)
    expect(e.earnedPaise).toBe(40_000)
    expect(e.commissionPaise).toBe(3_200)
    expect(e.sharePaise).toBe(36_800)
  })

  test('a full refund leaves nothing earned and no commission', () => {
    const e = bookingEarning(
      chain({
        paymentStatus: 'refunded',
        paymentRefunded: '500.00',
        refunds: [{ amount: '500.00', gatewayStatus: 'processed' }],
      }),
      PAYING
    )
    expect(e.kind).toBe('job')
    expect(e.sharePaise).toBe(0)
    expect(e.commissionPaise).toBe(0)
    expect(e.duePaise).toBe(0)
  })

  test('a full refund of a Detlio-promo booking leaves nothing either: Detlio’s part of the refund is Detlio’s', () => {
    const e = bookingEarning(
      chain({
        amount: '1800.00',
        subtotalAmount: '2000.00',
        discountFundedBy: 'platform',
        items: [{ category: 'detailing', amount: '2000.00', pricingType: 'flat', sortOrder: 0 }],
        paymentStatus: 'refunded',
        refunds: [{ amount: '1800.00', gatewayStatus: null }],
      }),
      PAYING
    )
    expect(e.refundSharePaise).toBe(200_000)
    expect(e.sharePaise).toBe(0)
  })

  test('a failed refund moved no money and is ignored', () => {
    const e = bookingEarning(
      chain({ refunds: [{ amount: '500.00', gatewayStatus: 'failed' }] }),
      PAYING
    )
    expect(e.refundsPaise).toBe(0)
    expect(e.sharePaise).toBe(46_000)
  })

  test('a pending refund already counts: the money is on its way back', () => {
    const e = bookingEarning(chain({ refunds: [{ amount: '50.00', gatewayStatus: 'pending' }] }), 3)
    expect(e.sharePaise).toBe(45_000)
  })
})

describe('bookingEarning — no-shows and cancellations', () => {
  test('a customer no-show with the payment kept earns as if the job happened, payable when recorded', () => {
    const marked = new Date(SLOT.getTime() + 2 * HOUR)
    const e = bookingEarning(
      chain({ status: 'cancelled', noShow: 'customer', completedAt: null, cancelledAt: marked, noShowMarkedAt: marked }),
      PAYING
    )
    expect(e.kind).toBe('customer_no_show')
    expect(e.sharePaise).toBe(46_000)
    expect(e.payableFrom).toEqual(marked)
  })

  test('a garage no-show, a decline and a customer cancellation earn nothing', () => {
    for (const overrides of [
      { status: 'cancelled', noShow: 'garage' as const, paymentStatus: 'refunded' },
      { status: 'cancelled', noShow: null, paymentStatus: 'paid' },
    ]) {
      const e = bookingEarning(chain({ ...overrides, completedAt: null }), PAYING)
      expect(e.kind).toBeNull()
      expect(e.duePaise).toBe(0)
    }
  })

  test('a job not finished yet earns nothing yet', () => {
    expect(bookingEarning(chain({ status: 'in_progress', completedAt: null }), PAYING).kind).toBeNull()
  })

  test('a booking marked Test earns nothing', () => {
    expect(bookingEarning(chain({ markedTest: true }), PAYING).duePaise).toBe(0)
  })

  test('a completed booking that was never paid for earns nothing', () => {
    expect(bookingEarning(chain({ paymentStatus: 'pending' }), PAYING).kind).toBeNull()
  })
})

describe('bookingEarning — money the garage collected', () => {
  test('cash the garage took itself comes off: it owes Detlio the commission', () => {
    const e = bookingEarning(chain({ paymentMethod: 'cash', paymentStatus: 'collected' }), PAYING)
    expect(e.sharePaise).toBe(46_000)
    expect(e.heldByGaragePaise).toBe(50_000)
    expect(e.duePaise).toBe(-4_000)
  })

  test('within the free 25 a cash job settles to nothing', () => {
    const e = bookingEarning(chain({ paymentMethod: 'cash', paymentStatus: 'collected' }), 4)
    expect(e.duePaise).toBe(0)
  })
})

describe('payableFrom', () => {
  test('an old job with no completion time falls back to its slot', () => {
    expect(payableFrom(chain({ completedAt: null }), 'job')).toEqual(SLOT)
  })
})

const part = (amountPaise: number, overrides: Partial<SettledPart> = {}): SettledPart => ({
  payoutId: 'p1',
  amountPaise,
  reference: 'UTR123',
  paidAt: new Date(DONE.getTime() + 20 * HOUR),
  ...overrides,
})

describe('bookingBalance', () => {
  test('due until paid, then paid', () => {
    expect(bookingBalance({ duePaise: 46_000 }, [])).toEqual({ settledPaise: 0, balancePaise: 46_000, status: 'due' })
    expect(bookingBalance({ duePaise: 46_000 }, [part(46_000)]).status).toBe('paid')
  })

  test('never paid twice: what was paid comes off', () => {
    // A ₹1,200 bill paid after the first payout: only the bill is due.
    expect(bookingBalance({ duePaise: 142_500 }, [part(27_500)]).balancePaise).toBe(115_000)
  })

  test('a refund after a payout is owed back', () => {
    const b = bookingBalance({ duePaise: 0 }, [part(46_000)])
    expect(b.status).toBe('owed_back')
    expect(b.balancePaise).toBe(-46_000)
  })

  test('nothing earned and nothing paid is nothing due', () => {
    expect(bookingBalance({ duePaise: 0 }, []).status).toBe('nothing_due')
  })
})

describe('statements and payouts', () => {
  const now = new Date(DONE.getTime() + 30 * HOUR)

  test('lines leave out bookings that earn nothing and were never paid on', () => {
    const lines = statementLines(
      [chain({ rootId: 'a' }), chain({ rootId: 'b', status: 'cancelled', completedAt: null })],
      new Map([['a', 30], ['b', 31]]),
      new Map()
    )
    expect(lines.map((line) => line.rootId)).toEqual(['a'])
  })

  test('a booking refunded in full after it was paid out keeps its line, owed back', () => {
    const lines = statementLines(
      [chain({ rootId: 'a', paymentStatus: 'refunded', refunds: [{ amount: '500.00', gatewayStatus: null }] })],
      new Map([['a', 30]]),
      new Map([['a', [part(46_000)]]])
    )
    expect(lines[0].balance.status).toBe('owed_back')
  })

  test('the balance nets what is owed back, and only counts what is payable', () => {
    const later = new Date(now.getTime() + HOUR)
    const lines = statementLines(
      [
        chain({ rootId: 'a' }),
        chain({ rootId: 'b', paymentMethod: 'cash', paymentStatus: 'collected' }),
        chain({ rootId: 'c', completedAt: later }),
      ],
      new Map([['a', 30], ['b', 31], ['c', 32]]),
      new Map()
    )
    const summary = summariseBalance(lines, now)
    expect(summary.balancePaise).toBe(46_000 - 4_000)
    expect(summary.bookings).toBe(2)
    expect(summary.oldestUnpaidAt).toEqual(DONE)
    expect(summary.overdue).toBe(true)
  })

  test('overdue is past the 24-hour cycle', () => {
    expect(PAYOUT_CYCLE_HOURS).toBe(24)
    expect(isOverdue(DONE, new Date(DONE.getTime() + 24 * HOUR))).toBe(false)
    expect(isOverdue(DONE, new Date(DONE.getTime() + 24 * HOUR + 1))).toBe(true)
    expect(isOverdue(null, now)).toBe(false)
  })

  test('a payout covers every line payable by its moment, for exactly their balance', () => {
    const lines = statementLines(
      [chain({ rootId: 'a' }), chain({ rootId: 'b', completedAt: new Date(DONE.getTime() + HOUR) })],
      new Map([['a', 30], ['b', 31]]),
      new Map([['a', [part(20_000)]]])
    )
    const plan = planPayout(lines, now)
    expect(plan.ok).toBe(true)
    if (!plan.ok) return
    expect(plan.amountPaise).toBe(26_000 + 46_000)
    expect(plan.coversFrom).toEqual(DONE)
    expect(plan.coversUpTo).toEqual(now)
    // Once recorded, nothing is due on either.
    const after = statementLines(
      [chain({ rootId: 'a' }), chain({ rootId: 'b', completedAt: new Date(DONE.getTime() + HOUR) })],
      new Map([['a', 30], ['b', 31]]),
      new Map([
        ['a', [part(20_000), part(26_000, { payoutId: 'p2' })]],
        ['b', [part(46_000, { payoutId: 'p2' })]],
      ])
    )
    expect(planPayout(after, now)).toEqual({ ok: false, reason: 'nothing_due' })
  })

  test('nothing is paid while the garage owes Detlio more than it is owed', () => {
    const lines = statementLines(
      [chain({ rootId: 'a', paymentMethod: 'cash', paymentStatus: 'collected' })],
      new Map([['a', 30]]),
      new Map()
    )
    expect(planPayout(lines, now)).toEqual({ ok: false, reason: 'owed_back' })
  })
})

describe('payout details', () => {
  test('lists show only the end of an account', () => {
    expect(maskAccountNumber('123456789012')).toBe('••••9012')
    expect(maskUpiId('ravi.k@okaxis')).toBe('ra•••@okaxis')
    expect(maskedAccount({ accountNumber: '123456789012', upiId: 'ravi@ybl' })).toEqual({
      method: 'bank',
      masked: '••••9012',
    })
    expect(maskedAccount({ accountNumber: null, upiId: 'ravi@ybl' })).toEqual({ method: 'upi', masked: 'ra•••@ybl' })
    expect(maskedAccount(null)).toBeNull()
  })
})

describe('firstNameOf', () => {
  test('the first name, past an initial', () => {
    expect(firstNameOf('Booking Bhavana')).toBe('Booking')
    expect(firstNameOf('R. Uday')).toBe('Uday')
    expect(firstNameOf('  ')).toBe('Customer')
    expect(firstNameOf(null)).toBe('Customer')
  })
})

describe('a booking paid with Detlio credit (0049)', () => {
  // consumeIntent writes bookings.amount as the Razorpay part plus the
  // credit part, and payouts read the booking, never the payment's split:
  // gift credit is money Detlio already holds, like a card payment, and not
  // a Detlio-funded promo.
  test('earns the garage exactly what a card payment would, commission unchanged', () => {
    const items = [{ category: 'car_wash' as const, amount: '499.00', pricingType: 'flat', sortOrder: 0 }]
    // The booking's amount as consumeIntent writes it from each payment.
    const byCard = paidInAll({ amount: '499.00', creditAmount: '0.00' })
    const byCredit = paidInAll({ amount: '0.00', creditAmount: '499.00' })
    const byBoth = paidInAll({ amount: '199.00', creditAmount: '300.00' })
    const card = bookingEarning(chain({ amount: byCard, subtotalAmount: '499.00', items }), PAYING)
    expect(bookingEarning(chain({ amount: byCredit, subtotalAmount: '499.00', items }), PAYING)).toEqual(card)
    expect(bookingEarning(chain({ amount: byBoth, subtotalAmount: '499.00', items }), PAYING)).toEqual(card)
    expect(card.commissionPaise).toBe(Math.round(49_900 * 0.08))
    expect(card.sharePaise).toBe(49_900 - Math.round(49_900 * 0.08))
    expect(card.detlioPromoPaise).toBe(0)
  })

  test('with a promo first and credit after: the promo rules alone decide the garage share', () => {
    const e = bookingEarning(
      chain({ amount: '399.00', subtotalAmount: '499.00', discountFundedBy: 'platform' }),
      PAYING
    )
    // Detlio's promo is Detlio's cost; the credit part changes nothing.
    expect(e.pricePaise).toBe(49_900)
    expect(e.detlioPromoPaise).toBe(10_000)
    expect(e.earnedPaise).toBe(49_900)
  })

  test('a card refund on a part-credit booking comes off in proportion to all the customer paid', () => {
    // ₹199 by card + ₹300 credit; ₹100 of the card part refunded after the job.
    const e = bookingEarning(
      chain({ amount: '499.00', subtotalAmount: '499.00', refunds: [{ amount: '100.00', gatewayStatus: 'processed' }] }),
      PAYING
    )
    expect(e.collectedPaise).toBe(49_900)
    expect(e.refundSharePaise).toBe(10_000)
  })

  test('a cancelled one earns nothing, whether or not its credit has gone back', () => {
    const e = bookingEarning(chain({ status: 'cancelled', paymentStatus: 'refunded', completedAt: null }), PAYING)
    expect(e.kind).toBeNull()
    expect(e.duePaise).toBe(0)
  })
})
