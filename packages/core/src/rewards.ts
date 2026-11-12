/**
 * Detlio Rewards (0050) for the apps: the settings' shape and their
 * defaults, and the words the customer app and admin share. The live
 * numbers always come from the API (`GET /rewards/config`, admin's
 * settings); `DEFAULT_REWARDS_SETTINGS` is version 1, the twin of
 * apps/server/src/lib/rewards.ts (rewards.parity.test.ts), for display
 * before the config has loaded and for admin's "Reset to defaults".
 */

import type { BadgeKey, BadgeSettings } from './achievements'
import type { GarageSettings } from './garage'
import { formatRupees } from './job-records'
import { istDateLabel } from './payouts'
import { t, tn } from './i18n/translate'

/** The prizes drawn by weight (the odds table). */
export const SCRATCH_OUTCOMES = ['small_off', 'medium_off', 'big_off', 'bonus_stamp', 'free_wash'] as const
export type WeightedOutcome = (typeof SCRATCH_OUTCOMES)[number]
/** What a card can be: a weighted prize or (0057) a Detlio Garage card. */
export const CARD_OUTCOMES = [...SCRATCH_OUTCOMES, 'garage_card'] as const
export type ScratchOutcome = (typeof CARD_OUTCOMES)[number]
export type MoneyOutcome = Exclude<WeightedOutcome, 'bonus_stamp'>

export const LEVELS = ['member', 'silver', 'gold', 'platinum', 'diamond', 'icon'] as const
export type RewardLevel = (typeof LEVELS)[number]

export type ScratchWeights = Record<WeightedOutcome, number>

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
  /** The Detlio Garage (0057); left out reads as its defaults (`garageSettings`). */
  garage?: Partial<GarageSettings>
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

/** "₹299", "₹1,500": whole rupees, grouped the Indian way (formatRupees). */
export function rewardRupees(amount: string | number | null | undefined): string {
  return formatRupees(Math.round(Number(amount ?? 0)))
}

/**
 * "14 Sep 2026", the India date of a moment, for the history and badge
 * dates. Not en-IN through Intl: browsers write September "Sept" there.
 */
export function rewardDate(iso: string): string {
  return istDateLabel(iso)
}

/** What a scratched card won, as the API says it (lib/rewards.ts scratchPrizeLabel). */
export function scratchPrizeLabel(outcome: ScratchOutcome, amount: number | string | null): string {
  if (outcome === 'bonus_stamp') return t('A bonus stamp')
  if (outcome === 'garage_card') return t('A Garage card')
  const rupee = rewardRupees(amount)
  return outcome === 'free_wash' ? t('A free wash (up to {amount})', { amount: rupee }) : t('{amount} off', { amount: rupee })
}

/** "2 more washes to your reward", "1 more wash to your reward", "Your reward is ready". */
export function stampsToGoLine(toGo: number): string {
  if (toGo <= 0) return t('Your reward is ready')
  return tn(toGo, '{count} more wash to your reward', '{count} more washes to your reward')
}

/** The streak line: "2-month streak — book this month to keep it". */
export function streakLine(streak: { months: number; thisMonthDone: boolean; toBonus: number }): string {
  if (streak.months === 0) return t('Book this month to start a streak')
  const length = t('{count}-month streak', { count: streak.months })
  if (!streak.thisMonthDone) return t('{streak} — book this month to keep it', { streak: length })
  return streak.toBonus === 1
    ? t('{streak} — book next month for a bonus stamp', { streak: length })
    : t('{streak} — {count} more months for a bonus stamp', { streak: length, count: streak.toBonus })
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
    return tn(n, '{count} more wash by {day} to keep {level}', '{count} more washes by {day} to keep {level}', {
      day: rewardDay(level.keep.by),
      level: t(level.label),
    })
  }
  if (level.nextLabel && level.toNext !== null) {
    const n = level.toNext
    return tn(n, '{count} more wash to reach {level}', '{count} more washes to reach {level}', {
      level: t(level.nextLabel),
    })
  }
  if (level.nextLabel) return t('{level} is next', { level: t(level.nextLabel) })
  return t("You're at the top: {level}", { level: t(level.label) })
}

/** No-break spaces, so a short phrase ("since Oct 2026") never splits across lines. */
const NBSP = '\u00a0'
function keepTogether(text: string): string {
  return text.replace(/ /g, NBSP)
}

/**
 * "You've saved ₹1,240 with Detlio Rewards · 14 washes · since Oct 2026",
 * with "since Oct 2026" held together so "Oct 2026" never wraps alone.
 */
export function lifetimeLine(lifetime: { saved: string; washes: number; since: string | null }): string {
  const washes = tn(lifetime.washes, '{count} wash', '{count} washes')
  const parts = [t("You've saved {amount} with Detlio Rewards", { amount: rewardRupees(lifetime.saved) }), washes]
  if (lifetime.since) parts.push(keepTogether(t('since {date}', { date: lifetime.since })))
  return parts.join(' · ')
}

/**
 * What a challenge asks and wins, the verb agreeing with the count:
 * "3 washes win double stamps", "1 wash wins ₹100 off".
 */
export function challengeWinsLine(challenge: { counts: string; goal: number; reward: string }): string {
  const counts = `${challenge.counts.charAt(0).toUpperCase()}${challenge.counts.slice(1)}`
  return `${counts} ${challenge.goal === 1 ? 'wins' : 'win'} ${challenge.reward}`
}
