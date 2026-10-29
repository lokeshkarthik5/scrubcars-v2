/**
 * Deleting an account in the app (0066; Apple 5.1.1(v), owner decision
 * 29 Oct 2026: "anonymise instead of refuse").
 *
 * A users row is never deleted: bookings, receipts, refunds, payments, gifts
 * and the credit ledger name it, and those are records the law (and
 * AGENTS.md's money rules) say we keep. Deleting the account blanks the
 * person instead (`anonymisedUser`): the name, the phone (freed, so the
 * number can sign up again as a new account), the email, the photo and the
 * birthday; their cars' plates and colours, saved addresses, saved garages,
 * devices, sessions, alerts, sign-ups and the addresses copied onto their
 * bookings are removed in the same transaction (account.repository).
 * Reviews stay, shown as "Former customer" (`DELETED_REVIEW_NAME`).
 *
 * It is refused only while something is still open (`deletionBlockers`):
 * a booking to come or in progress, a payment being made, money owed back
 * to them, Detlio credit left, or a gift they bought that nobody has
 * redeemed yet. Each refusal says what to do first. Owning a garage is
 * refused too: closing a garage is "Close my garage" (0066), never a
 * side effect of deleting a login.
 */

/** The name a deleted account's row carries (admin and the garage read it). */
export const DELETED_ACCOUNT_NAME = 'Deleted account'

/** How a deleted customer's reviews are signed on every screen. */
export const DELETED_REVIEW_NAME = 'Former customer'

/** Every deleted account's phone starts with this; never digits after it. */
export const DELETED_PHONE_PREFIX = 'deleted-'

/** Letters only, so no placeholder can ever read as (or end in) a phone number. */
const PLACEHOLDER_LETTERS = 'abcdefghijklmnopqrstuvwxyz'
const PLACEHOLDER_LENGTH = 12

/**
 * The placeholder phone for a deleted account: `deleted-` and 12 random
 * letters (20 characters, the column's size). Unique in practice (26^12),
 * and the unique index would refuse a clash, rolling the deletion back.
 */
export function deletedPhone(randomBytes: Uint8Array): string {
  if (randomBytes.length < PLACEHOLDER_LENGTH) throw new Error('deletedPhone: needs 12 random bytes')
  let suffix = ''
  for (let i = 0; i < PLACEHOLDER_LENGTH; i++) {
    suffix += PLACEHOLDER_LETTERS[randomBytes[i]! % PLACEHOLDER_LETTERS.length]
  }
  return `${DELETED_PHONE_PREFIX}${suffix}`
}

export function isDeletedPhone(phone: string | null | undefined): boolean {
  return typeof phone === 'string' && phone.startsWith(DELETED_PHONE_PREFIX)
}

/**
 * The users row after deletion: every personal field blanked, the switches
 * off, the seat flag cleared (its seats are removed with it). What is not
 * here is kept: the id, `is_customer`, `status` and `created_at`.
 */
export function anonymisedUser(input: { now: Date; phone: string }) {
  return {
    name: DELETED_ACCOUNT_NAME,
    phone: input.phone,
    email: null,
    avatarUrl: null,
    avatarStorageKey: null,
    phoneVerified: false,
    isVendorOwner: false,
    pushBookingUpdates: false,
    pushReminders: false,
    birthdayMonth: null,
    birthdayDay: null,
    deletedAt: input.now,
  }
}

/**
 * A car a booking still names (its foreign key is RESTRICT) is kept for that
 * booking, without what identifies it: the plate and the colour go, and it
 * leaves the garage list. A car nothing names is deleted outright.
 */
export function anonymisedVehicle(now: Date) {
  return { licensePlate: null, color: null, isDefault: false, archivedAt: now }
}

// ─── What blocks it ──────────────────────────────────────────────────────────

export interface AccountDeletionFacts {
  /** The account is `vendors.owner_id` of at least one garage. */
  ownsGarage: boolean
  /** Their bookings still pending, confirmed or in progress. */
  openBookings: Array<{ reference: string; status: string }>
  /** A checkout of theirs that could still be paid (pending, not expired). */
  openCheckout: boolean
  /** Redo claims nobody has decided yet, by booking reference: a refund could still be owed. */
  openClaims?: Array<{ reference: string }>
  /** Money lib/refunds.ts says is owed back to them, per item. */
  refundsOwed: Array<{ reference: string; amount: string }>
  /** Detlio credit they can still spend, in paise. */
  creditBalancePaise: number
  /** Paid gifts they bought that nobody has redeemed and that have not expired. */
  unredeemedGifts: Array<{ number: string; expiresAt: Date | null }>
}

export type AccountDeletionBlockerCode =
  | 'VENDOR_OWNER_ACCOUNT'
  | 'ACCOUNT_HAS_OPEN_BOOKING'
  | 'ACCOUNT_HAS_OPEN_CHECKOUT'
  | 'ACCOUNT_HAS_OPEN_CLAIM'
  | 'ACCOUNT_REFUND_OWED'
  | 'ACCOUNT_HAS_CREDIT'
  | 'ACCOUNT_HAS_UNREDEEMED_GIFT'

export interface AccountDeletionBlocker {
  code: AccountDeletionBlockerCode
  /** What is open and what to do first, in the customer's words. */
  message: string
}

const rupeesText = (paise: number) => `₹${(paise / 100).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`

function rupeesFromAmount(amount: string): string {
  return rupeesText(Math.round(Number(amount) * 100))
}

const DATE_FORMAT = new Intl.DateTimeFormat('en-IN', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: 'Asia/Kolkata',
})

function listed(items: string[], max = 3): string {
  const shown = items.slice(0, max)
  const more = items.length - shown.length
  return more > 0 ? `${shown.join(', ')} and ${more} more` : shown.join(', ')
}

/**
 * Everything that has to finish before the account can go, in the order
 * the sheet lists it. Empty means it can be deleted now.
 */
export function deletionBlockers(facts: AccountDeletionFacts): AccountDeletionBlocker[] {
  const blockers: AccountDeletionBlocker[] = []

  if (facts.ownsGarage) {
    blockers.push({
      code: 'VENDOR_OWNER_ACCOUNT',
      message:
        'This number owns a garage on Detlio. Close the garage first (garage app → Settings → Account → Close my garage), or move it to another owner.',
    })
  }

  if (facts.openBookings.length > 0) {
    const refs = facts.openBookings.map((b) => `#${b.reference}`)
    blockers.push({
      code: 'ACCOUNT_HAS_OPEN_BOOKING',
      message:
        facts.openBookings.length === 1
          ? `Your booking ${refs[0]} is still open. Cancel it, or wait until it is done, then delete your account.`
          : `Your bookings ${listed(refs)} are still open. Cancel them, or wait until they are done, then delete your account.`,
    })
  }

  if (facts.openCheckout) {
    blockers.push({
      code: 'ACCOUNT_HAS_OPEN_CHECKOUT',
      message: 'A payment you started is still open. Finish it, or wait 30 minutes for it to lapse, then try again.',
    })
  }

  const openClaims = facts.openClaims ?? []
  if (openClaims.length > 0) {
    const refs = openClaims.map((c) => `#${c.reference}`)
    blockers.push({
      code: 'ACCOUNT_HAS_OPEN_CLAIM',
      message: `Your Detlio Guarantee claim on ${listed(refs)} is still being looked at. Withdraw it, or wait for the answer, then delete your account.`,
    })
  }

  if (facts.refundsOwed.length > 0) {
    const total = facts.refundsOwed.reduce((sum, item) => sum + Math.round(Number(item.amount) * 100), 0)
    blockers.push({
      code: 'ACCOUNT_REFUND_OWED',
      message: `We still owe you a refund of ${rupeesText(total)} (${listed(
        facts.refundsOwed.map((item) => `#${item.reference} ${rupeesFromAmount(item.amount)}`)
      )}). Once it reaches you, you can delete your account. Need it sooner? Contact Detlio support.`,
    })
  }

  if (facts.creditBalancePaise > 0) {
    blockers.push({
      code: 'ACCOUNT_HAS_CREDIT',
      message: `You have ${rupeesText(facts.creditBalancePaise)} of Detlio credit. Use it on a booking first, or contact Detlio support; deleting the account would lose it.`,
    })
  }

  if (facts.unredeemedGifts.length > 0) {
    const first = facts.unredeemedGifts[0]!
    const until = first.expiresAt ? ` (it lasts until ${DATE_FORMAT.format(first.expiresAt)})` : ''
    blockers.push({
      code: 'ACCOUNT_HAS_UNREDEEMED_GIFT',
      message: `A gift you bought (${listed(facts.unredeemedGifts.map((g) => g.number))}) hasn't been redeemed yet${until}. Once it is, you can delete your account, or contact Detlio support to cancel and refund it.`,
    })
  }

  return blockers
}
