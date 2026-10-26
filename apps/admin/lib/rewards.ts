import { toCsv } from '@repo/core/csv'
import type { AdminRewardsLedger } from '@repo/core/api/rewards'
import type { AdminChallenge, ChallengeFormValues, ChallengeResultRow, ChallengeStatus } from '@repo/core/api/reward-extras'
import { SCRATCH_OUTCOMES, type RewardsSettings, type ScratchWeights } from '@repo/core/rewards'

/** The tabs of Admin → Rewards, in the URL as ?tab=. */
export const REWARDS_TABS = ['overview', 'customers', 'achievements', 'challenges', 'garage', 'wrapped', 'settings'] as const
export type RewardsTab = (typeof REWARDS_TABS)[number]

export function parseRewardsTab(value: string | null): RewardsTab {
  return (REWARDS_TABS as readonly string[]).includes(value ?? '') ? (value as RewardsTab) : 'overview'
}

/** "2026-10" from now, in IST. */
export function istMonthNow(now = new Date()): string {
  return new Date(now.getTime() + 330 * 60_000).toISOString().slice(0, 7)
}

/** The last 12 IST months, newest first, for the month picker. */
export function recentMonths(now = new Date(), count = 12): string[] {
  const [y, m] = istMonthNow(now).split('-').map(Number)
  return Array.from({ length: count }, (_, i) => {
    const index = y * 12 + (m - 1) - i
    return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, '0')}`
  })
}

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

/** "October 2026" */
export function monthLabel(month: string): string {
  const [y, m] = month.split('-').map(Number)
  return `${MONTH_NAMES[m - 1]} ${y}`
}

/** What the weights add up to (must be 100). */
export function weightTotal(weights: ScratchWeights): number {
  return SCRATCH_OUTCOMES.reduce((sum, outcome) => sum + (Number.isFinite(weights[outcome]) ? weights[outcome] : 0), 0)
}

/** A share of a whole, "42%", or "—" with nothing to share. */
export function percentOf(part: number, whole: number): string {
  return whole > 0 ? `${Math.round((part / whole) * 100)}%` : '—'
}

/** The month's ledger as a CSV file's text (phones are already masked by the API). */
export function ledgerCsv(ledger: AdminRewardsLedger): string {
  return toCsv(
    ['When (IST)', 'Type', 'Detail', 'Amount (₹)', 'State', 'Customer', 'Phone', 'Customer id', 'Booking id'],
    ledger.rows.map((row) => [
      new Date(new Date(row.at).getTime() + 330 * 60_000).toISOString().slice(0, 16).replace('T', ' '),
      row.type,
      row.detail,
      row.amount,
      row.state,
      row.name,
      row.phone,
      row.userId,
      row.bookingId,
    ])
  )
}

/**
 * The settings form's own check before sending, the same rules the API
 * enforces (it is the one that counts): the weights add up to 100, levels
 * need more bookings as they go up. Problems in plain words, empty when fine.
 */
export function settingsFormProblems(s: RewardsSettings): string[] {
  const problems: string[] = []
  if (weightTotal(s.scratchWeights) !== 100) problems.push(`Scratch odds add up to ${weightTotal(s.scratchWeights)}, not 100`)
  s.levels.forEach((level, i) => {
    if (level.scratchWeights && weightTotal(level.scratchWeights) !== 100) {
      problems.push(`${level.label}'s scratch odds add up to ${weightTotal(level.scratchWeights)}, not 100`)
    }
    if (i > 0 && level.minBookings <= s.levels[i - 1].minBookings) {
      problems.push(`${level.label} must need more bookings than ${s.levels[i - 1].label}`)
    }
  })
  return problems
}

// ─── Achievements, challenges and Wrapped (0054) ────────────────────────────

export const CHALLENGE_STATUS_LABELS: Record<ChallengeStatus, string> = {
  draft: 'Draft',
  scheduled: 'Scheduled',
  live: 'Live',
  finished: 'Finished',
  ended: 'Ended early',
}

/** A new challenge's form: a week from tomorrow, 3 washes, double stamps, 500 winners. */
export function emptyChallenge(now = new Date()): ChallengeFormValues {
  const day = (offset: number) => new Date(now.getTime() + 330 * 60_000 + offset * 86_400_000).toISOString().slice(0, 10)
  return {
    title: '',
    description: null,
    startDate: day(1),
    endDate: day(7),
    goalCount: 3,
    category: null,
    bookingType: null,
    rewardKind: 'multiplier',
    rewardStamps: null,
    rewardAmount: null,
    rewardMultiplier: 2,
    rewardCards: null,
    audienceMinLevel: null,
    maxWinners: 500,
  }
}

/** A saved challenge back into the form. */
export function challengeFormValues(c: AdminChallenge): ChallengeFormValues {
  return {
    title: c.title,
    description: c.description,
    startDate: c.startDate,
    endDate: c.endDate,
    goalCount: c.goalCount,
    category: c.category,
    bookingType: c.bookingType,
    rewardKind: c.rewardKind,
    rewardStamps: c.rewardStamps,
    rewardAmount: c.rewardAmount === null ? null : Math.round(Number(c.rewardAmount)),
    rewardMultiplier: c.rewardMultiplier,
    rewardCards: c.rewardCards ?? null,
    audienceMinLevel: c.audienceMinLevel,
    maxWinners: c.maxWinners,
  }
}

/** Only the reward's own field goes with its kind (the API's CHECK). */
export function challengePayload(values: ChallengeFormValues): ChallengeFormValues {
  return {
    ...values,
    title: values.title.trim(),
    description: values.description?.trim() ? values.description.trim() : null,
    rewardStamps: values.rewardKind === 'stamps' ? values.rewardStamps : null,
    rewardAmount: values.rewardKind === 'voucher' ? values.rewardAmount : null,
    rewardMultiplier: values.rewardKind === 'multiplier' ? values.rewardMultiplier : null,
    rewardCards: values.rewardKind === 'garage_cards' ? values.rewardCards : null,
  }
}

/**
 * The form's own quick checks before sending (the API's lib/challenges.ts
 * is the one that counts, copy rules included).
 */
export function challengeFormProblems(values: ChallengeFormValues): string[] {
  const problems: string[] = []
  const title = values.title.trim()
  if (title.length < 3 || title.length > 60) problems.push('The title is 3–60 characters')
  if (!values.startDate || !values.endDate) problems.push('Pick a start and an end date')
  else if (values.endDate < values.startDate) problems.push('The end date is after the start date')
  if (!(values.goalCount >= 1 && values.goalCount <= 20)) problems.push('The goal is 1 to 20 bookings')
  if (values.rewardKind === 'stamps' && !(values.rewardStamps !== null && values.rewardStamps >= 1 && values.rewardStamps <= 10)) problems.push('Bonus stamps are 1 to 10')
  if (values.rewardKind === 'voucher') {
    if (!(values.rewardAmount !== null && values.rewardAmount >= 1 && values.rewardAmount <= 2000)) problems.push('The voucher is ₹1 to ₹2,000')
    if (values.maxWinners === null) problems.push('A ₹ prize needs a limit on winners')
  }
  if (values.rewardKind === 'multiplier' && !(values.rewardMultiplier === 2 || values.rewardMultiplier === 3)) problems.push('Stamps are doubled or tripled')
  return problems
}

/** A challenge's results as a CSV file's text (phones already masked by the API). */
export function challengeResultsCsv(rows: ChallengeResultRow[]): string {
  const ist = (iso: string | null) => (iso ? new Date(new Date(iso).getTime() + 330 * 60_000).toISOString().slice(0, 16).replace('T', ' ') : '')
  return toCsv(
    ['Customer', 'Phone', 'Customer id', 'Bookings counted', 'First counted (IST)', 'Won (IST)', 'Bonus stamps', 'Voucher (₹)', 'Voucher code', 'Voucher used'],
    rows.map((row) => [
      row.name,
      row.phone,
      row.userId,
      row.counted,
      ist(row.firstCountedAt),
      ist(row.wonAt),
      row.bonusStamps,
      row.voucherAmount,
      row.voucherCode,
      row.voucherUsed === null ? '' : row.voucherUsed ? 'yes' : 'no',
    ])
  )
}

/** Wrapped years admin can look at: 2026 to this IST year. */
export function wrappedYearOptions(now = new Date()): number[] {
  const year = Number(istMonthNow(now).slice(0, 4))
  const years: number[] = []
  for (let y = year; y >= 2026; y -= 1) years.push(y)
  return years
}
