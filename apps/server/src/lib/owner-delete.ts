/**
 * The owner deletes anything (owner, 10 Nov 2026: "As a owner I basically
 * need access to delete or remove anything & everything"): the rules for the
 * hard deletes where the rest of the team only has a soft one (Hide, Void,
 * End, Deactivate, Logged in error). Only the owner's login or the shared
 * break-glass login reaches them (`canDeleteAnything`, requireOwner).
 *
 * What stays out of reach on purpose: refunds, payouts, receipts, the audit
 * log and the deleted-test-payments ledger. They are money records, and go
 * only with their booking through Delete test booking (lib/data-reset.ts),
 * which accounts for every rupee in the ledger.
 *
 * Pure: the services read the rows and pass them in.
 */

/**
 * Whether what was typed is the name or number asked for, for a delete that
 * touches money or a customer. Case and the spaces around it don't count;
 * spelling does. The twin of packages/core/src/confirm.ts's
 * typedConfirmMatches, which the panel's ConfirmSheet runs: one rule.
 */
export function typedConfirmMatches(typed: string, expected: string): boolean {
  const want = expected.trim().toLowerCase()
  return want.length > 0 && typed.trim().toLowerCase() === want
}

/** A refusal: the code and the words the panel shows where the button was. */
export interface OwnerDeleteRefusal {
  status: 404 | 409
  code: string
  message: string
}

/**
 * A redo claim (Detlio Guarantee, 0051) goes only once its free redo
 * booking is gone or was never made. The redo is a booking with its own
 * money record; it goes with its chain through Delete test booking, which
 * takes the claim's first booking with it.
 */
export function claimDeleteRefusal(claim: { redoBookingId: string | null }): OwnerDeleteRefusal | null {
  if (!claim.redoBookingId) return null
  return {
    status: 409,
    code: 'GUARANTEE_REDO_EXISTS',
    message: 'This claim has a free redo booking. Delete the redo booking first (mark it Test, then Delete test booking).',
  }
}

/**
 * Only a gift nobody has redeemed. Once redeemed it is credit in someone's
 * balance (and maybe spent), which is real money the customer holds.
 */
export function giftDeleteRefusal(gift: { status: string; redeemedAt: Date | null }): OwnerDeleteRefusal | null {
  if (gift.status !== 'redeemed' && gift.redeemedAt === null) return null
  return {
    status: 409,
    code: 'GIFT_REDEEMED',
    message: "This gift was redeemed: its credit is the customer's now, so it can't be deleted.",
  }
}

/**
 * A team login, never your own and never the owner's (there is one owner,
 * and the team would have nobody to run it). Records keep the name it
 * signed with, as text.
 */
export function adminLoginDeleteRefusal(input: {
  target: { id: string; isOwner: boolean }
  actorLoginId: string | null
}): OwnerDeleteRefusal | null {
  if (input.target.id === input.actorLoginId) {
    return { status: 409, code: 'ADMIN_LOGIN_SELF', message: "You can't delete your own login." }
  }
  if (input.target.isOwner) {
    return {
      status: 409,
      code: 'ADMIN_LOGIN_OWNER_KEPT',
      message: "The owner's login can't be deleted: the team needs its owner.",
    }
  }
  return null
}

/** What a zone's delete takes with it (the owner's "Delete anyway"), counted for the sheet. */
export interface ZoneUse {
  leads: number
  signups: number
  requests: number
  recommendations: number
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

/**
 * The sheet's lines for deleting a zone that is in use, in plain words, the
 * zeros left out. What happens to each: leads move to the zone their pin is
 * in (or to none), customers' sign-ups go (with any free wash still held),
 * recommendations stay without a zone, requests keep the zone's name.
 */
export function zoneDeleteLines(use: ZoneUse): string[] {
  const lines: string[] = []
  if (use.signups > 0) {
    lines.push(`${plural(use.signups, "customer's sign-up goes", "customers' sign-ups go")}, with any free wash still held.`)
  }
  if (use.leads > 0) {
    lines.push(
      `${plural(use.leads, 'lead moves', 'leads move')} to whichever zone ${use.leads === 1 ? 'its pin is' : 'their pins are'} in, or to none.`
    )
  }
  if (use.recommendations > 0) {
    lines.push(`${plural(use.recommendations, 'recommendation stays', 'recommendations stay')} without a zone.`)
  }
  if (use.requests > 0) {
    lines.push(`${plural(use.requests, 'visit request keeps', 'visit requests keep')} the zone's name, as sent.`)
  }
  return lines
}

/**
 * The last four digits of a phone, as lists show a customer's number
 * ("••••3210"). A deleted account's placeholder shows as nothing.
 */
export function maskedPhone(phone: string | null | undefined): string | null {
  if (!phone || !/^\d{10}$/.test(phone)) return null
  return `••••${phone.slice(-4)}`
}
