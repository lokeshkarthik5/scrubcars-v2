import { describe, expect, test } from 'bun:test'
import {
  bookingCounts,
  challengeOneLeftWords,
  challengeOutcome,
  challengeProblems,
  challengeStartWords,
  challengeStatus,
  challengeWindow,
  challengeWonWords,
  countsLine,
  daysLeft,
  editRefusal,
  inAudience,
  multiplierExtra,
  oneLeftDue,
  progressLine,
  publishProblem,
  rewardLabel,
  worstCaseVoucherCost,
  type Challenge,
  type ChallengeInput,
} from './challenges.js'

function ist(local: string): Date {
  return new Date(`${local}+05:30`)
}

const PUBLISHED = ist('2026-10-01T10:00:00')

/** "Diwali Shine": 3 washes 5–11 Nov, double stamps, up to 1000 winners. */
function diwali(over: Partial<Challenge> = {}): Challenge {
  return {
    id: 'c1',
    title: 'Diwali Shine',
    description: null,
    startDate: '2026-11-05',
    endDate: '2026-11-11',
    goalCount: 3,
    category: null,
    bookingType: null,
    rewardKind: 'multiplier',
    rewardStamps: null,
    rewardAmount: null,
    rewardMultiplier: 2,
    rewardCards: null,
    audienceMinLevel: null,
    maxWinners: 1000,
    publishedAt: PUBLISHED,
    endedAt: null,
    ...over,
  }
}

function input(over: Partial<ChallengeInput> = {}): ChallengeInput {
  const { id: _id, publishedAt: _p, endedAt: _e, ...rest } = diwali()
  return { ...rest, ...over }
}

const wash = (startAt: Date, over: Partial<{ bookingType: string; categories: string[] }> = {}) => ({
  startAt,
  bookingType: 'dropin',
  categories: ['car_wash'],
  ...over,
})

describe('the window (IST dates, both included)', () => {
  test('from the start date at 00:00 IST to the end date at 23:59:59 IST', () => {
    const { start, end } = challengeWindow(diwali())
    expect(start).toEqual(ist('2026-11-05T00:00:00'))
    expect(end).toEqual(ist('2026-11-12T00:00:00'))
  })

  test('a booking counts by its slot start, inside the window only', () => {
    const c = diwali()
    expect(bookingCounts(c, wash(ist('2026-11-05T00:00:00')))).toBe(true)
    expect(bookingCounts(c, wash(ist('2026-11-11T23:59:00')))).toBe(true)
    expect(bookingCounts(c, wash(ist('2026-11-04T23:59:00')))).toBe(false)
    expect(bookingCounts(c, wash(ist('2026-11-12T00:00:00')))).toBe(false)
  })

  test('ended early: the window stops then', () => {
    const c = diwali({ endedAt: ist('2026-11-08T12:00:00') })
    expect(bookingCounts(c, wash(ist('2026-11-08T11:00:00')))).toBe(true)
    expect(bookingCounts(c, wash(ist('2026-11-08T13:00:00')))).toBe(false)
  })

  test('filters: booking type and category (a package counts for its members)', () => {
    const doorstep = diwali({ bookingType: 'doorstep' })
    expect(bookingCounts(doorstep, wash(ist('2026-11-06T10:00:00'), { bookingType: 'doorstep' }))).toBe(true)
    expect(bookingCounts(doorstep, wash(ist('2026-11-06T10:00:00')))).toBe(false)
    const detailing = diwali({ category: 'detailing' })
    expect(bookingCounts(detailing, wash(ist('2026-11-06T10:00:00'), { categories: ['package', 'detailing'] }))).toBe(true)
    expect(bookingCounts(detailing, wash(ist('2026-11-06T10:00:00')))).toBe(false)
  })
})

describe('status', () => {
  test('draft until published; scheduled, live, finished; ended early', () => {
    expect(challengeStatus(diwali({ publishedAt: null }), ist('2026-11-06T10:00:00'))).toBe('draft')
    expect(challengeStatus(diwali(), ist('2026-11-04T23:59:00'))).toBe('scheduled')
    expect(challengeStatus(diwali(), ist('2026-11-05T00:00:00'))).toBe('live')
    expect(challengeStatus(diwali(), ist('2026-11-11T23:59:00'))).toBe('live')
    expect(challengeStatus(diwali(), ist('2026-11-12T00:00:00'))).toBe('finished')
    expect(challengeStatus(diwali({ endedAt: ist('2026-11-07T09:00:00') }), ist('2026-11-07T10:00:00'))).toBe('ended')
  })

  test('days left counts today; the last day is 1; over is 0', () => {
    expect(daysLeft(diwali(), ist('2026-11-08T10:00:00'))).toBe(4)
    expect(daysLeft(diwali(), ist('2026-11-11T22:00:00'))).toBe(1)
    expect(daysLeft(diwali(), ist('2026-11-12T00:00:00'))).toBe(0)
  })
})

describe('audience', () => {
  test('everyone, or a level and above', () => {
    expect(inAudience(diwali(), 'member')).toBe(true)
    expect(inAudience(diwali({ audienceMinLevel: 'gold' }), 'silver')).toBe(false)
    expect(inAudience(diwali({ audienceMinLevel: 'gold' }), 'gold')).toBe(true)
    expect(inAudience(diwali({ audienceMinLevel: 'gold' }), 'icon')).toBe(true)
  })
})

describe('progress, winning and the winners cap', () => {
  test('progress until the goal; won at the goal', () => {
    expect(challengeOutcome({ count: 2, goal: 3, alreadyWon: false, winners: 0, maxWinners: 10 })).toBe('progress')
    expect(challengeOutcome({ count: 3, goal: 3, alreadyWon: false, winners: 9, maxWinners: 10 })).toBe('won')
  })

  test('the cap: once max winners won, the next to reach the goal finds it full', () => {
    expect(challengeOutcome({ count: 3, goal: 3, alreadyWon: false, winners: 10, maxWinners: 10 })).toBe('full')
    expect(challengeOutcome({ count: 3, goal: 3, alreadyWon: false, winners: 5000, maxWinners: null })).toBe('won')
  })

  test('a customer wins once: a later booking is never a second win', () => {
    expect(challengeOutcome({ count: 4, goal: 3, alreadyWon: true, winners: 1, maxWinners: 10 })).toBe('already_won')
  })

  test('"one more to go" only when there is more than one to do', () => {
    expect(oneLeftDue(2, 3)).toBe(true)
    expect(oneLeftDue(1, 3)).toBe(false)
    expect(oneLeftDue(0, 1)).toBe(false)
  })

  test('the progress line', () => {
    expect(progressLine({ count: 1, goal: 3, daysLeft: 4, won: false, full: false })).toBe('1 of 3 — 4 days left')
    expect(progressLine({ count: 2, goal: 3, daysLeft: 1, won: false, full: false })).toBe('2 of 3 — last day')
    expect(progressLine({ count: 3, goal: 3, daysLeft: 2, won: true, full: false })).toBe('You won')
    expect(progressLine({ count: 3, goal: 3, daysLeft: 2, won: false, full: true })).toBe('All prizes have been won')
    expect(progressLine({ count: 5, goal: 3, daysLeft: 0, won: false, full: false })).toBe('3 of 3 — ended')
  })
})

describe('the multiplier', () => {
  test('double gives one extra stamp a booking, triple two, none without', () => {
    expect(multiplierExtra(2)).toBe(1)
    expect(multiplierExtra(3)).toBe(2)
    expect(multiplierExtra(null)).toBe(0)
    expect(multiplierExtra(1)).toBe(0)
  })
})

describe('words', () => {
  test('the reward and what counts', () => {
    expect(rewardLabel(diwali())).toBe('double stamps')
    expect(rewardLabel(diwali({ rewardKind: 'voucher', rewardAmount: 100, rewardMultiplier: null }))).toBe('₹100 off')
    expect(rewardLabel(diwali({ rewardKind: 'voucher', rewardAmount: 1500, rewardMultiplier: null }))).toBe('₹1,500 off')
    expect(rewardLabel(diwali({ rewardKind: 'stamps', rewardStamps: 1, rewardMultiplier: null }))).toBe('a bonus stamp')
    expect(rewardLabel(diwali({ rewardKind: 'badge', rewardMultiplier: null }))).toBe('the Diwali Shine badge')
    expect(rewardLabel(diwali({ rewardKind: 'garage_cards', rewardCards: 3, rewardMultiplier: null }))).toBe('3 Garage cards')
    expect(rewardLabel(diwali({ rewardKind: 'garage_cards', rewardCards: 1, rewardMultiplier: null }))).toBe('a Garage card')
    expect(challengeWonWords(diwali({ rewardKind: 'garage_cards', rewardCards: 2, rewardMultiplier: null })).body).toBe('2 Garage cards are in your Garage.')
    expect(countsLine(diwali())).toBe('3 washes')
    expect(countsLine(diwali({ goalCount: 1, category: 'coating' }))).toBe('1 coating job')
    expect(countsLine(diwali({ goalCount: 2, bookingType: 'doorstep' }))).toBe('2 doorstep washes')
  })

  test('push words carry the challenge, never anything about the customer', () => {
    expect(challengeStartWords(diwali())).toEqual({ title: 'New challenge: Diwali Shine', body: '3 washes by 11 Nov win double stamps.' })
    expect(challengeStartWords(diwali({ goalCount: 1 })).body).toBe('1 wash by 11 Nov wins double stamps.')
    expect(challengeOneLeftWords(diwali())).toEqual({ title: 'One more for Diwali Shine', body: 'Book 1 more by 11 Nov to win double stamps.' })
    expect(challengeWonWords(diwali()).title).toBe('You won Diwali Shine')
    expect(challengeWonWords(diwali({ rewardKind: 'voucher', rewardAmount: 100, rewardMultiplier: null })).body).toBe('₹100 off your next booking is ready.')
  })
})

describe('the admin form', () => {
  test('the two seeded examples are valid', () => {
    expect(challengeProblems(input())).toEqual([])
    expect(
      challengeProblems(
        input({ title: 'Monsoon Care', startDate: '2027-07-01', endDate: '2027-07-31', goalCount: 2, rewardKind: 'voucher', rewardAmount: 100, rewardMultiplier: null, maxWinners: 200 })
      )
    ).toEqual([])
  })

  test('dates, goal, reward fields, copy rules', () => {
    expect(challengeProblems(input({ endDate: '2026-11-04' })).join()).toContain('after the start')
    expect(challengeProblems(input({ endDate: '2027-03-01' })).join()).toContain('at most 92 days')
    expect(challengeProblems(input({ startDate: '2026-02-30' })).join()).toContain('Pick a start')
    expect(challengeProblems(input({ goalCount: 0 })).join()).toContain('goal')
    expect(challengeProblems(input({ rewardMultiplier: 5 })).join()).toContain('doubled or tripled')
    expect(challengeProblems(input({ rewardKind: 'stamps', rewardStamps: 11 })).join()).toContain('Bonus stamps')
    expect(challengeProblems(input({ title: 'Guaranteed shine' })).join()).toContain('guaranteed')
  })

  test('a ₹ prize needs a winners cap (the worst case on the budget)', () => {
    const voucher = input({ rewardKind: 'voucher', rewardAmount: 100, rewardMultiplier: null, maxWinners: null })
    expect(challengeProblems(voucher).join()).toContain('limit on winners')
    expect(worstCaseVoucherCost({ rewardKind: 'voucher', rewardAmount: 100, maxWinners: 200 })).toBe(20000)
    expect(worstCaseVoucherCost({ rewardKind: 'multiplier', rewardAmount: null, maxWinners: null })).toBe(0)
  })

  test('publishing: never in the past (completions before it would be missed)', () => {
    expect(publishProblem(diwali({ publishedAt: null }), ist('2026-10-18T10:00:00'))).toBeNull()
    expect(publishProblem(diwali({ publishedAt: null }), ist('2026-11-06T10:00:00'))).toContain('start date has passed')
    expect(publishProblem(diwali({ publishedAt: null, startDate: '2026-11-06', endDate: '2026-11-06' }), ist('2026-11-06T10:00:00'))).toBeNull()
    expect(publishProblem(diwali(), ist('2026-10-18T10:00:00'))).toBe('Already published')
  })

  test('editing: anything before the start; once live only the words and a higher cap', () => {
    const live = ist('2026-11-06T10:00:00')
    const c = { ...diwali(), ...input() }
    expect(editRefusal(c, input({ goalCount: 2 }), ist('2026-10-18T10:00:00'))).toBeNull()
    expect(editRefusal(c, input({ startDate: '2026-10-17' }), ist('2026-10-18T10:00:00'))).toContain('start date has passed')
    expect(editRefusal({ ...c, publishedAt: null }, input({ startDate: '2026-10-01' }), ist('2026-10-18T10:00:00'))).toBeNull()
    expect(editRefusal(c, input({ goalCount: 2 }), live)).toContain('only its words')
    expect(editRefusal(c, input({ title: 'Diwali Sparkle', description: 'New words' }), live)).toBeNull()
    expect(editRefusal(c, input({ maxWinners: 2000 }), live)).toBeNull()
    expect(editRefusal(c, input({ maxWinners: 10 }), live)).toContain('only go up')
    expect(editRefusal(c, input(), ist('2026-11-12T10:00:00'))).toBe('This challenge is over')
  })
})
