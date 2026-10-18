/**
 * Detlio Rewards (0050) for the apps: the settings' shape and their
 * defaults, and the words the customer app and admin share. The live
 * numbers always come from the API (`GET /rewards/config`, admin's
 * settings); `DEFAULT_REWARDS_SETTINGS` is version 1, the twin of
 * apps/server/src/lib/rewards.ts (rewards.parity.test.ts), for display
 * before the config has loaded and for admin's "Reset to defaults".
 */

import type { BadgeKey, BadgeSettings } from './achievements'

export const SCRATCH_OUTCOMES = ['small_off', 'medium_off', 'big_off', 'bonus_stamp', 'free_wash'] as const
export type ScratchOutcome = (typeof SCRATCH_OUTCOMES)[number]
export type MoneyOutcome = Exclude<ScratchOutcome, 'bonus_stamp'>

export const LEVELS = ['member', 'silver', 'gold', 'platinum', 'diamond', 'icon'] as const
export type RewardLevel = (typeof LEVELS)[number]

export type ScratchWeights = Record<ScratchOutcome, number>

export interface LevelSettings {
  key: RewardLevel
  label: string
  minBookings: number
  cardReward: number
  birthdayVoucher: number | null
  annualDetailingVoucher: number | null
  scratchWeights: ScratchWeights | null
  garageBadge: boolean
}

export interface RewardsSettings {
  enabled: boolean
  stampsPerCard: number
  minPaidAmount: number
  stampValidMonths: number
  voucherValidDays: number
  scratchCardValidDays: number
  scratchAmounts: Record<MoneyOutcome, number>
  scratchWeights: ScratchWeights
  streakMonths: number
  streakBonusStamps: number
  levelWindowMonths: number
  noShowDropMonths: number
  levels: LevelSettings[]
  referralAmount: number
  referralMaxPerYear: number
  monthlyCap: number
  nudgeGapDays: number
  expiryWarningDays: number
  /** Achievements (0054): each badge on or off and its bonus stamps; a badge left out reads as its default. */
  achievements?: Partial<Record<BadgeKey, BadgeSettings>>
}

export const DEFAULT_REWARDS_SETTINGS: RewardsSettings = {
  "enabled": true,
  "stampsPerCard": 5,
  "minPaidAmount": 199,
  "stampValidMonths": 6,
  "voucherValidDays": 60,
  "scratchCardValidDays": 30,
  "scratchAmounts": {
    "small_off": 20,
    "medium_off": 50,
    "big_off": 100,
    "free_wash": 299
  },
  "scratchWeights": {
    "small_off": 40,
    "medium_off": 30,
    "big_off": 10,
    "bonus_stamp": 18,
    "free_wash": 2
  },
  "streakMonths": 3,
  "streakBonusStamps": 1,
  "levelWindowMonths": 12,
  "noShowDropMonths": 12,
  "levels": [
    {
      "key": "member",
      "label": "Member",
      "minBookings": 0,
      "cardReward": 299,
      "birthdayVoucher": null,
      "annualDetailingVoucher": null,
      "scratchWeights": null,
      "garageBadge": false
    },
    {
      "key": "silver",
      "label": "Silver",
      "minBookings": 3,
      "cardReward": 299,
      "birthdayVoucher": null,
      "annualDetailingVoucher": null,
      "scratchWeights": null,
      "garageBadge": false
    },
    {
      "key": "gold",
      "label": "Gold",
      "minBookings": 10,
      "cardReward": 349,
      "birthdayVoucher": null,
      "annualDetailingVoucher": null,
      "scratchWeights": null,
      "garageBadge": false
    },
    {
      "key": "platinum",
      "label": "Platinum",
      "minBookings": 25,
      "cardReward": 399,
      "birthdayVoucher": 399,
      "annualDetailingVoucher": null,
      "scratchWeights": null,
      "garageBadge": false
    },
    {
      "key": "diamond",
      "label": "Diamond",
      "minBookings": 50,
      "cardReward": 449,
      "birthdayVoucher": 399,
      "annualDetailingVoucher": null,
      "scratchWeights": {
        "small_off": 25,
        "medium_off": 30,
        "big_off": 20,
        "bonus_stamp": 20,
        "free_wash": 5
      },
      "garageBadge": true
    },
    {
      "key": "icon",
      "label": "Detlio Icon",
      "minBookings": 100,
      "cardReward": 499,
      "birthdayVoucher": 399,
      "annualDetailingVoucher": 1500,
      "scratchWeights": {
        "small_off": 25,
        "medium_off": 30,
        "big_off": 20,
        "bonus_stamp": 20,
        "free_wash": 5
      },
      "garageBadge": true
    }
  ],
  "referralAmount": 100,
  "referralMaxPerYear": 10,
  "monthlyCap": 10000,
  "nudgeGapDays": 3,
  "expiryWarningDays": 7
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** "17 Dec" from "2026-12-17". */
export function rewardDay(dateKey: string): string {
  const [, month, day] = dateKey.split('-').map(Number)
  return `${day} ${MONTHS[month - 1]}`
}

/** "₹299", whole rupees. */
export function rewardRupees(amount: string | number): string {
  return `₹${Math.round(Number(amount)).toLocaleString('en-IN')}`
}

/** What a scratched card won, as the API says it (lib/rewards.ts scratchPrizeLabel). */
export function scratchPrizeLabel(outcome: ScratchOutcome, amount: number | string | null): string {
  if (outcome === 'bonus_stamp') return 'A bonus stamp'
  const rupee = `₹${Math.round(Number(amount ?? 0))}`
  return outcome === 'free_wash' ? `A free wash (up to ${rupee})` : `${rupee} off`
}

/** "2 more washes to your reward", "1 more wash to your reward", "Your reward is ready". */
export function stampsToGoLine(toGo: number): string {
  if (toGo <= 0) return 'Your reward is ready'
  return `${toGo} more ${toGo === 1 ? 'wash' : 'washes'} to your reward`
}

/** The streak line: "2-month streak — book this month to keep it". */
export function streakLine(streak: { months: number; thisMonthDone: boolean; toBonus: number }): string {
  if (streak.months === 0) return 'Book this month to start a streak'
  const length = `${streak.months}-month streak`
  if (!streak.thisMonthDone) return `${length} — book this month to keep it`
  return streak.toBonus === 1
    ? `${length} — book next month for a bonus stamp`
    : `${length} — ${streak.toBonus} more months for a bonus stamp`
}

/**
 * Level progress: "2 more washes by 17 Nov to keep Gold", else "3 more to
 * reach Platinum", else the top.
 */
export function levelLine(level: {
  label: string
  nextLabel: string | null
  toNext: number | null
  keep: { needed: number; by: string } | null
}): string {
  if (level.keep) {
    const n = level.keep.needed
    return `${n} more ${n === 1 ? 'wash' : 'washes'} by ${rewardDay(level.keep.by)} to keep ${level.label}`
  }
  if (level.nextLabel && level.toNext !== null) {
    const n = level.toNext
    return `${n} more ${n === 1 ? 'wash' : 'washes'} to reach ${level.nextLabel}`
  }
  if (level.nextLabel) return `${level.nextLabel} is next`
  return `You're at the top: ${level.label}`
}

/** "You've saved ₹1,240 with Detlio Rewards · 14 washes · since Oct 2026" */
export function lifetimeLine(lifetime: { saved: string; washes: number; since: string | null }): string {
  const washes = `${lifetime.washes} ${lifetime.washes === 1 ? 'wash' : 'washes'}`
  const parts = [`You've saved ${rewardRupees(lifetime.saved)} with Detlio Rewards`, washes]
  if (lifetime.since) parts.push(`since ${lifetime.since}`)
  return parts.join(' · ')
}
