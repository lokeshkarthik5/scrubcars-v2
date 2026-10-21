/**
 * Detlio Rewards (0050): the loyalty programme that makes booking through
 * Detlio a habit (owner, 18 Oct 2026). Pure, with the settings, the clock
 * and any randomness passed in, so every rule is unit-tested
 * (rewards.test.ts).
 *
 * The programme:
 *
 *   - **Shine Card.** Every completed booking paid through Detlio worth at
 *     least the minimum (₹199: Razorpay part + Detlio credit, before any
 *     Detlio-funded promo or reward) earns one stamp; one per car per IST
 *     day, once per reschedule chain; Test-marked, refunded and no-show
 *     bookings earn none. A full card (5) becomes a voucher whose value
 *     depends on the customer's level. Stamps lapse after 6 months,
 *     vouchers after 60 days.
 *   - **Scratch card** with every stamp-earning booking: the server draws
 *     the prize when the card is made (weights per level), never the app.
 *     Unscratched cards lapse after 30 days.
 *   - **Monthly streak**: a stamp-earning booking in 3 IST calendar months
 *     in a row earns a bonus stamp (and again at 6, 9…).
 *   - **Levels** on stamp-earning bookings in the rolling last 12 months:
 *     Member, Silver 3, Gold 10, Platinum 25 (+ birthday voucher), Diamond 50
 *     (+ better scratch odds, a badge garages see), Detlio Icon 100 (+ an
 *     annual detailing voucher). Each customer no-show in the last 12 months
 *     takes one level off.
 *   - **Invite a friend**: a new customer who joined through an invite gets
 *     ₹100 off, and so does the inviter, when the new customer's first
 *     stamp-earning booking completes; at most 10 rewarded invites a year.
 *   - **Budget**: every voucher is a Detlio-funded promo code (the garage is
 *     paid the full price). Once a calendar month's rewards issued reach the
 *     monthly cap, new scratch cards give a bonus stamp instead of money;
 *     everything else is honoured, and ops hear once.
 *
 * Every number is a setting the team edits in admin (`RewardsSettings`,
 * stored versioned in `reward_settings`, read through one cached accessor
 * in modules/rewards). `DEFAULT_REWARDS_SETTINGS` is version 1, seeded by
 * 0050; `packages/core/src/rewards.ts` is its display twin
 * (rewards.parity.test.ts). Changes apply going forward only: a voucher,
 * card or stamp keeps the values it was issued with.
 */
import { createHmac, randomInt, timingSafeEqual } from 'node:crypto'
import { addDays, istDateKey, istMidnight, istParts, MONTHS } from './ist.js'

// ─── Settings ────────────────────────────────────────────────────────────────

export const SCRATCH_OUTCOMES = ['small_off', 'medium_off', 'big_off', 'bonus_stamp', 'free_wash'] as const
export type ScratchOutcome = (typeof SCRATCH_OUTCOMES)[number]
/** The prizes that are money (a voucher). */
export const MONEY_OUTCOMES = ['small_off', 'medium_off', 'big_off', 'free_wash'] as const
export type MoneyOutcome = (typeof MONEY_OUTCOMES)[number]

export const LEVELS = ['member', 'silver', 'gold', 'platinum', 'diamond', 'icon'] as const
export type RewardLevel = (typeof LEVELS)[number]

export type ScratchWeights = Record<ScratchOutcome, number>

export interface LevelSettings {
  key: RewardLevel
  label: string
  /** Stamp-earning bookings in the level window to reach it (Member is 0). */
  minBookings: number
  /** A full Shine Card's voucher at this level, ₹ off. */
  cardReward: number
  /** A voucher in the customer's birthday month, once a year; null = none. */
  birthdayVoucher: number | null
  /** A detailing voucher once a calendar year; null = none. */
  annualDetailingVoucher: number | null
  /** Scratch-card weights for this level; null = the standard ones. */
  scratchWeights: ScratchWeights | null
  /** Garages see this level's name on the customer's job card. */
  garageBadge: boolean
}

export interface RewardsSettings {
  /** The admin switch; REWARDS_ENABLED (env) is the master switch above it. */
  enabled: boolean
  /** Stamps that fill a Shine Card. */
  stampsPerCard: number
  /** A booking must be worth at least this (₹, before Detlio promos) to earn a stamp. */
  minPaidAmount: number
  /** A stamp lapses this many calendar months after it was earned. */
  stampValidMonths: number
  /** A voucher lapses this many days after it was issued. */
  voucherValidDays: number
  /** An unscratched card lapses this many days after it was made. */
  scratchCardValidDays: number
  /** The money prizes' amounts, ₹ off (the free wash is "up to" its amount). */
  scratchAmounts: Record<MoneyOutcome, number>
  /** The standard prize weights, out of 100. */
  scratchWeights: ScratchWeights
  /** Consecutive IST calendar months with a stamp-earning booking that earn the bonus. */
  streakMonths: number
  /** Bonus stamps for a streak. */
  streakBonusStamps: number
  /** Months levels are counted over (rolling). */
  levelWindowMonths: number
  /** Months a customer no-show keeps one level off. */
  noShowDropMonths: number
  /** Member → Detlio Icon, in order. */
  levels: LevelSettings[]
  /** Each side of a rewarded invite, ₹ off. */
  referralAmount: number
  /** Rewarded invites per inviter per IST calendar year. */
  referralMaxPerYear: number
  /** Rewards issued in an IST calendar month, ₹, before scratch cards stop paying money. */
  monthlyCap: number
  /** At most one habit nudge per customer in this many days. */
  nudgeGapDays: number
  /** "Ends soon" nudges this many days ahead. */
  expiryWarningDays: number
}

export const DEFAULT_REWARDS_SETTINGS: RewardsSettings = {
  enabled: true,
  stampsPerCard: 5,
  minPaidAmount: 199,
  stampValidMonths: 6,
  voucherValidDays: 60,
  scratchCardValidDays: 30,
  scratchAmounts: { small_off: 20, medium_off: 50, big_off: 100, free_wash: 299 },
  scratchWeights: { small_off: 40, medium_off: 30, big_off: 10, bonus_stamp: 18, free_wash: 2 },
  streakMonths: 3,
  streakBonusStamps: 1,
  levelWindowMonths: 12,
  noShowDropMonths: 12,
  levels: [
    { key: 'member', label: 'Member', minBookings: 0, cardReward: 299, birthdayVoucher: null, annualDetailingVoucher: null, scratchWeights: null, garageBadge: false },
    { key: 'silver', label: 'Silver', minBookings: 3, cardReward: 299, birthdayVoucher: null, annualDetailingVoucher: null, scratchWeights: null, garageBadge: false },
    { key: 'gold', label: 'Gold', minBookings: 10, cardReward: 349, birthdayVoucher: null, annualDetailingVoucher: null, scratchWeights: null, garageBadge: false },
    { key: 'platinum', label: 'Platinum', minBookings: 25, cardReward: 399, birthdayVoucher: 399, annualDetailingVoucher: null, scratchWeights: null, garageBadge: false },
    {
      key: 'diamond',
      label: 'Diamond',
      minBookings: 50,
      cardReward: 449,
      birthdayVoucher: 399,
      annualDetailingVoucher: null,
      scratchWeights: { small_off: 25, medium_off: 30, big_off: 20, bonus_stamp: 20, free_wash: 5 },
      garageBadge: true,
    },
    {
      key: 'icon',
      label: 'Detlio Icon',
      minBookings: 100,
      cardReward: 499,
      birthdayVoucher: 399,
      annualDetailingVoucher: 1500,
      scratchWeights: { small_off: 25, medium_off: 30, big_off: 20, bonus_stamp: 20, free_wash: 5 },
      garageBadge: true,
    },
  ],
  referralAmount: 100,
  referralMaxPerYear: 10,
  monthlyCap: 10000,
  nudgeGapDays: 3,
  expiryWarningDays: 7,
}

/** The caps every setting is held within (the admin form and the API both read them). */
export const SETTINGS_LIMITS = {
  stampsPerCard: { min: 2, max: 10 },
  minPaidAmount: { min: 0, max: 5000 },
  stampValidMonths: { min: 1, max: 24 },
  voucherValidDays: { min: 7, max: 365 },
  scratchCardValidDays: { min: 3, max: 90 },
  scratchAmount: { min: 1, max: 500 },
  freeWashAmount: { min: 1, max: 1500 },
  streakMonths: { min: 2, max: 12 },
  streakBonusStamps: { min: 0, max: 5 },
  levelWindowMonths: { min: 3, max: 24 },
  noShowDropMonths: { min: 0, max: 24 },
  minBookings: { min: 1, max: 1000 },
  cardReward: { min: 1, max: 2000 },
  birthdayVoucher: { min: 1, max: 2000 },
  annualDetailingVoucher: { min: 1, max: 5000 },
  referralAmount: { min: 1, max: 1000 },
  referralMaxPerYear: { min: 0, max: 100 },
  monthlyCap: { min: 0, max: 1000000 },
  nudgeGapDays: { min: 1, max: 30 },
  expiryWarningDays: { min: 1, max: 30 },
  labelLength: { min: 2, max: 20 },
} as const

/** Rules that are not settings: the abuse flag, invites, manual changes. */
export const REWARDS_FIXED = {
  /** How long an opened invite can still be taken up, in days. */
  inviteValidDays: 30,
  /** A booking this much off (%, promo or voucher) counts toward the abuse flag… */
  heavyDiscountPercent: 80,
  /** …flagged when more than this share of a customer's stamps came from such bookings… */
  heavyDiscountShare: 0.5,
  /** …and they have at least this many stamp-earning bookings. */
  heavyDiscountMinBookings: 3,
  /** A manual voucher, ₹ (admin adjustment). */
  maxAdjustmentVoucher: 500,
  /** A manual stamp change, either way. */
  maxAdjustmentStamps: 5,
} as const

function weightsProblem(weights: ScratchWeights, where: string): string | null {
  let sum = 0
  for (const outcome of SCRATCH_OUTCOMES) {
    const w = weights[outcome]
    if (!Number.isInteger(w) || w < 0 || w > 100) return `${where}: each weight is a whole number from 0 to 100`
    sum += w
  }
  return sum === 100 ? null : `${where}: the weights must add up to 100 (they add up to ${sum})`
}

function within(value: number, limit: { min: number; max: number }): boolean {
  return Number.isInteger(value) && value >= limit.min && value <= limit.max
}

/**
 * Every problem with a set of settings, in the form's order; empty when
 * they can be saved. The API refuses anything this lists (400).
 */
export function settingsProblems(s: RewardsSettings): string[] {
  const problems: string[] = []
  const L = SETTINGS_LIMITS
  const check = (ok: boolean, message: string) => {
    if (!ok) problems.push(message)
  }
  const range = (name: string, value: number, limit: { min: number; max: number }) =>
    check(within(value, limit), `${name} must be a whole number from ${limit.min} to ${limit.max}`)

  range('Stamps per card', s.stampsPerCard, L.stampsPerCard)
  range('Minimum booking amount', s.minPaidAmount, L.minPaidAmount)
  range('Stamp expiry (months)', s.stampValidMonths, L.stampValidMonths)
  range('Voucher expiry (days)', s.voucherValidDays, L.voucherValidDays)
  range('Scratch card expiry (days)', s.scratchCardValidDays, L.scratchCardValidDays)
  range('Small prize', s.scratchAmounts.small_off, L.scratchAmount)
  range('Medium prize', s.scratchAmounts.medium_off, L.scratchAmount)
  range('Big prize', s.scratchAmounts.big_off, L.scratchAmount)
  range('Free wash (up to)', s.scratchAmounts.free_wash, L.freeWashAmount)
  check(
    s.scratchAmounts.small_off < s.scratchAmounts.medium_off && s.scratchAmounts.medium_off < s.scratchAmounts.big_off,
    'Scratch prizes must go small < medium < big'
  )
  const standard = weightsProblem(s.scratchWeights, 'Scratch odds')
  if (standard) problems.push(standard)
  range('Streak months', s.streakMonths, L.streakMonths)
  range('Streak bonus stamps', s.streakBonusStamps, L.streakBonusStamps)
  range('Level window (months)', s.levelWindowMonths, L.levelWindowMonths)
  range('No-show penalty (months)', s.noShowDropMonths, L.noShowDropMonths)
  range('Invite reward', s.referralAmount, L.referralAmount)
  range('Invites rewarded a year', s.referralMaxPerYear, L.referralMaxPerYear)
  range('Monthly budget', s.monthlyCap, L.monthlyCap)
  range('Nudge gap (days)', s.nudgeGapDays, L.nudgeGapDays)
  range('Expiry warning (days)', s.expiryWarningDays, L.expiryWarningDays)

  if (s.levels.length !== LEVELS.length || s.levels.some((level, i) => level.key !== LEVELS[i])) {
    problems.push(`Levels must be ${LEVELS.join(', ')}, in that order`)
    return problems
  }
  s.levels.forEach((level, i) => {
    const name = level.label || level.key
    check(
      typeof level.label === 'string' && level.label.trim().length >= L.labelLength.min && level.label.trim().length <= L.labelLength.max,
      `${level.key}: the name is ${L.labelLength.min}–${L.labelLength.max} characters`
    )
    if (i === 0) check(level.minBookings === 0, 'Member starts at 0 bookings')
    else {
      range(`${name}: bookings to reach`, level.minBookings, L.minBookings)
      check(level.minBookings > s.levels[i - 1].minBookings, `${name} must need more bookings than ${s.levels[i - 1].label}`)
    }
    range(`${name}: card reward`, level.cardReward, L.cardReward)
    if (i > 0) check(level.cardReward >= s.levels[i - 1].cardReward, `${name}'s card reward can't be lower than ${s.levels[i - 1].label}'s`)
    if (level.birthdayVoucher !== null) range(`${name}: birthday voucher`, level.birthdayVoucher, L.birthdayVoucher)
    if (level.annualDetailingVoucher !== null) {
      range(`${name}: annual detailing voucher`, level.annualDetailingVoucher, L.annualDetailingVoucher)
    }
    if (level.scratchWeights) {
      const p = weightsProblem(level.scratchWeights, `${name}: scratch odds`)
      if (p) problems.push(p)
    }
    check(typeof level.garageBadge === 'boolean', `${name}: garage badge is on or off`)
  })
  return problems
}

/**
 * What changed between two versions, for the audit log: each setting that
 * differs, before → after (levels named by key).
 */
export function settingsChanges(before: RewardsSettings, after: RewardsSettings): Array<{ setting: string; from: unknown; to: unknown }> {
  const changes: Array<{ setting: string; from: unknown; to: unknown }> = []
  const walk = (path: string, a: unknown, b: unknown) => {
    if (a !== null && b !== null && typeof a === 'object' && typeof b === 'object' && !Array.isArray(a)) {
      const keys = new Set([...Object.keys(a as object), ...Object.keys(b as object)])
      for (const key of keys) walk(path ? `${path}.${key}` : key, (a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key])
      return
    }
    if (Array.isArray(a) && Array.isArray(b)) {
      const len = Math.max(a.length, b.length)
      for (let i = 0; i < len; i += 1) {
        const label = (a[i] as { key?: string } | undefined)?.key ?? (b[i] as { key?: string } | undefined)?.key ?? String(i)
        walk(`${path}.${label}`, a[i], b[i])
      }
      return
    }
    if (JSON.stringify(a) !== JSON.stringify(b)) changes.push({ setting: path, from: a ?? null, to: b ?? null })
  }
  walk('', before, after)
  return changes
}

export function levelSettings(settings: RewardsSettings, level: RewardLevel): LevelSettings {
  return settings.levels.find((row) => row.key === level) ?? settings.levels[0]
}

export function levelLabel(settings: RewardsSettings, level: RewardLevel): string {
  return levelSettings(settings, level).label
}

// ─── Labels ──────────────────────────────────────────────────────────────────

export const VOUCHER_KINDS = [
  'shine',
  'scratch',
  'free_wash',
  'referral',
  'birthday',
  'annual_detailing',
  'adjustment',
] as const
export type VoucherKind = (typeof VOUCHER_KINDS)[number]

export const VOUCHER_LABELS: Record<VoucherKind, string> = {
  shine: 'Shine Card reward',
  scratch: 'Scratch card prize',
  free_wash: 'Free wash (scratch card)',
  referral: 'Invite a friend',
  birthday: 'Birthday wash',
  annual_detailing: 'Annual detailing',
  adjustment: 'From Detlio',
}

/** Kinds whose amount is counted toward the cap when the card is made, not when the voucher is. */
export const SCRATCH_VOUCHER_KINDS: readonly VoucherKind[] = ['scratch', 'free_wash']

export const STAMP_SOURCES = ['booking', 'scratch', 'streak', 'adjustment'] as const
export type StampSource = (typeof STAMP_SOURCES)[number]

export const STAMP_LABELS: Record<StampSource, string> = {
  booking: 'Booking completed',
  scratch: 'Bonus stamp (scratch card)',
  streak: 'Bonus stamp (monthly streak)',
  adjustment: 'From Detlio',
}

/**
 * Why a completed booking earned no stamp. Text + CHECK in 0050;
 * `free_redo` (a Detlio Guarantee redo, ₹0) was added to the CHECK by 0051.
 */
export const STAMP_REFUSALS = ['not_completed', 'not_paid_online', 'refunded', 'test', 'under_minimum', 'same_day_car', 'free_redo'] as const
export type StampRefusal = (typeof STAMP_REFUSALS)[number]

export function stampRefusalLabel(refusal: StampRefusal, settings: RewardsSettings): string {
  switch (refusal) {
    case 'not_completed':
      return 'Not completed'
    case 'not_paid_online':
      return 'Not paid through Detlio'
    case 'refunded':
      return 'Refunded'
    case 'test':
      return 'Test booking'
    case 'under_minimum':
      return `Under ₹${settings.minPaidAmount}`
    case 'same_day_car':
      return 'Same car, same day'
    case 'free_redo':
      return 'Free redo'
  }
}

/** What a scratched card says it won. */
export function scratchPrizeLabel(outcome: ScratchOutcome, amount: number | string | null): string {
  if (outcome === 'bonus_stamp') return 'A bonus stamp'
  const rupee = `₹${Math.round(Number(amount ?? 0))}`
  return outcome === 'free_wash' ? `A free wash (up to ${rupee})` : `${rupee} off`
}

const DAY_MS = 24 * 60 * 60 * 1000

// ─── Money ───────────────────────────────────────────────────────────────────

/** Rupees (numeric string or number) to whole paise. */
export function paise(amount: string | number | null | undefined): number {
  if (amount === null || amount === undefined || amount === '') return 0
  return Math.round(Number(amount) * 100)
}

/** Paise to a numeric(10,2) string. */
export function rupees(paiseValue: number): string {
  return (paiseValue / 100).toFixed(2)
}

// ─── Dates ───────────────────────────────────────────────────────────────────

/** "YYYY-MM-DD" plus whole calendar months, clamped to the month's last day. */
export function addMonthsToKey(dateKey: string, months: number): string {
  const [year, month, day] = dateKey.split('-').map(Number)
  const index = year * 12 + (month - 1) + months
  const targetYear = Math.floor(index / 12)
  const targetMonth = index - targetYear * 12
  const lastDay = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate()
  const d = Math.min(day, lastDay)
  return `${String(targetYear).padStart(4, '0')}-${String(targetMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

/**
 * Every expiry here is the end of a whole IST day (midnight IST starting
 * the next), so the app can say "Use by 17 Dec" and mean all of 17 December.
 */
function endOfIstDay(dateKey: string): Date {
  return istMidnight(addDays(dateKey, 1))
}

/** A stamp earned at `at` lapses at the end of the same IST date N months on. */
export function stampExpiresAt(at: Date, settings: RewardsSettings): Date {
  return endOfIstDay(addMonthsToKey(istDateKey(at), settings.stampValidMonths))
}

/** A voucher issued at `at` is good until the end of the IST day N days on. */
export function voucherExpiresAt(at: Date, settings: RewardsSettings): Date {
  return endOfIstDay(addDays(istDateKey(at), settings.voucherValidDays))
}

/** An unscratched card made at `at` lapses at the end of the IST day N days on. */
export function scratchCardExpiresAt(at: Date, settings: RewardsSettings): Date {
  return endOfIstDay(addDays(istDateKey(at), settings.scratchCardValidDays))
}

/** The last IST date something is valid on ("YYYY-MM-DD"). */
export function lastValidDay(expiresAt: Date): string {
  return istDateKey(new Date(expiresAt.getTime() - 1))
}

/** "17 Dec" */
export function shortDate(dateKey: string): string {
  const [, month, day] = dateKey.split('-').map(Number)
  return `${day} ${MONTHS[month - 1]}`
}

/** The IST calendar month, "YYYY-MM". */
export function istMonthKey(at: Date): string {
  return istDateKey(at).slice(0, 7)
}

/** "YYYY-MM" plus whole months. */
export function addMonthsToMonthKey(monthKey: string, months: number): string {
  return addMonthsToKey(`${monthKey}-01`, months).slice(0, 7)
}

/** The first moment of an IST calendar month, and of the next one. */
export function istMonthRange(monthKey: string): { start: Date; end: Date } {
  return {
    start: istMidnight(`${monthKey}-01`),
    end: istMidnight(`${addMonthsToMonthKey(monthKey, 1)}-01`),
  }
}

/** The first moment of the IST calendar year `at` falls in. */
export function istYearStart(at: Date): Date {
  return istMidnight(`${istParts(at).year}-01-01`)
}

/** `months` calendar months before `at`, same IST time of day (the rolling windows). */
export function monthsBefore(at: Date, months: number): Date {
  const key = addMonthsToKey(istDateKey(at), -months)
  return new Date(istMidnight(key).getTime() + (at.getTime() - istMidnight(istDateKey(at)).getTime()))
}

// ─── Which bookings earn a stamp ────────────────────────────────────────────

/** What the rules read off a completed booking (its chain's latest row). */
export interface CompletedJob {
  status: string
  paymentMethod: string
  /** The booking's own payment (null with none). */
  payment: {
    status: string
    paidAt: Date | null
    refundedAmount: string | null
    creditReturnedAt?: Date | null
  } | null
  markedTest: boolean
  /**
   * A Detlio Guarantee redo (0051, `bookings.guarantee_redo`): a ₹0 booking
   * that earns no stamp, scratch card or level progress, whatever the
   * minimum is set to.
   */
  guaranteeRedo?: boolean
  /**
   * Detlio approved a refund instead of a redo on it (0051,
   * `bookings.guarantee_refund_at`): the booking's money is owed back, so
   * it counts as refunded from that moment, before the refund is sent.
   */
  guaranteeRefund?: boolean
  /** What the customer was charged: Razorpay part + Detlio credit. */
  amount: string
  subtotalAmount: string
  discountAmount: string
  discountFundedBy: 'platform' | 'vendor' | null
}

/**
 * What the booking was worth for the minimum: what the customer paid
 * (Razorpay + credit) before any Detlio-funded promo or reward. A
 * garage-funded discount stays off: the garage really charged less. Same
 * branch as `computeVendorPayout` in lib/discounts.ts, on purpose.
 */
export function eligibleAmountPaise(job: Pick<CompletedJob, 'amount' | 'subtotalAmount' | 'discountFundedBy'>): number {
  return job.discountFundedBy === 'platform' ? paise(job.subtotalAmount) : paise(job.amount)
}

/** How much off the booking was, in whole percent of its price (any promo or voucher). */
export function discountPercent(job: Pick<CompletedJob, 'subtotalAmount' | 'discountAmount'>): number {
  const subtotal = paise(job.subtotalAmount)
  if (subtotal <= 0) return 0
  return Math.min(100, Math.max(0, Math.floor((paise(job.discountAmount) * 100) / subtotal)))
}

function moneyWentBack(job: Pick<CompletedJob, 'payment' | 'guaranteeRefund'>): boolean {
  if (job.guaranteeRefund) return true
  const payment = job.payment
  return !!payment && (payment.status === 'refunded' || paise(payment.refundedAmount) > 0 || !!payment.creditReturnedAt)
}

/**
 * Why a completed booking earns no stamp, or null when it earns one, in
 * the order an admin would want to hear it. `sameDayCar`: the same car
 * already earned a stamp that IST day.
 */
export function stampRefusal(job: CompletedJob, context: { sameDayCar: boolean }, settings: RewardsSettings): StampRefusal | null {
  if (job.status !== 'completed') return 'not_completed'
  // A free redo (0051) is ₹0 and Detlio's own make-good: never a stamp,
  // even with the minimum set to ₹0.
  if (job.guaranteeRedo) return 'free_redo'
  if (job.markedTest) return 'test'
  // Only money that came through Detlio: an online payment that landed.
  // 'collected' is the old pay-at-garage cash path.
  if (job.paymentMethod !== 'online' || !job.payment || !job.payment.paidAt) return 'not_paid_online'
  if (moneyWentBack(job)) return 'refunded'
  if (job.payment.status !== 'paid') return 'not_paid_online'
  if (eligibleAmountPaise(job) < settings.minPaidAmount * 100) return 'under_minimum'
  if (context.sameDayCar) return 'same_day_car'
  return null
}

/**
 * Whether an earned stamp must be taken back: marked Test, or money went
 * back (or a Detlio Guarantee refund instead was approved, 0051), after it
 * was earned.
 */
export function stampRevocation(job: Pick<CompletedJob, 'markedTest' | 'payment' | 'guaranteeRefund'>): 'test' | 'refunded' | null {
  if (job.markedTest) return 'test'
  if (moneyWentBack(job)) return 'refunded'
  return null
}

// ─── The Shine Card ─────────────────────────────────────────────────────────

export interface StampRow {
  id: string
  source: StampSource
  earnedAt: Date
  expiresAt: Date
  voucherId: string | null
  voidedAt: Date | null
}

/** Stamps still on the card: not used, not taken back, not lapsed. Soonest to lapse first. */
export function stampsOnCard<T extends StampRow>(stamps: readonly T[], now: Date): T[] {
  return stamps
    .filter((stamp) => !stamp.voucherId && !stamp.voidedAt && stamp.expiresAt > now)
    .sort(
      (a, b) =>
        a.expiresAt.getTime() - b.expiresAt.getTime() || a.earnedAt.getTime() - b.earnedAt.getTime() || a.id.localeCompare(b.id)
    )
}

/** Full cards to turn into vouchers, the soonest-to-lapse stamps first, so none is wasted. */
export function fullCards<T extends StampRow>(stamps: readonly T[], now: Date, settings: RewardsSettings): T[][] {
  const onCard = stampsOnCard(stamps, now)
  const groups: T[][] = []
  for (let i = 0; i + settings.stampsPerCard <= onCard.length; i += settings.stampsPerCard) {
    groups.push(onCard.slice(i, i + settings.stampsPerCard))
  }
  return groups
}

// ─── Levels ──────────────────────────────────────────────────────────────────

/** The level stamp-earning bookings alone give. */
export function baseLevel(bookings: number, settings: RewardsSettings): RewardLevel {
  let level: RewardLevel = 'member'
  for (const row of settings.levels) if (bookings >= row.minBookings) level = row.key
  return level
}

/** One level down per customer no-show in its window, never below Member. */
export function levelFor(bookings: number, noShowDrops: number, settings: RewardsSettings): RewardLevel {
  const index = LEVELS.indexOf(baseLevel(bookings, settings)) - Math.max(0, noShowDrops)
  return LEVELS[Math.max(0, index)]
}

export interface LevelProgress {
  level: RewardLevel
  /** Stamp-earning bookings in the rolling window. */
  bookings: number
  /** Customer no-shows in their window (each one level off). */
  noShowDrops: number
  next: RewardLevel | null
  /** More stamp-earning bookings to reach `next`, while nothing leaves the window; null when out of reach. */
  toNext: number | null
  /**
   * Bookings dropping out of the window in the next 30 days would take the
   * customer below their level: how many more they need by `by` to keep it.
   */
  keep: { needed: number; by: string } | null
}

/** Bookings needed (before drops) so that, less the drops, the level is `target`. */
function bookingsFor(target: RewardLevel, drops: number, settings: RewardsSettings): number | null {
  const index = LEVELS.indexOf(target) + drops
  return index >= LEVELS.length ? null : settings.levels[index].minBookings
}

/**
 * Where a customer stands: their level, what reaching the next takes, and
 * whether bookings leaving the rolling window soon put the level at risk.
 * `completedAt` are their stamp-earning bookings' completion times in the
 * window.
 */
export function levelProgress(
  completedAt: readonly Date[],
  noShowDrops: number,
  now: Date,
  settings: RewardsSettings
): LevelProgress {
  const windowStart = monthsBefore(now, settings.levelWindowMonths)
  const counted = completedAt.filter((at) => at > windowStart)
  const bookings = counted.length
  const level = levelFor(bookings, noShowDrops, settings)
  const index = LEVELS.indexOf(level)
  const next = index < LEVELS.length - 1 ? LEVELS[index + 1] : null
  const nextNeeds = next ? bookingsFor(next, noShowDrops, settings) : null
  const toNext = nextNeeds === null ? null : Math.max(0, nextNeeds - bookings)

  let keep: LevelProgress['keep'] = null
  const keepNeeds = level === 'member' ? null : bookingsFor(level, noShowDrops, settings)
  if (keepNeeds !== null) {
    const soon = new Date(now.getTime() + 30 * DAY_MS)
    const leaving = counted.filter((at) => monthsBefore(soon, settings.levelWindowMonths) >= at).length
    const remaining = bookings - leaving
    if (remaining < keepNeeds) keep = { needed: keepNeeds - remaining, by: istDateKey(soon) }
  }
  return { level, bookings, noShowDrops, next, toNext, keep }
}

// ─── Monthly streak ─────────────────────────────────────────────────────────

/** How many months in a row, ending at `month`, had a stamp-earning booking. */
export function streakLength(months: Iterable<string>, month: string): number {
  const set = new Set(months)
  let length = 0
  let cursor = month
  while (set.has(cursor)) {
    length += 1
    cursor = addMonthsToMonthKey(cursor, -1)
  }
  return length
}

/** Whether a stamp-earning booking in `month` completes a streak (3, 6, 9… months). */
export function streakBonusDue(months: Iterable<string>, month: string, settings: RewardsSettings): boolean {
  const length = streakLength(months, month)
  return settings.streakBonusStamps > 0 && length > 0 && length % settings.streakMonths === 0
}

export interface StreakView {
  /** Months in a row, counting this month if it already has one, else up to last month. */
  months: number
  /** This month already has a stamp-earning booking. */
  thisMonthDone: boolean
  /** Months with a booking still needed for the next bonus (this month included while it has none). */
  toBonus: number
}

export function streakView(months: Iterable<string>, now: Date, settings: RewardsSettings): StreakView {
  const list = [...months]
  const thisMonth = istMonthKey(now)
  const thisMonthDone = list.includes(thisMonth)
  const length = thisMonthDone ? streakLength(list, thisMonth) : streakLength(list, addMonthsToMonthKey(thisMonth, -1))
  return { months: length, thisMonthDone, toBonus: settings.streakMonths - (length % settings.streakMonths) }
}

// ─── Scratch cards ──────────────────────────────────────────────────────────

/** The weights a level draws with: its own, or the standard ones. */
export function weightsFor(level: RewardLevel, settings: RewardsSettings): ScratchWeights {
  return levelSettings(settings, level).scratchWeights ?? settings.scratchWeights
}

/** The prize for a roll in [0, 100): the table, in order. */
export function pickScratchOutcome(
  roll: number,
  weights: ScratchWeights,
  settings: RewardsSettings
): { outcome: ScratchOutcome; amount: number | null } {
  let cursor = Math.floor(roll)
  const prize = (outcome: ScratchOutcome) => ({
    outcome,
    amount: outcome === 'bonus_stamp' ? null : settings.scratchAmounts[outcome],
  })
  for (const outcome of SCRATCH_OUTCOMES) {
    if (cursor < weights[outcome]) return prize(outcome)
    cursor -= weights[outcome]
  }
  return prize('bonus_stamp')
}

/** Draws a prize with the server's own randomness (crypto), or a seeded stand-in in tests. */
export function drawScratchOutcome(
  level: RewardLevel,
  settings: RewardsSettings,
  pick: (max: number) => number = randomInt
) {
  return pickScratchOutcome(pick(100), weightsFor(level, settings), settings)
}

/** The voucher a money prize becomes. */
export function scratchVoucherKind(outcome: ScratchOutcome): VoucherKind | null {
  if (outcome === 'bonus_stamp') return null
  return outcome === 'free_wash' ? 'free_wash' : 'scratch'
}

/** A money prize that would take the month past the cap becomes a bonus stamp. */
export function prizeWithinCap(
  drawn: { outcome: ScratchOutcome; amount: number | null },
  input: { issuedThisMonthPaise: number; capPaise: number }
): { outcome: ScratchOutcome; amount: number | null; fellBack: boolean } {
  if (drawn.amount === null) return { ...drawn, fellBack: false }
  if (input.issuedThisMonthPaise + drawn.amount * 100 > input.capPaise) {
    return { outcome: 'bonus_stamp', amount: null, fellBack: true }
  }
  return { ...drawn, fellBack: false }
}

/** Whether the month's rewards issued have reached the cap (alert once). */
export function capReached(issuedThisMonthPaise: number, capPaise: number): boolean {
  return issuedThisMonthPaise >= capPaise
}

// ─── Vouchers ───────────────────────────────────────────────────────────────

export type VoucherState = 'available' | 'spent' | 'expired' | 'cancelled'

/**
 * Where a voucher stands. `heldBookingId` is the booking holding it
 * (DISCOUNT_HELD: live, or a customer no-show); a cancelled or refunded
 * booking holds nothing, so the voucher is given back, unless it lapsed.
 */
export function voucherState(
  voucher: { expiresAt: Date; cancelledAt: Date | null },
  heldBookingId: string | null,
  now: Date
): VoucherState {
  if (heldBookingId) return 'spent'
  if (voucher.cancelledAt) return 'cancelled'
  if (voucher.expiresAt <= now) return 'expired'
  return 'available'
}

export const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'

/** A voucher's code: RW and 8 characters. Only its owner can use it (resolveDiscount). */
export function newVoucherCode(pick: (max: number) => number = randomInt): string {
  let code = 'RW'
  for (let i = 0; i < 8; i += 1) code += CODE_ALPHABET[pick(CODE_ALPHABET.length)]
  return code
}

/** An invite code: 8 characters, no look-alikes. */
export function newReferralCode(pick: (max: number) => number = randomInt): string {
  let code = ''
  for (let i = 0; i < 8; i += 1) code += CODE_ALPHABET[pick(CODE_ALPHABET.length)]
  return code
}

/** An invite code as typed or pasted, or null when it cannot be one. */
export function normalizeReferralCode(input: string): string | null {
  const code = input.trim().toUpperCase()
  if (code.length !== 8) return null
  for (const ch of code) if (!CODE_ALPHABET.includes(ch)) return null
  return code
}

// ─── Perks ──────────────────────────────────────────────────────────────────

export const PERK_KINDS = ['birthday', 'annual_detailing'] as const
export type PerkKind = (typeof PERK_KINDS)[number]

/** The perk a level gives, or null. */
export function perkAmount(kind: PerkKind, level: RewardLevel, settings: RewardsSettings): number | null {
  const row = levelSettings(settings, level)
  return kind === 'birthday' ? row.birthdayVoucher : row.annualDetailingVoucher
}

/**
 * Whether a perk is due now: the level gives it, it was not given this IST
 * calendar year, and a birthday voucher only in the birthday month.
 */
export function perkDue(
  kind: PerkKind,
  input: { level: RewardLevel; birthdayMonth: number | null; givenThisYear: boolean; now: Date },
  settings: RewardsSettings
): number | null {
  if (input.givenThisYear) return null
  const amount = perkAmount(kind, input.level, settings)
  if (amount === null) return null
  if (kind === 'birthday' && input.birthdayMonth !== istParts(input.now).month + 1) return null
  return amount
}

/** A birthday as the profile takes it: month and day only, a real date (29 Feb allowed). */
export function birthdayProblem(month: number, day: number): string | null {
  if (!Number.isInteger(month) || month < 1 || month > 12) return 'Pick a month'
  const days = new Date(Date.UTC(2024, month, 0)).getUTCDate()
  if (!Number.isInteger(day) || day < 1 || day > days) return 'Pick a day in that month'
  return null
}

// ─── Invite a friend ────────────────────────────────────────────────────────

/**
 * The invite page's proof of when it was opened: the code and the moment,
 * signed with the server's key, so "the account was made after the invite
 * was opened" holds without trusting the app.
 */
export function inviteToken(code: string, openedAt: Date, secret: string): string {
  const body = `${code}.${openedAt.getTime()}`
  const mac = createHmac('sha256', secret).update(`invite:${body}`).digest('base64url')
  return `${body}.${mac}`
}

export function readInviteToken(token: string, secret: string, now: Date): { code: string; openedAt: Date } | null {
  const parts = token.split('.')
  if (parts.length !== 3) return null
  const [code, ms, mac] = parts
  if (!normalizeReferralCode(code) || !/^\d{10,16}$/.test(ms)) return null
  const expected = createHmac('sha256', secret).update(`invite:${code}.${ms}`).digest('base64url')
  const a = Buffer.from(mac)
  const b = Buffer.from(expected)
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null
  const openedAt = new Date(Number(ms))
  if (openedAt.getTime() > now.getTime() + 60_000) return null
  if (now.getTime() - openedAt.getTime() > REWARDS_FIXED.inviteValidDays * DAY_MS) return null
  return { code, openedAt }
}

/** A keyed hash of a phone number: one invite reward per number, ever. Never the number. */
export function phoneHash(phone: string, secret: string): string {
  return createHmac('sha256', secret).update(`referral-phone:${phone.replace(/\D/g, '').slice(-10)}`).digest('hex')
}

export type ReferralClaimRefusal = 'own_code' | 'not_new' | 'already_referred' | 'phone_seen' | 'has_bookings'

/**
 * Whether a signed-in customer may take up an invite. A new customer only:
 * the account was made after the invite was opened, the number was never
 * referred before, and they have no booking yet. Never their own code.
 */
export function referralClaimRefusal(input: {
  referrerId: string
  refereeId: string
  accountCreatedAt: Date
  inviteOpenedAt: Date
  alreadyReferred: boolean
  phoneSeen: boolean
  hasBookings: boolean
}): ReferralClaimRefusal | null {
  if (input.referrerId === input.refereeId) return 'own_code'
  if (input.alreadyReferred) return 'already_referred'
  if (input.phoneSeen) return 'phone_seen'
  if (input.accountCreatedAt.getTime() < input.inviteOpenedAt.getTime()) return 'not_new'
  if (input.hasBookings) return 'has_bookings'
  return null
}

/** A plate as written on different days: letters and digits only, upper case. */
export function normalizePlate(plate: string | null | undefined): string | null {
  const value = (plate ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '')
  return value.length >= 4 ? value : null
}

export type ReferralOutcome = { kind: 'reward'; referrer: boolean } | { kind: 'refuse'; reason: 'same_car' }

/**
 * When the new customer's first stamp-earning booking completes: both get
 * the invite reward, unless their car is one of the inviter's
 * (self-referral); the inviter's half stops at the yearly limit.
 */
export function referralOutcome(
  input: { refereePlate: string | null; referrerPlates: Array<string | null>; referrerRewardedThisYear: number },
  settings: RewardsSettings
): ReferralOutcome {
  const plate = normalizePlate(input.refereePlate)
  if (plate && input.referrerPlates.some((p) => normalizePlate(p) === plate)) return { kind: 'refuse', reason: 'same_car' }
  return { kind: 'reward', referrer: input.referrerRewardedThisYear < settings.referralMaxPerYear }
}

// ─── Habit nudges ───────────────────────────────────────────────────────────

export const NUDGE_KINDS = ['expiring', 'one_away', 'wash_due'] as const
export type NudgeKind = (typeof NUDGE_KINDS)[number]

/** The runs nudges and perks go out in: 10:00–17:59 IST, never at night. */
export function isNudgeRun(now: Date): boolean {
  const hour = istParts(now).hour
  return hour >= 10 && hour < 18
}

/** Whether a customer may get another nudge now. */
export function nudgeAllowed(lastNudgeAt: Date | null, now: Date, settings: RewardsSettings): boolean {
  return !lastNudgeAt || now.getTime() - lastNudgeAt.getTime() >= settings.nudgeGapDays * DAY_MS
}

/** "stamp 4 of 5": the stamp the next booking would be. */
export function nextStampNumber(onCard: number, settings: RewardsSettings): number {
  return (onCard % settings.stampsPerCard) + 1
}

export interface NudgeWords {
  title: string
  body: string
  url: string
}

export function washDueNudge(onCard: number, settings: RewardsSettings): NudgeWords {
  const n = nextStampNumber(onCard, settings)
  const of = settings.stampsPerCard
  return {
    title: "Your car's due a wash",
    body: n === of ? `This one earns stamp ${n} of ${of} — and your reward.` : `This one earns stamp ${n} of ${of}.`,
    url: '/garages',
  }
}

export function oneAwayNudge(rewardAmount: number): NudgeWords {
  return {
    title: 'One wash from your reward',
    body: `Your next booking fills your Shine Card: ₹${rewardAmount} off the one after.`,
    url: '/garages',
  }
}

export function expiringNudge(
  what: 'voucher' | 'scratch_card' | 'stamps',
  input: { amount?: number; count?: number; lastDay: string }
): NudgeWords {
  const day = shortDate(input.lastDay)
  switch (what) {
    case 'voucher':
      return { title: `Your ₹${input.amount} off ends ${day}`, body: 'Use it on your next booking before it goes.', url: '/profile/rewards' }
    case 'scratch_card':
      return { title: 'A scratch card is waiting', body: `Scratch it by ${day} to see what you won.`, url: '/profile/rewards' }
    case 'stamps':
      return {
        title: input.count === 1 ? 'A stamp ends soon' : `${input.count} stamps end soon`,
        body: `Book by ${day} to keep your Shine Card going.`,
        url: '/garages',
      }
  }
}

export interface NudgeCandidate {
  userId: string
  kind: NudgeKind
  /** What it is about, so the same thing is never nudged twice. */
  subjectKey: string
  words: NudgeWords
  /** Lower goes first: something about to lapse beats a reminder to book. */
  priority: number
}

export const NUDGE_PRIORITY = { voucher: 0, scratch_card: 1, stamps: 2, one_away: 3, wash_due: 4 } as const

/**
 * One nudge per customer per run, the most urgent: a voucher, then a
 * scratch card, then stamps about to lapse, then one stamp from a reward,
 * then a wash due. The gap between nudges is held by the claim.
 */
export function planNudges(candidates: readonly NudgeCandidate[]): NudgeCandidate[] {
  const best = new Map<string, NudgeCandidate>()
  for (const candidate of candidates) {
    const current = best.get(candidate.userId)
    if (!current || candidate.priority < current.priority) best.set(candidate.userId, candidate)
  }
  return [...best.values()].sort((a, b) => a.priority - b.priority || a.userId.localeCompare(b.userId))
}

/** Words for a voucher the customer got without asking (push and Updates). */
export function voucherIssuedWords(kind: VoucherKind, amount: number): { title: string; body: string } {
  switch (kind) {
    case 'shine':
      return { title: 'Your Shine Card is full', body: `₹${amount} off your next booking is ready.` }
    case 'referral':
      return { title: 'Your invite paid off', body: `₹${amount} off your next booking is ready.` }
    case 'birthday':
      return { title: 'Happy birthday from Detlio', body: `A wash on us, up to ₹${amount}, this month.` }
    case 'annual_detailing':
      return { title: 'Your yearly detailing is ready', body: `Up to ₹${amount} off a detailing, on us.` }
    case 'adjustment':
      return { title: 'A reward from Detlio', body: `₹${amount} off your next booking is ready.` }
    default:
      return { title: 'You won a scratch card prize', body: `₹${amount} off your next booking is ready.` }
  }
}

// ─── Admin ──────────────────────────────────────────────────────────────────

/**
 * The abuse flag: a customer whose stamps come mostly from bookings at
 * least 80% off (promo codes or vouchers), with enough of them to matter.
 */
export function heavyDiscountFlag(input: { earned: number; heavy: number }): boolean {
  return input.earned >= REWARDS_FIXED.heavyDiscountMinBookings && input.heavy / input.earned > REWARDS_FIXED.heavyDiscountShare
}

/** A manual stamp change, or null when it is fine. */
export function stampAdjustmentRefusal(delta: number, onCard: number): 'zero' | 'too_large' | 'over_card' | null {
  if (!Number.isInteger(delta) || delta === 0) return 'zero'
  if (Math.abs(delta) > REWARDS_FIXED.maxAdjustmentStamps) return 'too_large'
  if (delta < 0 && -delta > onCard) return 'over_card'
  return null
}

/** How many customers stand at each level, and how many moved up or down since a moment. */
export function levelMoves(
  rows: ReadonlyArray<{ now: RewardLevel; before: RewardLevel }>
): { distribution: Record<RewardLevel, number>; up: number; down: number } {
  const distribution = Object.fromEntries(LEVELS.map((level) => [level, 0])) as Record<RewardLevel, number>
  let up = 0
  let down = 0
  for (const row of rows) {
    distribution[row.now] += 1
    const delta = LEVELS.indexOf(row.now) - LEVELS.indexOf(row.before)
    if (delta > 0) up += 1
    if (delta < 0) down += 1
  }
  return { distribution, up, down }
}
