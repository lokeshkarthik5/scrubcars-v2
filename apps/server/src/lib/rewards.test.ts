import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { bannedPhraseIn } from './copy-rules.js'
import {
  baseLevel,
  birthdayProblem,
  capReached,
  DEFAULT_REWARDS_SETTINGS,
  discountPercent,
  drawScratchOutcome,
  eligibleAmountPaise,
  expiringNudge,
  fullCards,
  heavyDiscountFlag,
  inviteToken,
  isNudgeRun,
  lastValidDay,
  LEVELS,
  levelFor,
  levelMoves,
  levelProgress,
  monthsBefore,
  newReferralCode,
  newVoucherCode,
  normalizePlate,
  normalizeReferralCode,
  NUDGE_PRIORITY,
  oneAwayNudge,
  perkDue,
  phoneHash,
  pickScratchOutcome,
  planNudges,
  prizeWithinCap,
  readInviteToken,
  referralClaimRefusal,
  referralOutcome,
  scratchCardExpiresAt,
  scratchPrizeLabel,
  scratchVoucherKind,
  settingsChanges,
  settingsProblems,
  stampAdjustmentRefusal,
  stampExpiresAt,
  stampRefusal,
  stampRefusalLabel,
  stampRevocation,
  stampsOnCard,
  streakBonusDue,
  streakLength,
  streakView,
  voucherExpiresAt,
  voucherIssuedWords,
  voucherState,
  washDueNudge,
  weightsFor,
  type CompletedJob,
  type RewardsSettings,
  type StampRow,
} from './rewards.js'

const S = DEFAULT_REWARDS_SETTINGS
const IST = (local: string) => new Date(`${local}+05:30`)
const NOW = IST('2026-10-18T12:00:00')
const DAY = 24 * 60 * 60 * 1000

function job(overrides: Partial<CompletedJob> = {}): CompletedJob {
  return {
    status: 'completed',
    paymentMethod: 'online',
    payment: { status: 'paid', paidAt: IST('2026-10-17T09:00:00'), refundedAmount: '0.00', creditReturnedAt: null },
    markedTest: false,
    amount: '399.00',
    subtotalAmount: '399.00',
    discountAmount: '0.00',
    discountFundedBy: null,
    ...overrides,
  }
}

function clone(settings: RewardsSettings = S): RewardsSettings {
  return JSON.parse(JSON.stringify(settings)) as RewardsSettings
}

/** A seeded stand-in for crypto.randomInt: the same rolls every run. */
function seeded(seed: number) {
  let state = seed >>> 0
  return (max: number) => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0
    return state % max
  }
}

describe('the defaults (owner, 18 Oct 2026)', () => {
  test('are valid settings', () => {
    expect(settingsProblems(S)).toEqual([])
  })

  test('are exactly what 0050 seeds as version 1', () => {
    const sql = readFileSync(new URL('../../drizzle/0050_detlio_rewards.sql', import.meta.url), 'utf8')
    const match = sql.match(/VALUES \(1, '(\{.*\})'::jsonb/)
    expect(match).not.toBeNull()
    expect(JSON.parse(match![1])).toEqual(S)
  })

  test('the approved numbers', () => {
    expect(S.stampsPerCard).toBe(5)
    expect(S.minPaidAmount).toBe(199)
    expect(S.stampValidMonths).toBe(6)
    expect(S.voucherValidDays).toBe(60)
    expect(S.scratchCardValidDays).toBe(30)
    expect(S.scratchWeights).toEqual({ small_off: 40, medium_off: 30, big_off: 10, bonus_stamp: 18, free_wash: 2 })
    expect(S.scratchAmounts).toEqual({ small_off: 20, medium_off: 50, big_off: 100, free_wash: 299 })
    expect(S.streakMonths).toBe(3)
    expect(S.referralAmount).toBe(100)
    expect(S.referralMaxPerYear).toBe(10)
    expect(S.monthlyCap).toBe(10000)
    expect(S.nudgeGapDays).toBe(3)
    expect(S.levels.map((l) => [l.key, l.minBookings, l.cardReward])).toEqual([
      ['member', 0, 299],
      ['silver', 3, 299],
      ['gold', 10, 349],
      ['platinum', 25, 399],
      ['diamond', 50, 449],
      ['icon', 100, 499],
    ])
    expect(S.levels.find((l) => l.key === 'platinum')!.birthdayVoucher).toBe(399)
    expect(S.levels.find((l) => l.key === 'icon')!.annualDetailingVoucher).toBe(1500)
    expect(S.levels.filter((l) => l.garageBadge).map((l) => l.key)).toEqual(['diamond', 'icon'])
  })
})

describe('settings the admin can save', () => {
  test('weights must add up to 100, per level too', () => {
    const s = clone()
    s.scratchWeights.small_off = 41
    expect(settingsProblems(s)[0]).toContain('add up to 100 (they add up to 101)')
    const t = clone()
    t.levels[4].scratchWeights = { small_off: 10, medium_off: 10, big_off: 10, bonus_stamp: 10, free_wash: 10 }
    expect(settingsProblems(t).some((p) => p.includes('Diamond: scratch odds'))).toBe(true)
  })

  test('values are capped', () => {
    const s = clone()
    s.stampsPerCard = 50
    s.monthlyCap = -1
    s.scratchAmounts.free_wash = 5000
    s.levels[5].annualDetailingVoucher = 99999
    const problems = settingsProblems(s)
    expect(problems.some((p) => p.startsWith('Stamps per card'))).toBe(true)
    expect(problems.some((p) => p.startsWith('Monthly budget'))).toBe(true)
    expect(problems.some((p) => p.startsWith('Free wash'))).toBe(true)
    expect(problems.some((p) => p.includes('annual detailing voucher'))).toBe(true)
  })

  test('levels keep their order, need more bookings as they go up, and never pay less', () => {
    const s = clone()
    s.levels[2].minBookings = 3
    expect(settingsProblems(s).some((p) => p.includes('Gold must need more bookings than Silver'))).toBe(true)
    const t = clone()
    t.levels[3].cardReward = 100
    expect(settingsProblems(t).some((p) => p.includes("Platinum's card reward can't be lower"))).toBe(true)
    const u = clone()
    u.levels = [...u.levels].reverse()
    expect(settingsProblems(u)[0]).toContain('Levels must be member')
    const v = clone()
    v.levels[0].minBookings = 1
    expect(settingsProblems(v)).toContain('Member starts at 0 bookings')
  })

  test('the audit log gets each change, before → after', () => {
    const s = clone()
    s.minPaidAmount = 249
    s.levels[2].cardReward = 379
    expect(settingsChanges(S, s)).toEqual([
      { setting: 'minPaidAmount', from: 199, to: 249 },
      { setting: 'levels.gold.cardReward', from: 349, to: 379 },
    ])
    expect(settingsChanges(S, clone())).toEqual([])
  })
})

describe('which bookings earn a stamp', () => {
  test('a completed, paid booking of ₹199 or more earns one', () => {
    expect(stampRefusal(job(), { sameDayCar: false }, S)).toBeNull()
    expect(stampRefusal(job({ amount: '199.00', subtotalAmount: '199.00' }), { sameDayCar: false }, S)).toBeNull()
  })

  test('under the minimum earns none — the minimum is a setting', () => {
    expect(stampRefusal(job({ amount: '198.99', subtotalAmount: '198.99' }), { sameDayCar: false }, S)).toBe('under_minimum')
    expect(stampRefusal(job(), { sameDayCar: false }, { ...S, minPaidAmount: 400 })).toBe('under_minimum')
  })

  test('the amount is before Detlio promos and rewards, after a garage discount', () => {
    // ₹299 wash, ₹299 reward voucher (Detlio-funded): still worth ₹299.
    const voucher = job({ amount: '1.00', subtotalAmount: '299.00', discountAmount: '298.00', discountFundedBy: 'platform' })
    expect(eligibleAmountPaise(voucher)).toBe(29900)
    expect(stampRefusal(voucher, { sameDayCar: false }, S)).toBeNull()
    // A garage's own ₹150 off a ₹299 wash: the garage charged ₹149.
    const garage = job({ amount: '149.00', subtotalAmount: '299.00', discountAmount: '150.00', discountFundedBy: 'vendor' })
    expect(stampRefusal(garage, { sameDayCar: false }, S)).toBe('under_minimum')
  })

  test('Detlio credit counts as paid (bookings.amount is Razorpay + credit)', () => {
    expect(stampRefusal(job({ amount: '399.00' }), { sameDayCar: false }, S)).toBeNull()
  })

  test('only through Detlio: online and landed, never pay-at-garage cash', () => {
    expect(stampRefusal(job({ paymentMethod: 'cash', payment: { status: 'collected', paidAt: NOW, refundedAmount: null } }), { sameDayCar: false }, S)).toBe('not_paid_online')
    expect(stampRefusal(job({ payment: null }), { sameDayCar: false }, S)).toBe('not_paid_online')
    expect(stampRefusal(job({ payment: { status: 'pending', paidAt: null, refundedAmount: null } }), { sameDayCar: false }, S)).toBe('not_paid_online')
  })

  test('Test-marked, refunded (any part, or credit given back) and not completed earn none', () => {
    expect(stampRefusal(job({ markedTest: true }), { sameDayCar: false }, S)).toBe('test')
    expect(stampRefusal(job({ payment: { status: 'refunded', paidAt: NOW, refundedAmount: '399.00' } }), { sameDayCar: false }, S)).toBe('refunded')
    expect(stampRefusal(job({ payment: { status: 'paid', paidAt: NOW, refundedAmount: '50.00' } }), { sameDayCar: false }, S)).toBe('refunded')
    expect(stampRefusal(job({ payment: { status: 'paid', paidAt: NOW, refundedAmount: null, creditReturnedAt: NOW } }), { sameDayCar: false }, S)).toBe('refunded')
    // A no-show is a cancelled booking: never completed.
    expect(stampRefusal(job({ status: 'cancelled' }), { sameDayCar: false }, S)).toBe('not_completed')
  })

  test('a Detlio Guarantee free redo (0051) never earns, even with the minimum at ₹0', () => {
    const redo = job({ guaranteeRedo: true, amount: '0.00', subtotalAmount: '0.00', payment: { status: 'paid', paidAt: NOW, refundedAmount: null } })
    expect(stampRefusal(redo, { sameDayCar: false }, S)).toBe('free_redo')
    expect(stampRefusal(redo, { sameDayCar: false }, { ...S, minPaidAmount: 0 })).toBe('free_redo')
    expect(stampRefusalLabel('free_redo', S)).toBe('Free redo')
  })

  test('a guarantee refund instead counts as refunded before the money is sent, and takes the stamp back', () => {
    expect(stampRefusal(job({ guaranteeRefund: true }), { sameDayCar: false }, S)).toBe('refunded')
    expect(stampRevocation(job({ guaranteeRefund: true }))).toBe('refunded')
    expect(stampRevocation(job({ guaranteeRefund: false }))).toBeNull()
  })

  test('one per car per IST day; the same garage again in a week still earns (rule removed, 18 Oct)', () => {
    expect(stampRefusal(job(), { sameDayCar: true }, S)).toBe('same_day_car')
  })

  test('a stamp is taken back when the booking is later marked Test or refunded', () => {
    expect(stampRevocation(job())).toBeNull()
    expect(stampRevocation(job({ markedTest: true }))).toBe('test')
    expect(stampRevocation(job({ payment: { status: 'paid', paidAt: NOW, refundedAmount: '10.00' } }))).toBe('refunded')
  })

  test('discount percent, for the abuse flag', () => {
    expect(discountPercent(job({ subtotalAmount: '299.00', discountAmount: '298.00' }))).toBe(99)
    expect(discountPercent(job({ subtotalAmount: '500.00', discountAmount: '400.00' }))).toBe(80)
    expect(discountPercent(job({ subtotalAmount: '0.00', discountAmount: '0.00' }))).toBe(0)
  })
})

function stamp(id: string, earnedAt: Date, overrides: Partial<StampRow> = {}): StampRow {
  return { id, source: 'booking', earnedAt, expiresAt: stampExpiresAt(earnedAt, S), voucherId: null, voidedAt: null, ...overrides }
}

describe('expiry', () => {
  test('a stamp lasts 6 calendar months, to the end of that IST day', () => {
    const at = IST('2026-10-18T09:00:00')
    expect(lastValidDay(stampExpiresAt(at, S))).toBe('2027-04-18')
    // 31 Aug + 6 months clamps to 28 Feb.
    expect(lastValidDay(stampExpiresAt(IST('2026-08-31T10:00:00'), S))).toBe('2027-02-28')
    expect(lastValidDay(stampExpiresAt(at, { ...S, stampValidMonths: 3 }))).toBe('2027-01-18')
  })

  test('a voucher lasts 60 days, an unscratched card 30', () => {
    expect(lastValidDay(voucherExpiresAt(NOW, S))).toBe('2026-12-17')
    expect(lastValidDay(scratchCardExpiresAt(NOW, S))).toBe('2026-11-17')
    // Valid all of its last day, IST.
    expect(voucherExpiresAt(NOW, S).toISOString()).toBe(IST('2026-12-18T00:00:00').toISOString())
  })

  test('lapsed, used and removed stamps are off the card; soonest to lapse first', () => {
    const stamps = [
      stamp('a', IST('2026-04-01T10:00:00')), // lapsed 1 Oct
      stamp('b', IST('2026-09-01T10:00:00')),
      stamp('c', IST('2026-07-01T10:00:00')),
      stamp('d', IST('2026-08-01T10:00:00'), { voucherId: 'v' }),
      stamp('e', IST('2026-08-02T10:00:00'), { voidedAt: NOW }),
    ]
    expect(stampsOnCard(stamps, NOW).map((s) => s.id)).toEqual(['c', 'b'])
  })
})

describe('5 stamps → a reward', () => {
  test('four is not a card; five is; nine is one card and four left; ten is two', () => {
    const make = (n: number) => Array.from({ length: n }, (_, i) => stamp(`s${i}`, new Date(NOW.getTime() - (n - i) * DAY)))
    expect(fullCards(make(4), NOW, S)).toHaveLength(0)
    expect(fullCards(make(5), NOW, S)).toHaveLength(1)
    expect(fullCards(make(9), NOW, S)).toHaveLength(1)
    expect(fullCards(make(10), NOW, S)).toHaveLength(2)
    // The oldest (soonest to lapse) go into the card.
    expect(fullCards(make(6), NOW, S)[0].map((s) => s.id)).toEqual(['s0', 's1', 's2', 's3', 's4'])
    // Stamps per card is a setting.
    expect(fullCards(make(6), NOW, { ...S, stampsPerCard: 3 })).toHaveLength(2)
  })
})

describe('levels', () => {
  test('on stamp-earning bookings in the window', () => {
    expect(LEVELS.map((level) => S.levels.find((l) => l.key === level)!.label)).toEqual([
      'Member', 'Silver', 'Gold', 'Platinum', 'Diamond', 'Detlio Icon',
    ])
    expect(baseLevel(0, S)).toBe('member')
    expect(baseLevel(2, S)).toBe('member')
    expect(baseLevel(3, S)).toBe('silver')
    expect(baseLevel(10, S)).toBe('gold')
    expect(baseLevel(25, S)).toBe('platinum')
    expect(baseLevel(50, S)).toBe('diamond')
    expect(baseLevel(99, S)).toBe('diamond')
    expect(baseLevel(100, S)).toBe('icon')
  })

  test('a customer no-show drops one level, never below Member', () => {
    expect(levelFor(10, 1, S)).toBe('silver')
    expect(levelFor(100, 2, S)).toBe('platinum')
    expect(levelFor(3, 1, S)).toBe('member')
    expect(levelFor(1, 3, S)).toBe('member')
  })

  test('progress: N to reach the next level, counting only the rolling window', () => {
    const recent = Array.from({ length: 8 }, (_, i) => new Date(NOW.getTime() - (i + 1) * 10 * DAY))
    const old = [IST('2025-09-01T10:00:00')] // outside 12 months
    const p = levelProgress([...recent, ...old], 0, NOW, S)
    expect(p.bookings).toBe(8)
    expect(p.level).toBe('silver')
    expect(p.next).toBe('gold')
    expect(p.toNext).toBe(2)
    expect(p.keep).toBeNull()
  })

  test('progress after a no-show: the next level needs the drop made up', () => {
    const ten = Array.from({ length: 10 }, (_, i) => new Date(NOW.getTime() - (i + 1) * DAY))
    const p = levelProgress(ten, 1, NOW, S)
    expect(p.level).toBe('silver')
    expect(p.next).toBe('gold')
    // Gold less one level needs Platinum's 25.
    expect(p.toNext).toBe(15)
  })

  test('progress: bookings leaving the window soon put the level at risk — "N more to keep Gold"', () => {
    // 10 bookings, 3 of them leave the 12-month window within 30 days.
    const leaving = [IST('2025-10-25T10:00:00'), IST('2025-11-01T10:00:00'), IST('2025-11-10T10:00:00')]
    const staying = Array.from({ length: 7 }, (_, i) => new Date(NOW.getTime() - (i + 1) * 20 * DAY))
    const p = levelProgress([...leaving, ...staying], 0, NOW, S)
    expect(p.level).toBe('gold')
    expect(p.keep).toEqual({ needed: 3, by: '2026-11-17' })
  })

  test('Detlio Icon has no next level', () => {
    const many = Array.from({ length: 100 }, (_, i) => new Date(NOW.getTime() - (i + 1) * 3 * DAY))
    const p = levelProgress(many, 0, NOW, S)
    expect(p.level).toBe('icon')
    expect(p.next).toBeNull()
    expect(p.toNext).toBeNull()
  })

  test('distribution and moves this month', () => {
    const moves = levelMoves([
      { now: 'gold', before: 'silver' },
      { now: 'member', before: 'silver' },
      { now: 'gold', before: 'gold' },
    ])
    expect(moves.distribution.gold).toBe(2)
    expect(moves.distribution.member).toBe(1)
    expect(moves.up).toBe(1)
    expect(moves.down).toBe(1)
  })

  test('the rolling window goes back whole calendar months, same time of day', () => {
    expect(monthsBefore(NOW, 12).toISOString()).toBe(IST('2025-10-18T12:00:00').toISOString())
  })
})

describe('monthly streak', () => {
  test('3 months in a row earns a bonus stamp, and again at 6', () => {
    expect(streakLength(['2026-08', '2026-09', '2026-10'], '2026-10')).toBe(3)
    expect(streakBonusDue(['2026-08', '2026-09', '2026-10'], '2026-10', S)).toBe(true)
    expect(streakBonusDue(['2026-09', '2026-10'], '2026-10', S)).toBe(false)
    expect(streakBonusDue(['2026-07', '2026-09', '2026-10'], '2026-10', S)).toBe(false)
    const six = ['2026-05', '2026-06', '2026-07', '2026-08', '2026-09', '2026-10']
    expect(streakBonusDue(six, '2026-10', S)).toBe(true)
    expect(streakBonusDue(six.slice(0, 4), '2026-08', S)).toBe(false)
    // Across a new year.
    expect(streakLength(['2026-11', '2026-12', '2027-01'], '2027-01')).toBe(3)
    // Off when the bonus is 0 stamps.
    expect(streakBonusDue(['2026-08', '2026-09', '2026-10'], '2026-10', { ...S, streakBonusStamps: 0 })).toBe(false)
  })

  test('"2-month streak — book this month to keep it"', () => {
    expect(streakView(['2026-08', '2026-09'], NOW, S)).toEqual({ months: 2, thisMonthDone: false, toBonus: 1 })
    expect(streakView(['2026-09', '2026-10'], NOW, S)).toEqual({ months: 2, thisMonthDone: true, toBonus: 1 })
    expect(streakView(['2026-08', '2026-09', '2026-10'], NOW, S)).toEqual({ months: 3, thisMonthDone: true, toBonus: 3 })
    expect(streakView(['2026-06'], NOW, S)).toEqual({ months: 0, thisMonthDone: false, toBonus: 3 })
  })
})

describe('scratch cards', () => {
  test('the table, in order, for each roll', () => {
    const w = S.scratchWeights
    expect(pickScratchOutcome(0, w, S)).toEqual({ outcome: 'small_off', amount: 20 })
    expect(pickScratchOutcome(39, w, S)).toEqual({ outcome: 'small_off', amount: 20 })
    expect(pickScratchOutcome(40, w, S)).toEqual({ outcome: 'medium_off', amount: 50 })
    expect(pickScratchOutcome(70, w, S)).toEqual({ outcome: 'big_off', amount: 100 })
    expect(pickScratchOutcome(80, w, S)).toEqual({ outcome: 'bonus_stamp', amount: null })
    expect(pickScratchOutcome(98, w, S)).toEqual({ outcome: 'free_wash', amount: 299 })
    expect(pickScratchOutcome(99, w, S)).toEqual({ outcome: 'free_wash', amount: 299 })
  })

  test('the distribution over 100,000 seeded draws matches the weights', () => {
    const pick = seeded(20261018)
    const counts: Record<string, number> = {}
    const n = 100_000
    for (let i = 0; i < n; i += 1) {
      const { outcome } = drawScratchOutcome('member', S, pick)
      counts[outcome] = (counts[outcome] ?? 0) + 1
    }
    for (const [outcome, weight] of Object.entries(S.scratchWeights)) {
      expect(Math.abs(counts[outcome] / n - weight / 100)).toBeLessThan(0.01)
    }
  })

  test('Diamond and Detlio Icon draw with better odds', () => {
    expect(weightsFor('gold', S)).toEqual(S.scratchWeights)
    expect(weightsFor('diamond', S).free_wash).toBe(5)
    expect(weightsFor('icon', S).big_off).toBe(20)
    const pick = seeded(7)
    let freeWashes = 0
    for (let i = 0; i < 50_000; i += 1) if (drawScratchOutcome('diamond', S, pick).outcome === 'free_wash') freeWashes += 1
    expect(Math.abs(freeWashes / 50_000 - 0.05)).toBeLessThan(0.01)
  })

  test('money prizes become vouchers; a bonus stamp does not', () => {
    expect(scratchVoucherKind('small_off')).toBe('scratch')
    expect(scratchVoucherKind('free_wash')).toBe('free_wash')
    expect(scratchVoucherKind('bonus_stamp')).toBeNull()
    expect(scratchPrizeLabel('medium_off', '50.00')).toBe('₹50 off')
    expect(scratchPrizeLabel('free_wash', 299)).toBe('A free wash (up to ₹299)')
    expect(scratchPrizeLabel('bonus_stamp', null)).toBe('A bonus stamp')
  })
})

describe('the monthly budget', () => {
  const cap = 10_000 * 100

  test('a money prize that would pass the cap falls back to a bonus stamp', () => {
    expect(prizeWithinCap({ outcome: 'big_off', amount: 100 }, { issuedThisMonthPaise: cap - 10_000, capPaise: cap })).toEqual({ outcome: 'big_off', amount: 100, fellBack: false })
    expect(prizeWithinCap({ outcome: 'big_off', amount: 100 }, { issuedThisMonthPaise: cap - 9_999, capPaise: cap })).toEqual({ outcome: 'bonus_stamp', amount: null, fellBack: true })
    expect(prizeWithinCap({ outcome: 'free_wash', amount: 299 }, { issuedThisMonthPaise: cap, capPaise: cap }).fellBack).toBe(true)
  })

  test('a bonus stamp is never affected', () => {
    expect(prizeWithinCap({ outcome: 'bonus_stamp', amount: null }, { issuedThisMonthPaise: cap * 2, capPaise: cap })).toEqual({ outcome: 'bonus_stamp', amount: null, fellBack: false })
  })

  test('reached at the cap', () => {
    expect(capReached(cap - 1, cap)).toBe(false)
    expect(capReached(cap, cap)).toBe(true)
  })
})

describe('vouchers', () => {
  const voucher = { expiresAt: voucherExpiresAt(NOW, S), cancelledAt: null }

  test('spent while a booking holds it; given back when that booking is cancelled (not lapsed)', () => {
    expect(voucherState(voucher, null, NOW)).toBe('available')
    expect(voucherState(voucher, 'booking-1', NOW)).toBe('spent')
    // Cancelled booking: DISCOUNT_HELD is false, so no held booking: back to available.
    expect(voucherState(voucher, null, new Date(NOW.getTime() + DAY))).toBe('available')
    // …unless it lapsed meanwhile.
    expect(voucherState(voucher, null, new Date(NOW.getTime() + 61 * DAY))).toBe('expired')
    // A customer no-show keeps it held (DISCOUNT_HELD): still spent, even after expiry.
    expect(voucherState(voucher, 'booking-1', new Date(NOW.getTime() + 61 * DAY))).toBe('spent')
    expect(voucherState({ ...voucher, cancelledAt: NOW }, null, NOW)).toBe('cancelled')
  })

  test('codes: RW and 8 characters with no look-alikes', () => {
    const code = newVoucherCode(seeded(1))
    expect(code).toMatch(/^RW[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{8}$/)
    expect(newReferralCode(seeded(2))).toMatch(/^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{8}$/)
    expect(normalizeReferralCode(' abcd2345 ')).toBe('ABCD2345')
    expect(normalizeReferralCode('ABCD234O')).toBeNull()
    expect(normalizeReferralCode('ABC')).toBeNull()
  })
})

describe('level perks', () => {
  test('a birthday voucher at Platinum and up, in the birthday month, once a year', () => {
    const facts = { birthdayMonth: 10, givenThisYear: false, now: NOW }
    expect(perkDue('birthday', { ...facts, level: 'gold' }, S)).toBeNull()
    expect(perkDue('birthday', { ...facts, level: 'platinum' }, S)).toBe(399)
    expect(perkDue('birthday', { ...facts, level: 'platinum', birthdayMonth: 11 }, S)).toBeNull()
    expect(perkDue('birthday', { ...facts, level: 'platinum', birthdayMonth: null }, S)).toBeNull()
    expect(perkDue('birthday', { ...facts, level: 'icon', givenThisYear: true }, S)).toBeNull()
  })

  test('the annual detailing voucher at Detlio Icon, once a calendar year', () => {
    const facts = { birthdayMonth: null, givenThisYear: false, now: NOW }
    expect(perkDue('annual_detailing', { ...facts, level: 'diamond' }, S)).toBeNull()
    expect(perkDue('annual_detailing', { ...facts, level: 'icon' }, S)).toBe(1500)
    expect(perkDue('annual_detailing', { ...facts, level: 'icon', givenThisYear: true }, S)).toBeNull()
  })

  test('a birthday is a real month and day', () => {
    expect(birthdayProblem(2, 29)).toBeNull()
    expect(birthdayProblem(2, 30)).toBe('Pick a day in that month')
    expect(birthdayProblem(13, 1)).toBe('Pick a month')
  })
})

describe('invite a friend', () => {
  const SECRET = 'test-secret'

  test('the invite token proves when the page was opened, and runs out after 30 days', () => {
    const token = inviteToken('ABCD2345', NOW, SECRET)
    expect(readInviteToken(token, SECRET, NOW)).toEqual({ code: 'ABCD2345', openedAt: NOW })
    expect(readInviteToken(token, 'other-secret', NOW)).toBeNull()
    expect(readInviteToken(token.replace('ABCD2345', 'ABCD2346'), SECRET, NOW)).toBeNull()
    expect(readInviteToken(token, SECRET, new Date(NOW.getTime() + 31 * DAY))).toBeNull()
    // A time in the future is forged.
    expect(readInviteToken(inviteToken('ABCD2345', new Date(NOW.getTime() + DAY), SECRET), SECRET, NOW)).toBeNull()
    expect(readInviteToken('garbage', SECRET, NOW)).toBeNull()
  })

  test('only a new customer: account made after the invite was opened, number never referred, no booking yet', () => {
    const base = {
      referrerId: 'a',
      refereeId: 'b',
      accountCreatedAt: new Date(NOW.getTime() + 60_000),
      inviteOpenedAt: NOW,
      alreadyReferred: false,
      phoneSeen: false,
      hasBookings: false,
    }
    expect(referralClaimRefusal(base)).toBeNull()
    expect(referralClaimRefusal({ ...base, refereeId: 'a' })).toBe('own_code')
    expect(referralClaimRefusal({ ...base, alreadyReferred: true })).toBe('already_referred')
    expect(referralClaimRefusal({ ...base, phoneSeen: true })).toBe('phone_seen')
    expect(referralClaimRefusal({ ...base, accountCreatedAt: new Date(NOW.getTime() - 60_000) })).toBe('not_new')
    expect(referralClaimRefusal({ ...base, hasBookings: true })).toBe('has_bookings')
  })

  test('both get ₹100 on the first stamp-earning booking; the inviter at most 10 a year; never the inviter\'s own car', () => {
    expect(referralOutcome({ refereePlate: 'TN 09 AB 1234', referrerPlates: ['TN10CD5678'], referrerRewardedThisYear: 0 }, S)).toEqual({ kind: 'reward', referrer: true })
    expect(referralOutcome({ refereePlate: 'TN 09 AB 1234', referrerPlates: [], referrerRewardedThisYear: 10 }, S)).toEqual({ kind: 'reward', referrer: false })
    expect(referralOutcome({ refereePlate: 'tn-09-ab-1234', referrerPlates: ['TN09AB1234'], referrerRewardedThisYear: 0 }, S)).toEqual({ kind: 'refuse', reason: 'same_car' })
    expect(referralOutcome({ refereePlate: null, referrerPlates: [null], referrerRewardedThisYear: 0 }, S).kind).toBe('reward')
    expect(normalizePlate(' ab ')).toBeNull()
  })

  test('the phone is kept only as a keyed hash, the same for any formatting', () => {
    expect(phoneHash('9876543210', SECRET)).toBe(phoneHash('+91 98765 43210', SECRET))
    expect(phoneHash('9876543210', SECRET)).not.toContain('9876543210')
    expect(phoneHash('9876543210', SECRET)).not.toBe(phoneHash('9876543210', 'other'))
  })
})

describe('habit nudges', () => {
  test('in the 10:00–17:59 IST runs only', () => {
    expect(isNudgeRun(IST('2026-10-18T09:59:00'))).toBe(false)
    expect(isNudgeRun(IST('2026-10-18T10:00:00'))).toBe(true)
    expect(isNudgeRun(IST('2026-10-18T17:59:00'))).toBe(true)
    expect(isNudgeRun(IST('2026-10-18T18:00:00'))).toBe(false)
  })

  test('the words: "this one earns stamp 4 of 5"', () => {
    expect(washDueNudge(3, S)).toEqual({ title: "Your car's due a wash", body: 'This one earns stamp 4 of 5.', url: '/garages' })
    expect(washDueNudge(4, S).body).toBe('This one earns stamp 5 of 5 — and your reward.')
    expect(oneAwayNudge(349).body).toBe('Your next booking fills your Shine Card: ₹349 off the one after.')
    expect(expiringNudge('voucher', { amount: 299, lastDay: '2026-10-24' }).title).toBe('Your ₹299 off ends 24 Oct')
    expect(expiringNudge('stamps', { count: 2, lastDay: '2026-10-24' }).title).toBe('2 stamps end soon')
  })

  test('one per customer per run, the most urgent', () => {
    const plan = planNudges([
      { userId: 'a', kind: 'wash_due', subjectKey: 'x', words: washDueNudge(1, S), priority: NUDGE_PRIORITY.wash_due },
      { userId: 'a', kind: 'expiring', subjectKey: 'y', words: washDueNudge(1, S), priority: NUDGE_PRIORITY.voucher },
      { userId: 'b', kind: 'one_away', subjectKey: 'z', words: oneAwayNudge(299), priority: NUDGE_PRIORITY.one_away },
    ])
    expect(plan.map((n) => [n.userId, n.subjectKey])).toEqual([['a', 'y'], ['b', 'z']])
  })

  test('every customer-facing line passes the copy rules', () => {
    const lines = [
      washDueNudge(4, S),
      oneAwayNudge(299),
      expiringNudge('voucher', { amount: 299, lastDay: '2026-10-24' }),
      expiringNudge('scratch_card', { lastDay: '2026-10-24' }),
      expiringNudge('stamps', { count: 1, lastDay: '2026-10-24' }),
      ...(['shine', 'scratch', 'free_wash', 'referral', 'birthday', 'annual_detailing', 'adjustment'] as const).map((kind) => ({
        ...voucherIssuedWords(kind, 299),
        url: '/',
      })),
    ]
    for (const line of lines) expect(bannedPhraseIn(`${line.title} ${line.body}`)).toBeNull()
  })
})

describe('admin', () => {
  test('flags customers whose stamps came mostly from bookings 80%+ off', () => {
    expect(heavyDiscountFlag({ earned: 2, heavy: 2 })).toBe(false)
    expect(heavyDiscountFlag({ earned: 4, heavy: 2 })).toBe(false)
    expect(heavyDiscountFlag({ earned: 4, heavy: 3 })).toBe(true)
  })

  test('manual stamp changes: 1–5, never more off than is on the card', () => {
    expect(stampAdjustmentRefusal(2, 0)).toBeNull()
    expect(stampAdjustmentRefusal(0, 3)).toBe('zero')
    expect(stampAdjustmentRefusal(6, 0)).toBe('too_large')
    expect(stampAdjustmentRefusal(-3, 2)).toBe('over_card')
    expect(stampAdjustmentRefusal(-2, 2)).toBeNull()
  })
})
