import type { AdminGiftFilter, GiftState } from '@repo/core/api/gifts'
import { APP_TIMEZONE } from '@repo/core/utils'

/**
 * Admin → Gifts (0049): the pure parts of the page, unit-tested. The rules
 * about gifts and credit live on the server (lib/gift-credit.ts).
 */

export const GIFT_FILTERS: AdminGiftFilter[] = ['all', 'available', 'redeemed', 'expired', 'cancelled']

export const GIFT_FILTER_LABELS: Record<AdminGiftFilter, string> = {
  all: 'All',
  available: 'Available',
  redeemed: 'Redeemed',
  expired: 'Expired',
  cancelled: 'Cancelled',
}

/** The `?show=` chip, or All for anything else. */
export function parseGiftFilter(value: string | null): AdminGiftFilter {
  return GIFT_FILTERS.find((filter) => filter === value) ?? 'all'
}

/** The page's own URL for a chip; All is the bare path. */
export function giftsListHref(filter: AdminGiftFilter): string {
  return filter === 'all' ? '/gifts' : `/gifts?show=${filter}`
}

export const GIFT_STATE_LABELS: Record<GiftState, string> = {
  pending: 'Not paid',
  available: 'Available',
  redeemed: 'Redeemed',
  expired: 'Expired',
  cancelled: 'Cancelled',
}

export const GIFT_STATE_BADGES: Record<GiftState, 'success' | 'pending' | 'muted' | 'danger'> = {
  pending: 'pending',
  available: 'success',
  redeemed: 'muted',
  expired: 'muted',
  cancelled: 'muted',
}

/** Cancel is offered while a gift can still be paid or redeemed. */
export function canCancelGift(state: GiftState): boolean {
  return state === 'available' || state === 'pending'
}

/** The most one adjustment may move, in rupees: the server's MAX_ADJUSTMENT. */
export const MAX_ADJUSTMENT = 10000

/**
 * A typed adjustment: signed rupees, up to two decimals ("+200", "-150",
 * "−150", "75.50"). The amount, or why it can't be one.
 */
export function parseAdjustment(typed: string): { amount: number } | { problem: string } {
  const text = typed.replace(/\s/g, '').replace(/[−–]/g, '-').replace(/₹/g, '').replace(/,/g, '')
  if (!/^[+-]?\d+(\.\d{1,2})?$/.test(text)) {
    return { problem: 'Type an amount in rupees, with + to add or − to take away (e.g. +200 or −150).' }
  }
  const amount = Math.round(Number(text) * 100) / 100
  if (amount === 0) return { problem: 'Enter an amount other than ₹0.' }
  if (Math.abs(amount) > MAX_ADJUSTMENT) return { problem: 'One adjustment can be at most ₹10,000.' }
  return { amount }
}

/** A ledger amount with its sign: "+₹1,000", "−₹450". */
export function signedRupees(amount: string | number): string {
  const value = Number(amount)
  return `${value < 0 ? '−' : '+'}₹${Math.abs(value).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`
}

const DAY = new Intl.DateTimeFormat('en-IN', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: APP_TIMEZONE,
})

/** "12 Oct 2027", in Chennai; a dash for none. */
export function formatDay(iso: string | null | undefined): string {
  if (!iso) return '—'
  const parts = DAY.formatToParts(new Date(iso))
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value ?? ''
  return `${part('day')} ${part('month')} ${part('year')}`
}

/** A 10-digit Indian mobile, as the server's find takes it, or null. */
export function cleanPhone(typed: string): string | null {
  const digits = typed.replace(/\D/g, '')
  const local = digits.length === 12 && digits.startsWith('91') ? digits.slice(2) : digits
  return /^[6-9]\d{9}$/.test(local) ? local : null
}
