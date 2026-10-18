import type { GiftDesign, GiftState } from '@repo/core/api/gifts'
import { formatRupees } from '@repo/core/job-records'
import { istDateLabel } from '@repo/core/payouts'

/**
 * Gift a wash (0049) in the customer app: the pure parts, so the money and
 * the words are unit-tested. What a gift or credit may do is decided on the
 * server (apps/server/src/lib/gift-credit.ts); these only show it.
 */

/** Razorpay's smallest order, in paise. The server's MIN_GATEWAY_PAISE. */
export const MIN_GATEWAY_PAISE = 100

/**
 * The Detlio credit a checkout uses, in paise: a twin of the server's
 * `creditToUse` (lib/gift-credit.ts), which decides. All of the charge when
 * the balance covers it; otherwise the whole balance, unless that would
 * leave Razorpay less than ₹1 to take, when it stops at the charge − ₹1.
 */
export function creditToUsePaise(chargePaise: number, balancePaise: number): number {
  if (chargePaise <= 0 || balancePaise <= 0) return 0
  if (balancePaise >= chargePaise) return chargePaise
  const cash = chargePaise - balancePaise
  if (cash >= MIN_GATEWAY_PAISE) return balancePaise
  return Math.max(0, chargePaise - MIN_GATEWAY_PAISE)
}

/**
 * Checkout's two lines, in rupees: the credit taken off ("Detlio credit
 * −₹X") and what is left to pay ("To pay ₹Y", ₹0 when credit covers it all).
 * `total` is the price after any promo code; credit comes after it.
 */
export function checkoutCreditSplit(total: number, balance: number): { credit: number; toPay: number } {
  const chargePaise = Math.round(total * 100)
  const creditPaise = creditToUsePaise(chargePaise, Math.round(balance * 100))
  return { credit: creditPaise / 100, toPay: (chargePaise - creditPaise) / 100 }
}

/** "ABCD-EFGH-JKMN-PQRS": how a code is printed and read out. */
export function formatGiftCode(code: string): string {
  const plain = code.replace(/[\s-]/g, '').toUpperCase()
  return plain.match(/.{1,4}/g)?.join('-') ?? plain
}

/**
 * Why a typed gift amount can't be bought, in the customer's words, or null.
 * Whole rupees from `min` to `max`; the server checks the same.
 */
export function giftAmountProblem(amount: number | null, limits: { min: number; max: number }): string | null {
  const range = `Choose a whole amount from ${formatRupees(limits.min)} to ${formatRupees(limits.max)}.`
  if (amount === null || !Number.isFinite(amount)) return range
  if (!Number.isInteger(amount) || amount < limits.min || amount > limits.max) return range
  return null
}

/** A typed amount: digits only, so "1,500" and "₹1500" both read as 1500. Null when empty. */
export function parseGiftAmount(typed: string): number | null {
  const digits = typed.replace(/[^\d]/g, '')
  return digits ? Number(digits) : null
}

/**
 * "12 Oct 2027", in Chennai. The app's IST date label, not en-IN through
 * Intl, which browsers write as "12 Sept" in September.
 */
export function formatGiftDate(iso: string): string {
  return istDateLabel(iso)
}

/** "₹1,000" from the API's decimal string. */
export function giftRupees(amount: string | number): string {
  return formatRupees(Number(amount))
}

/** A ledger row's signed amount: "+₹1,000", "−₹450". */
export function signedRupees(amount: string | number): string {
  const value = Number(amount)
  return `${value < 0 ? '−' : '+'}${formatRupees(Math.abs(value))}`
}

/**
 * The words that go with a shared link (WhatsApp, the share sheet). Says
 * what it is and how to use it; no promise beyond that.
 */
export function giftShareText(input: { amount: string | number; recipientName: string; url: string }): string {
  return `${input.recipientName}, here is a ${giftRupees(input.amount)} Detlio gift for you. Open the link to add it to your Detlio credit and book a car wash: ${input.url}`
}

/** "https://wa.me/?text=…": WhatsApp's own share link, no number picked. */
export function whatsAppShareUrl(text: string): string {
  return `https://wa.me/?text=${encodeURIComponent(text)}`
}

/** A gift's state as the buyer and the recipient read it. */
export const GIFT_STATE_LABELS: Record<GiftState, string> = {
  pending: 'Not paid',
  available: 'Not redeemed yet',
  redeemed: 'Redeemed',
  expired: 'Expired',
  cancelled: 'Cancelled',
}

/** The three stored designs' names (`fresh` is shown as Pearl since the redesign). */
export const GIFT_DESIGN_LABELS: Record<GiftDesign, string> = {
  shine: 'Shine',
  midnight: 'Midnight',
  fresh: 'Pearl',
}

/**
 * The card artwork the buyer picks: three everyday looks and three
 * occasions, in the order the buyer sees them.
 *
 * The server stores only `shine` / `midnight` / `fresh` (a CHECK on
 * `gifts.design`, 0049), so each artwork is saved as one of those
 * (`storedGiftDesign`). An occasion travels to the recipient in the gift
 * link's fragment (`#card=diwali`), which never reaches a server; opened
 * without it (or from "Get a new link"), the gift shows its stored look.
 */
export const GIFT_ARTS = ['shine', 'midnight', 'pearl', 'birthday', 'diwali', 'thankyou'] as const
export type GiftArt = (typeof GIFT_ARTS)[number]

export const GIFT_ART_LABELS: Record<GiftArt, string> = {
  shine: 'Shine',
  midnight: 'Midnight',
  pearl: 'Pearl',
  birthday: 'Birthday',
  diwali: 'Diwali',
  thankyou: 'Thank you',
}

const STORED_DESIGN: Record<GiftArt, GiftDesign> = {
  shine: 'shine',
  midnight: 'midnight',
  pearl: 'fresh',
  birthday: 'shine',
  diwali: 'midnight',
  thankyou: 'fresh',
}

/** The design the server stores for an artwork. */
export function storedGiftDesign(art: GiftArt): GiftDesign {
  return STORED_DESIGN[art]
}

/** The artworks that only ride in the link. */
export function isOccasionArt(art: GiftArt): boolean {
  return art === 'birthday' || art === 'diwali' || art === 'thankyou'
}

/**
 * The artwork to draw for a gift: the occasion in the link when it goes
 * with the stored design (anything else is ignored), else the stored look.
 */
export function giftArtFor(design: GiftDesign, occasion?: string | null): GiftArt {
  const art = GIFT_ARTS.find((a) => a === occasion)
  if (art && isOccasionArt(art) && STORED_DESIGN[art] === design) return art
  return design === 'fresh' ? 'pearl' : design
}

/** The occasion named in a gift link's fragment ("#card=diwali"), or null. */
export function occasionFromHash(hash: string | null | undefined): GiftArt | null {
  const match = /(?:^#|&)card=([a-z]+)/.exec(hash ?? '')
  const art = GIFT_ARTS.find((a) => a === match?.[1])
  return art && isOccasionArt(art) ? art : null
}

/** A gift link's path with its occasion, if any, in the fragment. */
export function giftPathWithArt(path: string, art: GiftArt | null | undefined): string {
  return art && isOccasionArt(art) ? `${path}#card=${art}` : path
}

/**
 * The purchase's evidence line under a sent gift. A gift has no booking
 * receipt, so this (with the Razorpay payment id) is what the buyer points
 * to: "Gift G-000123 · paid ₹1,000 on 12 Oct 2026 · Razorpay payment pay_…".
 */
export function giftEvidenceLine(gift: {
  number: string
  amount: string
  paidAt: string | null
  paymentId: string | null
}): string {
  const parts = [`Gift ${gift.number}`]
  if (gift.paidAt) parts.push(`paid ${giftRupees(gift.amount)} on ${formatGiftDate(gift.paidAt)}`)
  if (gift.paymentId) parts.push(`Razorpay payment ${gift.paymentId}`)
  return parts.join(' · ')
}

/**
 * Whether a page's address holds a gift code: the gift page itself, or
 * sign-in on the way back to one (`next=/gift/<code>`). Third-party scripts
 * that read the address (the Meta Pixel) stay off these pages.
 */
export function carriesGiftCode(pathname: string | null, next: string | null): boolean {
  const isGiftPath = (path: string | null) => !!path && /^\/gift\/[^/]/.test(path)
  return isGiftPath(pathname) || isGiftPath(next)
}
