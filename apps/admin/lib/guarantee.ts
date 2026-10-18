/**
 * Admin's Redo claims page (Detlio Guarantee, 0051): the tabs, and the words
 * for a claim's clock and the customer's figures. Pure, so unit-tested.
 */
import type { AdminClaim, AdminClaimTab } from '@repo/core/api/guarantee'
import { formatWhen } from './bookings'

export const CLAIM_TABS: AdminClaimTab[] = ['needs_decision', 'open', 'closed']

export const CLAIM_TAB_LABELS: Record<AdminClaimTab, string> = {
  needs_decision: 'Needs decision',
  open: 'Open',
  closed: 'Closed',
}

export function parseClaimTab(raw: string | null): AdminClaimTab {
  return (CLAIM_TABS as string[]).includes(raw ?? '') ? (raw as AdminClaimTab) : 'needs_decision'
}

export function claimTabHref(tab: AdminClaimTab): string {
  return tab === 'needs_decision' ? '/guarantee' : `/guarantee?tab=${tab}`
}

/** "Decide by Sun 18 Oct, 10:00 am" / "Garage answers by …" / nothing once settled. */
export function claimClockLine(claim: Pick<AdminClaim, 'status' | 'detlioDecideBy' | 'garageRespondBy' | 'redoBookBy'>): string | null {
  if (claim.status === 'needs_detlio' && claim.detlioDecideBy) return `Decide by ${formatWhen(claim.detlioDecideBy)}`
  if (claim.status === 'waiting_garage' && claim.garageRespondBy) {
    return `Garage answers by ${formatWhen(claim.garageRespondBy)}`
  }
  if (claim.status === 'redo_approved' && claim.redoBookBy) return `Customer books by ${formatWhen(claim.redoBookBy)}`
  return null
}

/**
 * The customer's figures in one line, admin only: "3 of 8 bookings claimed ·
 * 1 approved in 6 months · 1 claim left". Never shown to the customer.
 */
export function customerFiguresLine(figures: AdminClaim['customerFigures']): string {
  const parts = [
    `${figures.claims} claim${figures.claims === 1 ? '' : 's'} over ${figures.completedBookings} completed booking${figures.completedBookings === 1 ? '' : 's'}`,
    `${figures.approvedLast6Months} approved in 6 months`,
    figures.waiting > 0 ? `${figures.waiting} waiting` : null,
    `${figures.claimsLeft} claim${figures.claimsLeft === 1 ? '' : 's'} left`,
  ]
  return parts.filter(Boolean).join(' · ')
}

/** The flags worth a badge: first booking, claims often, none left. */
export function customerFlags(figures: AdminClaim['customerFigures']): string[] {
  return [
    figures.firstBooking ? 'First booking' : null,
    figures.claimsOften ? 'Claims often' : null,
    figures.claimsLeft === 0 ? 'No claims left' : null,
  ].filter((flag): flag is string => flag !== null)
}

/** What a decision does, in the dialog's own words. */
export const DECISION_WORDS = {
  redo: {
    label: 'Approve a free redo',
    effect: 'The customer picks a free time at the same garage within 7 days. The garage is paid nothing for the redo.',
  },
  refund: {
    label: 'Approve a refund instead',
    effect:
      "The booking's payment is owed back to the customer (Refunds page, or sent automatically when that is on); any Detlio credit part goes back as credit. The garage earns nothing on the job: a payout already made comes off its next one.",
  },
  reject: {
    label: 'Do not approve',
    effect: 'The claim closes. The customer reads your reason on their booking.',
  },
} as const
