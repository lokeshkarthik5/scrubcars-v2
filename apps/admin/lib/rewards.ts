import { toCsv } from '@repo/core/csv'
import type { AdminRewardsLedger } from '@repo/core/api/rewards'
import { SCRATCH_OUTCOMES, type RewardsSettings, type ScratchWeights } from '@repo/core/rewards'

/** The tabs of Admin → Rewards, in the URL as ?tab=. */
export const REWARDS_TABS = ['overview', 'customers', 'settings'] as const
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
