import { apiClient } from '@repo/core/api/client'
import type { BadgeKey } from '@repo/core/achievements'
import type { RewardLevel } from '@repo/core/rewards'
import type { WrappedStats } from '@repo/core/wrapped'

/**
 * Achievements, seasonal challenges and Detlio Wrapped (API 0054), on top
 * of Detlio Rewards: live only while rewards are (every call is a 404
 * otherwise), so the apps ask `getRewardsConfig` first, as for 0050.
 */

export interface CabinetBadge {
  key: BadgeKey
  label: string
  howTo: string
  /** Earned: what it gave; locked: what it will give. */
  bonusStamps: number
  progress: { current: number; goal: number }
  earned: { id: string; at: string } | null
}

export interface BadgeToCelebrate {
  id: string
  key: BadgeKey | 'challenge'
  label: string
  howTo: string
  bonusStamps: number
  at: string
}

export type ChallengeStatus = 'draft' | 'scheduled' | 'live' | 'finished' | 'ended'
export type ChallengeRewardKind = 'stamps' | 'voucher' | 'multiplier' | 'badge'

export interface CustomerChallenge {
  id: string
  title: string
  description: string | null
  /** "double stamps", "₹100 off" */
  reward: string
  rewardKind: ChallengeRewardKind
  /** "3 washes" */
  counts: string
  startDate: string
  endDate: string
  status: ChallengeStatus
  goal: number
  count: number
  daysLeft: number
  won: boolean
  wonAt: string | null
  full: boolean
  /** "1 of 3 — 4 days left" */
  line: string
}

export interface RewardExtras {
  badges: CabinetBadge[]
  challengeBadges: Array<{ id: string; label: string; challengeId: string | null; at: string }>
  earnedCount: number
  unseen: BadgeToCelebrate[]
  challenges: CustomerChallenge[]
  wrapped: { years: number[] }
}

/** Home's and Profile's part of the rewards summary. */
export interface RewardExtrasSummary {
  badgesEarned: number
  badgesTotal: number
  unseen: BadgeToCelebrate[]
  challenge: CustomerChallenge | null
  wrappedYear: number | null
}

export function getRewardExtras() {
  return apiClient<RewardExtras>('/users/me/rewards/extras')
}

export function markBadgesSeen(ids: string[]) {
  return apiClient<{ seen: number }>('/users/me/rewards/badges/seen', { method: 'POST', body: JSON.stringify({ ids }) })
}

export function getWrapped(year: number) {
  return apiClient<WrappedStats>(`/users/me/rewards/wrapped?year=${year}`)
}

/** Opened or shared: a count only (nothing about the image or where it went). */
export function recordWrappedEvent(year: number, kind: 'opened' | 'shared') {
  return apiClient<{ recorded: boolean }>(`/users/me/rewards/wrapped/${year}/events`, { method: 'POST', body: JSON.stringify({ kind }) })
}

// ─── Admin ───────────────────────────────────────────────────────────────────

export interface AdminBadge {
  key: BadgeKey
  label: string
  howTo: string
  goal: number
  enabled: boolean
  bonusStamps: number
  earned: number
  earnedThisMonth: number
  stampsGiven: number
}

export interface AdminAchievements {
  version: number
  badges: AdminBadge[]
  challengeBadges: number
}

export interface ChallengeFormValues {
  title: string
  description: string | null
  startDate: string
  endDate: string
  goalCount: number
  category: 'car_wash' | 'detailing' | 'coating' | 'scratch_removal' | 'others' | 'package' | null
  bookingType: 'dropin' | 'doorstep' | 'pickup' | null
  rewardKind: ChallengeRewardKind
  rewardStamps: number | null
  rewardAmount: number | null
  rewardMultiplier: number | null
  audienceMinLevel: RewardLevel | null
  maxWinners: number | null
}

export interface AdminChallenge extends ChallengeFormValues {
  id: string
  publishedAt: string | null
  endedAt: string | null
  createdBy: string
  createdAt: string
  publishedBy: string | null
  endedBy: string | null
  status: ChallengeStatus
  reward: string
  counts: string
  participants: number
  winners: number
  cost: { vouchers: string; stamps: number }
  worstCaseVoucherCost: number | null
  overBudget: boolean
}

export interface ChallengeResultRow {
  userId: string
  name: string
  phone: string
  counted: number
  firstCountedAt: string
  wonAt: string | null
  bonusStamps: number | null
  voucherAmount: string | null
  voucherCode: string | null
  voucherUsed: boolean | null
}

export interface AdminChallengeDetail {
  challenge: AdminChallenge
  results: ChallengeResultRow[]
}

export interface AdminWrappedStats {
  year: number
  customersWithWashes: number
  notified: number
  made: number
  opened: number
  opens: number
  sharers: number
  shares: number
}

export function getAdminAchievements() {
  return apiClient<AdminAchievements>('/admin/rewards/achievements')
}

export function getAdminChallenges() {
  return apiClient<{ challenges: AdminChallenge[] }>('/admin/rewards/challenges')
}

export function getAdminChallenge(id: string) {
  return apiClient<AdminChallengeDetail>(`/admin/rewards/challenges/${id}`)
}

export function getAdminChallengeResults(id: string) {
  return apiClient<{ challenge: { id: string; title: string; startDate: string; endDate: string }; rows: ChallengeResultRow[] }>(
    `/admin/rewards/challenges/${id}/results`
  )
}

export function createAdminChallenge(payload: ChallengeFormValues & { actorName: string }) {
  return apiClient<AdminChallengeDetail>('/admin/rewards/challenges', { method: 'POST', body: JSON.stringify(payload) })
}

export function updateAdminChallenge(id: string, payload: ChallengeFormValues & { actorName: string }) {
  return apiClient<AdminChallengeDetail>(`/admin/rewards/challenges/${id}`, { method: 'PUT', body: JSON.stringify(payload) })
}

export function publishAdminChallenge(id: string, actorName: string) {
  return apiClient<AdminChallengeDetail>(`/admin/rewards/challenges/${id}/publish`, { method: 'POST', body: JSON.stringify({ actorName }) })
}

export function endAdminChallenge(id: string, actorName: string) {
  return apiClient<AdminChallengeDetail>(`/admin/rewards/challenges/${id}/end`, { method: 'POST', body: JSON.stringify({ actorName }) })
}

export function getAdminWrappedStats(year: number) {
  return apiClient<AdminWrappedStats>(`/admin/rewards/wrapped/stats?year=${year}`)
}

export function getAdminCustomerWrapped(userId: string, year: number) {
  return apiClient<WrappedStats>(`/admin/rewards/customers/${userId}/wrapped?year=${year}`)
}
