import { apiClient } from '@repo/core/api/client'
import type { ArtSource, GarageRarity, GarageSettings, PullSource, SeriesStatus } from '@repo/core/garage'

/**
 * The Detlio Garage (API 0057): collectible supercar photo cards earned
 * by booking. Live only while rewards are and the Garage's own switch is on
 * (`RewardsConfig.garage.live`); every customer call is a 404 otherwise.
 */

/** A card the customer owns: everything on it. */
export interface GarageOwnedCar {
  id: string
  number: number
  total: number
  series: number
  owned: true
  rarity: GarageRarity
  rarityLabel: string
  name: string
  /** The card's photo: an id in the card photo pool (card-cars.ts). */
  photoId: string
  colour: string
  setting: string
  lore: string
  /** A future series' uploaded picture, used over the photo. */
  art: { source: ArtSource; url: string | null }
  count: number
  firstPulledAt: string | null
}

/** A card not collected yet: its number, rarity and photo id (shown blurred and darkened). */
export interface GarageMissingCar {
  id: null
  number: number
  total: number
  series: number
  owned: false
  rarity: GarageRarity
  rarityLabel: string
  photoId: string
}

export type GarageAlbumCar = GarageOwnedCar | GarageMissingCar

export interface GarageRow {
  row: number
  numbers: number[]
  collected: number
  total: number
  complete: boolean
  completedAt: string | null
  reward: { voucher: boolean; stamps: number } | null
}

export interface GarageAlbum {
  series: { id: string; number: number; name: string; total: number; endsAt: string | null }
  collected: number
  pulls: number
  cars: GarageAlbumCar[]
  rows: GarageRow[]
  rowReward: number
  duplicates: { waiting: number; perStar: number }
  completedAt: string | null
  odds: Record<GarageRarity, number>
  pity: { rare: number; legendary: number }
}

export interface GaragePull {
  id: string
  pulledAt: string
  seen: boolean
  source: PullSource
  sourceLabel: string
  duplicate: boolean
  rootBookingId: string | null
  bookingId: string | null
  rowCompleted: { row: number; voucherAmount: number | null; stamps: number } | null
  seriesCompleted: boolean
  car: GarageOwnedCar
}

export interface GaragePulls {
  pulls: GaragePull[]
  unseen: number
}

export function getGarageAlbum() {
  return apiClient<GarageAlbum>('/users/me/rewards/garage')
}

export function getGaragePulls() {
  return apiClient<GaragePulls>('/users/me/rewards/garage/pulls')
}

export function markGaragePullsSeen(ids: string[]) {
  return apiClient<{ marked: number }>('/users/me/rewards/garage/pulls/seen', { method: 'POST', body: JSON.stringify({ ids }) })
}

// ─── Admin ───────────────────────────────────────────────────────────────────

export interface AdminGarageSeries {
  id: string
  number: number
  name: string
  status: SeriesStatus
  startsAt: string | null
  endsAt: string | null
  createdAt: string
  updatedAt: string
  updatedBy: string | null
}

export interface AdminGarageCar {
  id: string
  seriesId: string
  number: number
  name: string
  rarity: GarageRarity
  photoId: string
  colour: string
  setting: string
  lore: string
  enabled: boolean
  artSource: ArtSource
  artUrl: string | null
  artUpdatedAt: string | null
  artUpdatedBy: string | null
  updatedAt: string
  updatedBy: string | null
  pulls: number
  owners: number
}

export interface AdminGarageOverview {
  masterSwitch: boolean
  rewardsLive: boolean
  live: boolean
  settingsVersion: number
  garage: GarageSettings
  series: AdminGarageSeries[]
  seriesId: string | null
  cars: AdminGarageCar[]
  /** Suggested photo settings for the form. */
  settings: string[]
}

export interface AdminGarageStats {
  month: string
  pulls: number
  rarities: Array<{ rarity: GarageRarity; label: string; odds: number; pulled: number; share: number; byPity: number }>
  sources: Array<{ source: PullSource; label: string; pulled: number }>
  duplicates: { pulled: number; intoStamps: number; garageStamps: number }
  rows: Array<{ row: number; n: number; vouchers: number; amount: string }>
  series: { thisMonth: number; ever: number }
  collectors: number
  topCollectors: Array<{ userId: string; name: string; phone: string; cars: number; copies: number; completed: boolean }>
}

export interface AdminGaragePullRow {
  at: string
  phone: string
  series: number
  number: number
  name: string
  rarity: GarageRarity
  source: PullSource
  duplicate: boolean
  pity: string | null
}

export interface GarageCarEdit {
  name: string
  rarity: GarageRarity
  photoId: string
  colour: string
  setting: string
  lore: string
  enabled: boolean
}

export function getAdminGarage(seriesId?: string) {
  return apiClient<AdminGarageOverview>('/admin/rewards/garage', { params: { seriesId } })
}

export function getAdminGarageStats(seriesId: string, month?: string) {
  return apiClient<AdminGarageStats>('/admin/rewards/garage/stats', { params: { seriesId, month } })
}

export function getAdminGaragePulls(month?: string) {
  return apiClient<{ month: string; rows: AdminGaragePullRow[] }>('/admin/rewards/garage/pulls', { params: { month } })
}

export function updateAdminGarageSeries(id: string, payload: { name: string; status: SeriesStatus; startsAt: string | null; endsAt: string | null }) {
  return apiClient<AdminGarageOverview>(`/admin/rewards/garage/series/${id}`, { method: 'PATCH', body: JSON.stringify(payload) })
}

export function updateAdminGarageCar(id: string, payload: GarageCarEdit) {
  return apiClient<AdminGarageCar>(`/admin/rewards/garage/cars/${id}`, { method: 'PATCH', body: JSON.stringify(payload) })
}

export function garageArtUploadUrl(id: string, sizeBytes: number) {
  return apiClient<{ uploadUrl: string; key: string }>(`/admin/rewards/garage/cars/${id}/art/upload-url`, {
    method: 'POST',
    body: JSON.stringify({ contentType: 'image/webp', sizeBytes }),
  })
}

export function submitGarageArtUpload(id: string, payload: { key: string }) {
  return apiClient<AdminGarageCar>(`/admin/rewards/garage/cars/${id}/art/upload`, { method: 'POST', body: JSON.stringify(payload) })
}

export function resetGarageArt(id: string) {
  return apiClient<AdminGarageCar>(`/admin/rewards/garage/cars/${id}/art/reset`, { method: 'POST', body: JSON.stringify({}) })
}

export function giveGarageCard(userId: string, payload: { reason: string }) {
  return apiClient<{ pullId: string; number: number; name: string; rarity: GarageRarity; duplicate: boolean }>(`/admin/rewards/garage/customers/${userId}/pull`, {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}
