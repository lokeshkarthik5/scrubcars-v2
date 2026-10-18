import { describe, expect, test } from 'bun:test'
import {
  KEPT_REASONS,
  MAX_CHAINS_PER_RUN,
  MAX_CHECKOUTS_PER_RUN,
  OPEN_ORDER_GRACE_MS,
  confirmPhraseFor,
  countLines,
  groupChains,
  idsToLookUp,
  isDataResetEnabled,
  isFakeGatewayId,
  phraseMatches,
  planReceipts,
  planReset,
  type GatewayModeValue,
  type PlanInput,
  type ResetBooking,
  type ResetCharge,
  type ResetIntent,
  type ResetReceipt,
} from './data-reset.js'

// Fixed clock: the cutoff is launch day, 1 Oct 2026 09:00 IST.
const CUTOFF = new Date('2026-10-01T03:30:00.000Z')
const before = (days: number) => new Date(CUTOFF.getTime() - days * 24 * 60 * 60 * 1000)
const after = (days: number) => new Date(CUTOFF.getTime() + days * 24 * 60 * 60 * 1000)

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`

function booking(n: number, overrides: Partial<ResetBooking> = {}): ResetBooking {
  return {
    id: uuid(n),
    originalBookingId: null,
    status: 'completed',
    paymentMethod: 'online',
    createdAt: before(10),
    scheduledAt: before(9),
    cancelledAt: null,
    markedTestAt: null,
    amount: '499.00',
    vendorId: uuid(900),
    garageName: 'Test Garage',
    userId: uuid(800),
    customerName: 'Team Phone',
    payment: {
      status: 'paid',
      gatewayTxnId: `pay_TEST${n}`,
      gatewayMode: 'test',
      amount: '499.00',
      refundedAmount: null,
    },
    ...overrides,
  }
}

function input(overrides: Partial<PlanInput> = {}): PlanInput {
  return {
    now: after(2),
    scope: { kind: 'before_cutoff', cutoff: CUTOFF },
    only: null,
    bookings: [],
    charges: [],
    intents: [],
    bookingChildCounts: new Map(),
    reschedulesByChain: new Map(),
    intentChildCounts: new Map(),
    receipts: [],
    yearReceipts: [],
    unnumberedReceipts: [],
    counters: new Map(),
    voidsByYear: new Map(),
    lookups: new Map(),
    lookupsUnavailable: false,
    ...overrides,
  }
}

function receipt(root: string, seq: number, fy = '26-27'): ResetReceipt {
  return {
    rootBookingId: root,
    financialYear: fy,
    seq,
    number: `DTL/${fy}/${String(seq).padStart(6, '0')}`,
    issuedAt: before(5),
  }
}

describe('the switch', () => {
  test('only "on" turns it on', () => {
    expect(isDataResetEnabled('on')).toBe(true)
    expect(isDataResetEnabled(' ON ')).toBe(true)
    expect(isDataResetEnabled(undefined)).toBe(false)
    expect(isDataResetEnabled('')).toBe(false)
    expect(isDataResetEnabled('true')).toBe(false)
    expect(isDataResetEnabled('off')).toBe(false)
  })
})

describe('chains', () => {
  test('a reschedule chain is grouped under its first booking, oldest first', () => {
    const root = booking(1, { status: 'cancelled' })
    const moved = booking(2, { originalBookingId: root.id, createdAt: before(8) })
    const movedAgain = booking(3, { originalBookingId: root.id, createdAt: before(7) })
    const chains = groupChains([movedAgain, booking(4), root, moved])
    expect([...chains.keys()].sort()).toEqual([root.id, uuid(4)])
    expect(chains.get(root.id)!.map((b) => b.id)).toEqual([root.id, moved.id, movedAgain.id])
  })

  test('a whole chain goes together, its latest booking shown', () => {
    const root = booking(1, { status: 'cancelled', scheduledAt: before(9) })
    const moved = booking(2, { originalBookingId: root.id, createdAt: before(8), scheduledAt: before(3) })
    const plan = planReset(input({ bookings: [root, moved] }))
    expect(plan.chains).toHaveLength(1)
    expect(plan.chains[0]).toMatchObject({
      rootId: root.id,
      bookingIds: [root.id, moved.id],
      status: 'completed',
      scheduledAt: before(3),
      selected: true,
      kept: null,
    })
    expect(plan.selectedBookingIds).toEqual([root.id, moved.id])
    expect(plan.counts).toMatchObject({ bookings: 1, bookingRows: 2, payments: 2 })
  })

  test('a chain begun before the cutoff but moved after it is kept whole', () => {
    const root = booking(1, { status: 'cancelled' })
    const moved = booking(2, { originalBookingId: root.id, createdAt: after(1) })
    const plan = planReset(input({ bookings: [root, moved] }))
    expect(plan.chains[0]).toMatchObject({ kept: 'after_cutoff', selected: false })
    expect(plan.selectedBookingIds).toEqual([])
    expect(KEPT_REASONS.after_cutoff.label).toBe('Changed after the cutoff — kept')
  })

  test('a chain begun after the cutoff is not in scope at all', () => {
    const plan = planReset(input({ bookings: [booking(1, { createdAt: after(1) })] }))
    expect(plan.chains).toEqual([])
  })

  test('marked Test: only the marked chains, whatever their date', () => {
    const marked = booking(1, { createdAt: after(3), markedTestAt: after(4) })
    const plan = planReset(input({ scope: { kind: 'marked_test' }, bookings: [marked, booking(2)] }))
    expect(plan.chains.map((c) => c.rootId)).toEqual([marked.id])
    expect(plan.chains[0]).toMatchObject({ markedTest: true, selected: true })
  })

  test('one booking on its own: its whole chain, and only once marked Test', () => {
    const root = booking(1, { status: 'cancelled', markedTestAt: after(1) })
    const moved = booking(2, { originalBookingId: root.id, markedTestAt: after(1) })
    const named = planReset(input({ scope: { kind: 'chains', bookingIds: [moved.id] }, bookings: [root, moved] }))
    expect(named.selectedBookingIds).toEqual([root.id, moved.id])

    const unmarked = booking(3)
    const refused = planReset(input({ scope: { kind: 'chains', bookingIds: [unmarked.id] }, bookings: [unmarked] }))
    expect(refused.chains[0]).toMatchObject({ kept: 'not_marked', selected: false })
  })

  test('only the ticked chains go once the owner has reviewed the list', () => {
    const plan = planReset(
      input({
        bookings: [booking(1), booking(2), booking(3)],
        only: { chainIds: [uuid(1), uuid(3)], checkoutIds: [] },
      })
    )
    expect(plan.selectedChainIds).toEqual([uuid(1), uuid(3)])
    expect(plan.chains.find((c) => c.rootId === uuid(2))).toMatchObject({ selected: false, kept: null })
  })

  test('past the cap the oldest are ticked and the rest are counted', () => {
    const rows = Array.from({ length: MAX_CHAINS_PER_RUN + 2 }, (_, i) =>
      booking(i + 1, { createdAt: before(400 - i) })
    )
    const plan = planReset(input({ bookings: rows }))
    expect(plan.selectedChainIds).toHaveLength(MAX_CHAINS_PER_RUN)
    expect(plan.overCap.chains).toBe(2)
    expect(plan.selectedChainIds[0]).toBe(uuid(1))
  })

  test('more ticked than a run takes is clamped to the oldest, not refused', () => {
    // 420 chains, every one ticked by "Tick all" or by hand.
    const rows = Array.from({ length: 420 }, (_, i) => booking(i + 1, { createdAt: before(500 - i) }))
    const plan = planReset(
      input({ bookings: rows, only: { chainIds: rows.map((b) => b.id).reverse(), checkoutIds: [] } })
    )
    expect(plan.selectedChainIds).toEqual(rows.slice(0, MAX_CHAINS_PER_RUN).map((b) => b.id))
    expect(plan.overCap.chains).toBe(420 - MAX_CHAINS_PER_RUN)
    expect(plan.confirmPhrase).toBe(`DELETE ${MAX_CHAINS_PER_RUN} BOOKINGS`)
  })

  test('the unticked and the kept stay in the plan, for the dry run and its list', () => {
    const live = booking(3, {
      payment: { status: 'paid', gatewayTxnId: 'pay_L', gatewayMode: 'live', amount: '1', refundedAmount: null },
    })
    const plan = planReset(
      input({ bookings: [booking(1), booking(2), live], only: { chainIds: [uuid(1)], checkoutIds: [] } })
    )
    expect(plan.chains.map((c) => [c.rootId, c.selected, c.kept])).toEqual([
      [uuid(1), true, null],
      [uuid(2), false, null],
      [uuid(3), false, 'live'],
    ])
  })
})

describe('money', () => {
  const classed = (b: ResetBooking, extra: Partial<PlanInput> = {}) =>
    planReset(input({ bookings: [b], ...extra })).chains[0]

  test('test-mode, E2E and unpaid chains can go', () => {
    expect(classed(booking(1))).toMatchObject({ money: 'test', kept: null })
    expect(
      classed(booking(2, { payment: { status: 'paid', gatewayTxnId: 'pay_e2e_17', gatewayMode: null, amount: '1.00', refundedAmount: null } }))
    ).toMatchObject({ money: 'fake', kept: null })
    expect(
      classed(booking(3, { payment: { status: 'pending', gatewayTxnId: 'order_TEST1', gatewayMode: 'test', amount: '1.00', refundedAmount: null } }))
    ).toMatchObject({ money: 'no_money', kept: null })
    expect(classed(booking(4, { payment: null }))).toMatchObject({ money: 'no_money', kept: null })
  })

  test('live money keeps the chain: "Real payment — kept"', () => {
    const live = classed(
      booking(1, { payment: { status: 'refunded', gatewayTxnId: 'pay_LIVE1', gatewayMode: 'live', amount: '1.00', refundedAmount: '1.00' } })
    )
    expect(live).toMatchObject({ money: 'live', kept: 'live', selected: false, refunded: '1.00' })
    expect(KEPT_REASONS.live.label).toBe('Real payment — kept')
  })

  test('cash keeps the chain', () => {
    const cash = classed(
      booking(1, {
        paymentMethod: 'cash',
        payment: { status: 'collected', gatewayTxnId: null, gatewayMode: null, amount: '499.00', refundedAmount: null },
      })
    )
    expect(cash).toMatchObject({ money: 'cash', kept: 'cash' })
  })

  test('an old payment is classed by what Razorpay said, and waits until asked', () => {
    const old = booking(1, {
      payment: { status: 'paid', gatewayTxnId: 'pay_OLD1', gatewayMode: null, amount: '499.00', refundedAmount: null },
    })
    expect(classed(old)).toMatchObject({ money: 'unchecked', kept: 'unchecked' })
    expect(classed(old, { lookups: new Map([['pay_OLD1', 'test']]) })).toMatchObject({ money: 'test', kept: null })
    expect(classed(old, { lookups: new Map([['pay_OLD1', 'live']]) })).toMatchObject({ money: 'live', kept: 'live' })
    expect(classed(old, { lookups: new Map([['pay_OLD1', 'unknown']]) })).toMatchObject({ money: 'unknown', kept: 'unknown' })
    // Razorpay cannot be asked (E2E, no keys): unknown, never deletable.
    expect(classed(old, { lookupsUnavailable: true })).toMatchObject({ money: 'unknown', kept: 'unknown' })
  })

  test('money taken with no id to look up is unknown', () => {
    const noId = booking(1, {
      payment: { status: 'paid', gatewayTxnId: null, gatewayMode: null, amount: '499.00', refundedAmount: null },
    })
    expect(classed(noId)).toMatchObject({ money: 'unknown', kept: 'unknown' })
  })

  test('a live final bill keeps a chain whose booking was a test', () => {
    const b = booking(1)
    const bill: ResetCharge = {
      id: uuid(50),
      bookingId: b.id,
      status: 'paid',
      amountDue: '800.00',
      gatewayOrderId: 'order_BILL',
      gatewayPaymentId: 'pay_BILL',
      gatewayMode: 'live',
      refundedAmount: null,
      updatedAt: before(5),
    }
    expect(planReset(input({ bookings: [b], charges: [bill] })).chains[0]).toMatchObject({
      money: 'live',
      kept: 'live',
      razorpayIds: ['pay_TEST1', 'pay_BILL'],
    })
    // An unpaid bill carries no money: a test order's bill can go.
    const unpaid = { ...bill, status: 'due', gatewayPaymentId: null, gatewayMode: 'test' as const }
    expect(planReset(input({ bookings: [b], charges: [unpaid] })).chains[0]).toMatchObject({
      money: 'test',
      kept: null,
    })
  })

  test('the ids still to ask Razorpay about, each once and sorted', () => {
    const rows = [
      booking(1, { payment: { status: 'paid', gatewayTxnId: 'pay_B', gatewayMode: null, amount: '1', refundedAmount: null } }),
      booking(2, { payment: { status: 'paid', gatewayTxnId: 'pay_A', gatewayMode: null, amount: '1', refundedAmount: null } }),
      booking(3, { originalBookingId: uuid(2), payment: { status: 'paid', gatewayTxnId: 'pay_A', gatewayMode: null, amount: '1', refundedAmount: null } }),
      booking(4, { payment: { status: 'paid', gatewayTxnId: 'pay_e2e_1', gatewayMode: null, amount: '1', refundedAmount: null } }),
      booking(5),
    ]
    const now = after(2)
    expect(idsToLookUp({ now, bookings: rows, charges: [], intents: [], lookups: new Map() })).toEqual(['pay_A', 'pay_B'])
    expect(
      idsToLookUp({ now, bookings: rows, charges: [], intents: [], lookups: new Map([['pay_A', 'unknown']]) })
    ).toEqual(['pay_B'])
    expect(isFakeGatewayId('order_e2e_x')).toBe(true)
    expect(isFakeGatewayId('order_Abc123')).toBe(false)
  })
})

describe('orders that could still be paid', () => {
  // The clock the plan is made at: two days after the cutoff.
  const NOW = after(2)
  const pending = (txn: string, mode: GatewayModeValue | null) => ({
    status: 'pending',
    gatewayTxnId: txn,
    gatewayMode: mode,
    amount: '499.00',
    refundedAmount: null,
  })
  const keptOf = (b: ResetBooking, extra: Partial<PlanInput> = {}) =>
    planReset(input({ now: NOW, bookings: [b], ...extra })).chains[0]

  test("a live order on a booking that can still be paid keeps it: 'Payment may still arrive'", () => {
    // Pay later: the booking is on, its order opened, nothing captured yet.
    const payLater = booking(1, { status: 'pending', payment: pending('order_LIVE1', 'live') })
    expect(keptOf(payLater)).toMatchObject({ money: 'no_money', kept: 'open_order', selected: false })
    expect(KEPT_REASONS.open_order.label).toBe('Payment may still arrive — kept')
    // A failed attempt can be tried again on the same booking.
    const failed = booking(2, { status: 'pending', payment: { ...pending('order_LIVE2', 'live'), status: 'failed' } })
    expect(keptOf(failed)).toMatchObject({ kept: 'open_order' })
  })

  test('a cancelled booking\'s live order is dead a day after the cancel', () => {
    const cancelled = (at: Date) =>
      booking(1, { status: 'cancelled', cancelledAt: at, payment: pending('order_LIVE1', 'live') })
    // Cancelled an hour ago: a UPI collect could still land.
    expect(keptOf(cancelled(new Date(NOW.getTime() - 60 * 60 * 1000)))).toMatchObject({ kept: 'open_order' })
    // Cancelled just over the grace period ago: nothing can arrive now.
    expect(keptOf(cancelled(new Date(NOW.getTime() - OPEN_ORDER_GRACE_MS - 1000)))).toMatchObject({
      kept: null,
      selected: true,
    })
  })

  test('test and E2E orders never hold a chain back', () => {
    expect(keptOf(booking(1, { status: 'pending', payment: pending('order_TEST1', 'test') }))).toMatchObject({ kept: null })
    expect(keptOf(booking(2, { status: 'pending', payment: pending('order_e2e_abc', null) }))).toMatchObject({ kept: null })
  })

  test('an order from before gateway_mode is kept until Razorpay says it was a test', () => {
    const old = booking(1, { status: 'pending', payment: pending('order_OLD1', null) })
    expect(idsToLookUp({ now: NOW, bookings: [old], charges: [], intents: [], lookups: new Map() })).toEqual([
      'order_OLD1',
    ])
    expect(keptOf(old)).toMatchObject({ kept: 'open_order' })
    expect(keptOf(old, { lookups: new Map([['order_OLD1', 'unknown']]) })).toMatchObject({ kept: 'open_order' })
    expect(keptOf(old, { lookups: new Map([['order_OLD1', 'live']]) })).toMatchObject({ kept: 'open_order' })
    expect(keptOf(old, { lookups: new Map([['order_OLD1', 'test']]) })).toMatchObject({ kept: null })
    // A dead order is not worth asking about.
    const dead = booking(2, {
      status: 'cancelled',
      cancelledAt: before(30),
      payment: pending('order_OLD2', null),
    })
    expect(idsToLookUp({ now: NOW, bookings: [dead], charges: [], intents: [], lookups: new Map() })).toEqual([])
    expect(keptOf(dead)).toMatchObject({ kept: null })
  })

  test("a due bill's live order keeps the chain; a withdrawn one's only for a day", () => {
    const b = booking(1)
    const bill = (overrides: Partial<ResetCharge>): ResetCharge => ({
      id: uuid(50),
      bookingId: b.id,
      status: 'due',
      amountDue: '800.00',
      gatewayOrderId: 'order_BILL',
      gatewayPaymentId: null,
      gatewayMode: 'live',
      refundedAmount: null,
      updatedAt: before(5),
      ...overrides,
    })
    const planOf = (charge: ResetCharge) =>
      planReset(input({ now: NOW, bookings: [b], charges: [charge] })).chains[0]
    expect(planOf(bill({}))).toMatchObject({ money: 'test', kept: 'open_order' })
    expect(planOf(bill({ status: 'cancelled', updatedAt: new Date(NOW.getTime() - 60_000) }))).toMatchObject({
      kept: 'open_order',
    })
    expect(planOf(bill({ status: 'cancelled', updatedAt: before(5) }))).toMatchObject({ kept: null })
    // A due bill with no order opened yet has nothing to capture.
    expect(planOf(bill({ gatewayOrderId: null }))).toMatchObject({ kept: null })
  })

  test('real money is still the first reason given', () => {
    const live = booking(1, {
      status: 'pending',
      payment: { status: 'paid', gatewayTxnId: 'pay_L', gatewayMode: 'live', amount: '1', refundedAmount: null },
    })
    expect(keptOf(live)).toMatchObject({ kept: 'live' })
  })
})

describe('checkouts with no booking', () => {
  const intent = (n: number, overrides: Partial<ResetIntent> = {}): ResetIntent => ({
    id: uuid(n),
    bookingId: null,
    status: 'pending',
    createdAt: before(3),
    expiresAt: before(3),
    amount: '499.00',
    gatewayTxnId: `order_X${n}`,
    paymentRef: null,
    gatewayMode: 'test',
    refundedAmount: null,
    userId: uuid(800),
    customerName: 'Team Phone',
    garageName: 'Test Garage',
    ...overrides,
  })

  test('before the cutoff they go; a paid one only when its money was a test', () => {
    const abandoned = intent(1)
    const failedTest = intent(2, { status: 'failed', paymentRef: 'pay_T', refundedAmount: '499.00' })
    const failedLive = intent(3, { status: 'failed', paymentRef: 'pay_L', gatewayMode: 'live' })
    const late = intent(4, { createdAt: after(1) })
    const plan = planReset(
      input({
        intents: [abandoned, failedTest, failedLive, late],
        intentChildCounts: new Map([
          [failedTest.id, { items: 1, refundRecords: 1 }],
          [abandoned.id, { items: 2, refundRecords: 0 }],
        ]),
      })
    )
    expect(plan.checkouts.map((c) => [c.id, c.money, c.kept, c.selected])).toEqual([
      [abandoned.id, 'no_money', null, true],
      [failedTest.id, 'test', null, true],
      [failedLive.id, 'live', 'live', false],
    ])
    expect(plan.selectedCheckoutIds).toEqual([abandoned.id, failedTest.id])
    expect(plan.counts).toMatchObject({ checkouts: 2, checkoutItems: 3, refundRecords: 1 })
    expect(plan.confirmPhrase).toBe('DELETE 2 CHECKOUTS')
  })

  test('a checkout that can still be paid is kept', () => {
    const open = intent(1, { createdAt: before(0.01), expiresAt: after(3) })
    const plan = planReset(input({ intents: [open] }))
    expect(plan.checkouts[0]).toMatchObject({ kept: 'still_open', selected: false })
  })

  test("a live checkout's order is kept for a day after its sheet closed", () => {
    const now = after(2)
    const justExpired = new Date(now.getTime() - 5 * 60 * 1000)
    const live = intent(1, { createdAt: before(0.01), expiresAt: justExpired, gatewayMode: 'live' })
    const failedLive = intent(2, { status: 'failed', expiresAt: justExpired, gatewayMode: 'live' })
    const oldLive = intent(3, { expiresAt: before(1), gatewayMode: 'live' })
    const testMode = intent(4, { expiresAt: justExpired })
    const plan = planReset(input({ now, intents: [live, failedLive, oldLive, testMode] }))
    // Oldest first: the three opened three days ago, then the recent one.
    expect(plan.checkouts.map((c) => [c.id, c.kept, c.selected])).toEqual([
      [failedLive.id, 'open_order', false],
      [oldLive.id, null, true],
      [testMode.id, null, true],
      [live.id, 'open_order', false],
    ])
  })

  test('more checkouts ticked than a run takes are clamped to the oldest', () => {
    const rows = Array.from({ length: MAX_CHECKOUTS_PER_RUN + 5 }, (_, i) =>
      intent(i + 1, { createdAt: new Date(before(3).getTime() + i * 1000) })
    )
    const plan = planReset(input({ intents: rows, only: { chainIds: [], checkoutIds: rows.map((r) => r.id) } }))
    expect(plan.selectedCheckoutIds).toHaveLength(MAX_CHECKOUTS_PER_RUN)
    expect(plan.selectedCheckoutIds[0]).toBe(uuid(1))
    expect(plan.overCap.checkouts).toBe(5)
  })

  test('only a cutoff run and a garage delete take them', () => {
    const plan = planReset(input({ scope: { kind: 'marked_test' }, intents: [intent(1)] }))
    expect(plan.checkouts).toEqual([])
  })

  test("a booking's own checkout goes with the booking", () => {
    const b = booking(1)
    const own = intent(2, { bookingId: b.id, status: 'consumed' })
    const plan = planReset(input({ bookings: [b], intents: [own] }))
    expect(plan.selectedIntentIds).toEqual([own.id])
    expect(plan.checkouts).toEqual([])
    expect(plan.confirmPhrase).toBe('DELETE 1 BOOKING')
  })
})

describe('a garage deleted forever', () => {
  const GARAGE = uuid(900)
  const garage = { kind: 'garage' as const, vendorId: GARAGE }
  const checkout = (n: number, overrides: Partial<ResetIntent> = {}): ResetIntent => ({
    id: uuid(n),
    bookingId: null,
    status: 'pending',
    createdAt: after(1),
    expiresAt: after(1),
    amount: '499.00',
    gatewayTxnId: `order_X${n}`,
    paymentRef: null,
    gatewayMode: 'test',
    refundedAmount: null,
    userId: uuid(800),
    customerName: 'Team Phone',
    garageName: 'Test Garage',
    ...overrides,
  })

  test('every chain of the garage, whenever made and marked or not; only money keeps one', () => {
    const old = booking(1, { createdAt: before(30) })
    const recent = booking(2, { createdAt: after(1) })
    const live = booking(3, {
      payment: { status: 'paid', gatewayTxnId: 'pay_L3', gatewayMode: 'live', amount: '499.00', refundedAmount: null },
    })
    const plan = planReset(input({ now: after(5), scope: garage, bookings: [old, recent, live] }))
    expect(plan.chains.map((c) => [c.rootId, c.kept, c.selected])).toEqual([
      [old.id, null, true],
      [live.id, 'live', false],
      [recent.id, null, true],
    ])
  })

  test("a chain at another garage is not this garage's to take", () => {
    const elsewhere = booking(1, { vendorId: uuid(901) })
    expect(planReset(input({ scope: garage, bookings: [elsewhere] })).chains).toEqual([])
  })

  test('its abandoned checkouts go with it, whenever opened; one that can still be paid stays', () => {
    const abandoned = checkout(1)
    const open = checkout(2, { expiresAt: after(30) })
    const plan = planReset(input({ now: after(5), scope: garage, intents: [abandoned, open] }))
    expect(plan.checkouts.map((c) => [c.id, c.kept, c.selected])).toEqual([
      [abandoned.id, null, true],
      [open.id, 'still_open', false],
    ])
  })
})

describe('receipts', () => {
  test('a year whose receipts are all test data restarts at 000001', () => {
    const plan = planReceipts({
      deletedRoots: new Set([uuid(1), uuid(2)]),
      receipts: [receipt(uuid(2), 2), receipt(uuid(1), 1)],
      yearReceipts: [
        { financialYear: '26-27', rootBookingId: uuid(1) },
        { financialYear: '26-27', rootBookingId: uuid(2) },
      ],
      unnumberedReceipts: [],
      counters: new Map([['26-27', 2]]),
      voidsByYear: new Map([['26-27', 3]]),
    })
    expect(plan).toEqual([
      {
        financialYear: '26-27',
        mode: 'restart',
        numbers: ['DTL/26-27/000001', 'DTL/26-27/000002'],
        nextNumber: 'DTL/26-27/000001',
        voidsCleared: 3,
        words: 'Numbering restarts at DTL/26-27/000001',
      },
    ])
  })

  test('a year with a real receipt keeps its series: the test numbers are void', () => {
    const plan = planReceipts({
      deletedRoots: new Set([uuid(1), uuid(3), uuid(4)]),
      receipts: [receipt(uuid(1), 1), receipt(uuid(3), 3), receipt(uuid(4), 41)],
      yearReceipts: [1, 2, 3, 4].map((n) => ({ financialYear: '26-27', rootBookingId: uuid(n) })),
      unnumberedReceipts: [],
      counters: new Map([['26-27', 41]]),
      voidsByYear: new Map(),
    })
    expect(plan[0]).toMatchObject({
      mode: 'void',
      numbers: ['DTL/26-27/000001', 'DTL/26-27/000003', 'DTL/26-27/000041'],
      nextNumber: 'DTL/26-27/000042',
      voidsCleared: 0,
      words: 'Receipts DTL/26-27/000001 and 2 others are kept on record as void. The next receipt is DTL/26-27/000042',
    })
  })

  test('a kept booking still owed its number counts as a real receipt in its year', () => {
    const plan = planReceipts({
      deletedRoots: new Set([uuid(1)]),
      receipts: [receipt(uuid(1), 1)],
      yearReceipts: [{ financialYear: '26-27', rootBookingId: uuid(1) }],
      // Paid on 20 Sep 2026, so in 26-27, with no number yet.
      unnumberedReceipts: [{ rootBookingId: uuid(9), issuedAt: new Date('2026-09-20T05:00:00Z') }],
      counters: new Map([['26-27', 1]]),
      voidsByYear: new Map(),
    })
    expect(plan[0]).toMatchObject({
      mode: 'void',
      nextNumber: 'DTL/26-27/000002',
      words: 'Receipt DTL/26-27/000001 is kept on record as void. The next receipt is DTL/26-27/000002',
    })
  })

  test('each year is decided on its own', () => {
    const plan = planReceipts({
      deletedRoots: new Set([uuid(1), uuid(2)]),
      receipts: [receipt(uuid(1), 1, '25-26'), receipt(uuid(2), 7, '26-27')],
      yearReceipts: [
        { financialYear: '25-26', rootBookingId: uuid(1) },
        { financialYear: '26-27', rootBookingId: uuid(2) },
        { financialYear: '26-27', rootBookingId: uuid(5) },
      ],
      unnumberedReceipts: [],
      counters: new Map([
        ['25-26', 1],
        ['26-27', 9],
      ]),
      voidsByYear: new Map(),
    })
    expect(plan.map((y) => [y.financialYear, y.mode, y.nextNumber])).toEqual([
      ['25-26', 'restart', 'DTL/25-26/000001'],
      ['26-27', 'void', 'DTL/26-27/000010'],
    ])
  })

  test('the plan follows the selection: a kept live chain turns a restart into voids', () => {
    const test1 = booking(1)
    const live = booking(2, {
      payment: { status: 'paid', gatewayTxnId: 'pay_LIVE', gatewayMode: 'live', amount: '1.00', refundedAmount: null },
    })
    const plan = planReset(
      input({
        bookings: [test1, live],
        receipts: [receipt(test1.id, 1), receipt(live.id, 2)],
        yearReceipts: [
          { financialYear: '26-27', rootBookingId: test1.id },
          { financialYear: '26-27', rootBookingId: live.id },
        ],
        counters: new Map([['26-27', 2]]),
      })
    )
    expect(plan.receiptPlan.map((y) => [y.mode, y.numbers, y.nextNumber])).toEqual([
      ['void', ['DTL/26-27/000001'], 'DTL/26-27/000003'],
    ])
    expect(plan.counts.receiptNumbers).toBe(1)
    expect(plan.chains.find((c) => c.rootId === live.id)).toMatchObject({ receiptNumber: 'DTL/26-27/000002' })
  })
})

describe('the confirmation', () => {
  test('the phrase names the bookings, one per chain', () => {
    expect(confirmPhraseFor({ bookings: 143, checkouts: 160 }, 12)).toBe('DELETE 143 BOOKINGS')
    expect(confirmPhraseFor({ bookings: 1, checkouts: 1 }, 0)).toBe('DELETE 1 BOOKING')
    expect(confirmPhraseFor({ bookings: 0, checkouts: 1 }, 1)).toBe('DELETE 1 CHECKOUT')
  })

  test('typed exactly, give or take spaces', () => {
    expect(phraseMatches('  DELETE 143   BOOKINGS ', 'DELETE 143 BOOKINGS')).toBe(true)
    expect(phraseMatches('delete 143 bookings', 'DELETE 143 BOOKINGS')).toBe(false)
    expect(phraseMatches('DELETE 142 BOOKINGS', 'DELETE 143 BOOKINGS')).toBe(false)
  })

  test('counts in plain words, zeros left out', () => {
    const plan = planReset(
      input({
        bookings: [booking(1), booking(2)],
        bookingChildCounts: new Map([
          [uuid(1), { items: 1, notes: 0, photos: 4, reviews: 1, promoUses: 1, refundRecords: 1 }],
          [uuid(2), { items: 2, notes: 2, photos: 0, reviews: 0, promoUses: 0, refundRecords: 0 }],
        ]),
      })
    )
    expect(countLines(plan.counts)).toEqual([
      '2 bookings',
      '2 payment records',
      '1 refund recorded',
      '4 job photos',
      '2 team notes',
      '1 review',
      '1 promo code use',
    ])
  })
})

describe('the fingerprint', () => {
  const rows = () => [booking(1), booking(2, { originalBookingId: uuid(1) }), booking(3)]

  test('stable: the same rows in any order give the same hash', () => {
    const a = planReset(input({ bookings: rows() }))
    const b = planReset(input({ bookings: rows().reverse() }))
    expect(a.selectionHash).toMatch(/^[0-9a-f]{64}$/)
    expect(b.selectionHash).toBe(a.selectionHash)
  })

  test('moves when a payment, a refund or the selection moves', () => {
    const base = planReset(input({ bookings: rows() })).selectionHash
    const refunded = rows()
    refunded[2].payment = { ...refunded[2].payment!, refundedAmount: '100.00' }
    expect(planReset(input({ bookings: refunded })).selectionHash).not.toBe(base)

    const unticked = planReset(input({ bookings: rows(), only: { chainIds: [uuid(1)], checkoutIds: [] } }))
    expect(unticked.selectionHash).not.toBe(base)
  })

  test('a chain that is kept does not move it', () => {
    const base = planReset(input({ bookings: rows() })).selectionHash
    const withLive = [
      ...rows(),
      booking(4, { payment: { status: 'paid', gatewayTxnId: 'pay_L', gatewayMode: 'live', amount: '1', refundedAmount: null } }),
    ]
    expect(planReset(input({ bookings: withLive })).selectionHash).toBe(base)
  })
})
