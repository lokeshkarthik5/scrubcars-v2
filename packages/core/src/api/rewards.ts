import { apiClient } from '@repo/core/api/client'
import type { RewardLevel, RewardsSettings, ScratchOutcome } from '@repo/core/rewards'
import type { RewardExtrasSummary } from '@repo/core/api/reward-extras'

/**
 * Detlio Rewards (0050): the Shine Card, scratch cards, streaks, levels and
 * Invite a friend. Live only while REWARDS_ENABLED (the API's master switch)
 * and the admin's switch are both on: every call but the `config` ones is a
 * 404 otherwise, so the apps ask `getRewardsConfig` first and hide every
 * entry point when `enabled` is false. An invite code travels in a body.
 */

export interface RewardsConfig {
  enabled: boolean
  /** The live numbers (never the budget); null while off. */
  settings: Omit<RewardsSettings, 'monthlyCap'> | null
}

export interface RewardStamp {
  id: string
  source: 'booking' | 'scratch' | 'streak' | 'adjustment' | 'badge' | 'challenge' | 'coupon'
  label: string
  earnedAt: string
  expiresAt: string
  /** Last IST day it counts, "YYYY-MM-DD". */
  lastDay: string
  bookingId: string | null
  state: 'on_card' | 'used' | 'expired' | 'removed'
}

export interface ShineCard {
  onCard: number
  goal: number
  toGo: number
  /** The voucher a full card gives at the customer's level, ₹. */
  rewardAmount: number
  stamps: RewardStamp[]
  nextExpiry: { count: number; lastDay: string } | null
}

export interface RewardLevelView {
  level: RewardLevel
  label: string
  bookings: number
  noShowDrops: number
  next: RewardLevel | null
  nextLabel: string | null
  toNext: number | null
  keep: { needed: number; by: string } | null
}

export type VoucherState = 'available' | 'spent' | 'expired' | 'cancelled'

export interface RewardVoucher {
  id: string
  kind: 'shine' | 'scratch' | 'free_wash' | 'referral' | 'birthday' | 'annual_detailing' | 'adjustment' | 'challenge'
  label: string
  amount: string
  /** The code checkout takes: only while it can be used. */
  code: string | null
  issuedAt: string
  expiresAt: string
  lastDay: string
  state: VoucherState
  /** The booking it was spent on. */
  bookingId: string | null
  sourceBookingId: string | null
}

export interface ScratchCardView {
  id: string
  rootBookingId: string
  /** The booking page it belongs on (the chain's completed row). */
  bookingId: string
  vendorName: string | null
  createdAt: string
  expiresAt: string
  lastDay: string
  state: 'waiting' | 'scratched' | 'expired' | 'void'
  /** Only once scratched. */
  prize: { outcome: ScratchOutcome; label: string; amount: string | null; fellBack: boolean } | null
}

export interface RewardsSummary {
  card: ShineCard
  level: RewardLevelView
  scratchWaiting: number
  scratchCards: ScratchCardView[]
  vouchersAvailable: number
  /** Available vouchers, biggest first. */
  vouchers: RewardVoucher[]
  /** Badges, the challenge to show and Wrapped (0054); null if that part failed. */
  extras?: RewardExtrasSummary | null
}

export interface LadderStep {
  key: RewardLevel
  label: string
  minBookings: number
  unlocks: string[]
  reached: boolean
  current: boolean
}

export interface MyRewards {
  card: ShineCard
  level: RewardLevelView
  ladder: LadderStep[]
  streak: { months: number; thisMonthDone: boolean; toBonus: number; monthsNeeded: number; bonusStamps: number }
  lifetime: { saved: string; washes: number; since: string | null }
  vouchers: RewardVoucher[]
  scratchCards: ScratchCardView[]
  history: Array<{ id: string; at: string; title: string; detail: string; bookingId: string | null }>
  birthday: { month: number; day: number } | null
  invite: { code: string | null; amount: number; minAmount: number; rewardedThisYear: number; maxPerYear: number; pending: number }
  referredBy: { firstName: string; status: 'pending' | 'rewarded' | 'refused' } | null
}

export interface ScratchResult {
  outcome: ScratchOutcome
  label: string
  amount: string | null
  fellBack: boolean
  voucher: { id: string; code: string; amount: string; lastDay: string } | null
  shineVoucher: { id: string; amount: string } | null
}

export interface InviteOpened {
  referrerFirstName: string
  amount: number
  minAmount: number
  /** Kept on this device and sent back after signing up. */
  token: string
}

export function getRewardsConfig() {
  return apiClient<RewardsConfig>('/rewards/config', { auth: false })
}

export function getMyRewards() {
  return apiClient<MyRewards>('/users/me/rewards')
}

export function getRewardsSummary() {
  return apiClient<RewardsSummary>('/users/me/rewards/summary')
}

export function scratchCard(cardId: string) {
  return apiClient<ScratchResult>(`/users/me/rewards/scratch-cards/${cardId}/scratch`, { method: 'POST' })
}

export function createInvite() {
  return apiClient<{ code: string; amount: number }>('/users/me/rewards/invite', { method: 'POST' })
}

export function setBirthday(birthday: { month: number; day: number } | null) {
  return apiClient<{ birthday: { month: number; day: number } | null }>('/users/me/rewards/birthday', {
    method: 'PUT',
    body: JSON.stringify({ birthday }),
  })
}

export function openInvite(code: string) {
  return apiClient<InviteOpened>('/rewards/invites/open', { method: 'POST', body: JSON.stringify({ code }), auth: false })
}

export function claimInvite(token: string) {
  return apiClient<{ referrerFirstName: string; amount: number; minAmount: number }>('/users/me/rewards/invite/claim', {
    method: 'POST',
    body: JSON.stringify({ token }),
  })
}

// ─── Admin ───────────────────────────────────────────────────────────────────

export interface AdminRewardsSettings {
  masterSwitch: boolean
  live: boolean
  version: number
  settings: RewardsSettings
  savedBy: string
  savedAt: string | null
  versions: Array<{ version: number; actorName: string; createdAt: string }>
  limits: Record<string, { min: number; max: number }>
  defaults: RewardsSettings
}

interface KindRow {
  kind: string
  label: string
  count: number
  amount: string
}

export interface AdminRewardsSummary {
  month: string
  live: boolean
  masterSwitch: boolean
  cap: string
  issued: string
  capReachedAt: string | null
  scratchPrizesCounted: string
  vouchers: { issued: KindRow[]; redeemed: KindRow[]; expired: KindRow[] }
  stamps: {
    bySource: Array<{ source: string; label: string; earned: number; used: number; lapsed: number; removed: number }>
    lapsedThisMonth: number
  }
  bookings: { earned: number; refused: number; revoked: number }
  scratch: {
    outcomes: Array<{ outcome: ScratchOutcome; label: string; weight: number; drawn: number; given: number; scratched: number }>
    fellBack: number
    expiredUnscratched: number
  }
  levels: {
    distribution: Array<{ level: RewardLevel; label: string; customers: number }>
    movedUp: number
    movedDown: number
    noShowDrops: number
    customers: number
  }
  streaks: { active: number; oneMonth: number; twoPlus: number; bonusesThisMonth: number }
  referrals: {
    month: { opened: number; signedUp: number; firstBooking: number; rewarded: number; refused: number }
    allTime: { opened: number; signedUp: number; firstBooking: number; rewarded: number; refused: number }
  }
  topCustomers: Array<{ userId: string; name: string; phone: string; earned: number; vouchers: number; saved: string }>
  flagged: Array<{ userId: string; name: string; phone: string; earned: number; heavy: number }>
}

export interface AdminRewardsLedger {
  month: string
  rows: Array<{
    at: string
    type: string
    detail: string | null
    amount: string | null
    userId: string
    name: string
    phone: string
    bookingId: string | null
    state: string | null
  }>
}

export interface AdminCustomerRewards {
  customer: { id: string; name: string; phone: string; joinedAt: string; birthday: string | null }
  card: ShineCard
  level: RewardLevelView
  streak: { months: number; thisMonthDone: boolean; toBonus: number }
  lifetime: { saved: string; washes: number; since: string | null }
  flagged: boolean
  heavyDiscount: { earned: number; heavy: number }
  stamps: RewardStamp[]
  vouchers: Array<RewardVoucher & { reason?: string | null; actorName?: string | null }>
  scratchCards: Array<ScratchCardView & { drawn: { outcome: ScratchOutcome; label: string; fellBack: boolean } }>
  perks: Array<{ id: string; kind: string; label: string; year: number; level: RewardLevel; createdAt: string }>
  timeline: Array<{ at: string; type: string; title: string; detail: string; bookingId: string | null }>
  referrals: Array<{ id: string; status: string; refusal: string | null; claimedAt: string; settledAt: string | null; refereeName: string; referrerRewarded: boolean }>
  referredBy: { firstName: string; status: string } | null
}

export type AdjustRewardsPayload =
  | { action: 'add_stamps' | 'remove_stamps'; stamps: number; reason: string; actorName: string }
  | { action: 'issue_voucher'; amount: number; reason: string; actorName: string }
  | { action: 'cancel_voucher'; voucherId: string; reason: string; actorName: string }

export function getAdminRewardsConfig() {
  return apiClient<{ masterSwitch: boolean }>('/admin/rewards/config')
}

export function getAdminRewardsSettings() {
  return apiClient<AdminRewardsSettings>('/admin/rewards/settings')
}

export function saveAdminRewardsSettings(payload: { version: number; settings: RewardsSettings; actorName: string }) {
  return apiClient<AdminRewardsSettings>('/admin/rewards/settings', { method: 'PUT', body: JSON.stringify(payload) })
}

export function getAdminRewardsSummary(month?: string) {
  return apiClient<AdminRewardsSummary>(`/admin/rewards/summary${month ? `?month=${month}` : ''}`)
}

export function getAdminRewardsLedger(month?: string) {
  return apiClient<AdminRewardsLedger>(`/admin/rewards/ledger${month ? `?month=${month}` : ''}`)
}

export function findCustomerRewards(phone: string) {
  return apiClient<AdminCustomerRewards>('/admin/rewards/find', { method: 'POST', body: JSON.stringify({ phone }) })
}

export function getCustomerRewards(userId: string) {
  return apiClient<AdminCustomerRewards>(`/admin/rewards/customers/${userId}`)
}

export function adjustCustomerRewards(userId: string, payload: AdjustRewardsPayload) {
  return apiClient<AdminCustomerRewards>(`/admin/rewards/customers/${userId}/adjust`, {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}
