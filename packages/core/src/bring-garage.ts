import { REFERRAL_CREDIT } from './area-signups'
import { whatsAppHref } from './contact-links'
import { t } from './i18n/translate'
import { normaliseIndianMobile } from './phone'

/**
 * "Bring your garage" (owner, 21 Nov 2026; mockup
 * reference/mockups/bring-your-garage): a card at the end of the garage list
 * and a row in Profile open the Recommend sheet, which sends to Detlio (the
 * team calls the garage) or on WhatsApp from the customer's own phone, with
 * a ready message and the garage app's sign-up link. Either way it is saved
 * as a recommendation; when the garage signs up with that number it is
 * linked to the customer (the server's lib/recommendations.ts), and their
 * ₹500 is paid after a paid booking there. Detlio itself sends nothing.
 *
 * Words for both customer apps live here, so the website and the native
 * app say the same. The WhatsApp message stays English (owner): it goes to
 * a garage owner, from the customer.
 */

/**
 * Where a garage signs up: the garage app's login, which takes a new number
 * on to set the garage up (apps/vendors: /login → /verify-otp →
 * /onboarding/step-1).
 */
export const GARAGE_JOIN_URL = 'https://vendor.detlio.com/login'

/** Their WhatsApp number as ten digits, or null unless it is an Indian mobile (WhatsApp needs one). */
export function whatsAppNumber(raw: string): string | null {
  const digits = normaliseIndianMobile(raw.trim())
  return /^[6-9]\d{9}$/.test(digits) ? digits : null
}

/** The first word of the customer's name, for the message's sign-off; null when there is none to use. */
export function signOffName(name: string | null | undefined): string | null {
  const first = name?.trim().split(/\s+/)[0] ?? ''
  return first.length >= 2 ? first : null
}

/**
 * The message the customer sends the garage owner (English, mockup screens
 * 2b and 3). The garage's name as typed; signed with the customer's first
 * name when we have one.
 */
export function bringGarageMessage(garageName: string, customerName?: string | null): string {
  const garage = garageName.trim() || 'your garage'
  const name = signOffName(customerName)
  return [
    `Hi! I’ve recommended ${garage} on Detlio, the car-care app I use. Customers near you can find your garage there and book a wash or a service.`,
    '',
    'Have a look and join here:',
    GARAGE_JOIN_URL,
    ...(name ? ['', `– ${name}`] : []),
  ].join('\n')
}

/** The wa.me link that opens a chat with them, the message typed in; null for a number WhatsApp can't open. */
export function bringGarageWhatsAppHref(phone: string, message: string): string | null {
  const number = whatsAppNumber(phone)
  return number ? whatsAppHref(number, message) : null
}

/** Ready to open WhatsApp: a garage name (2+ letters) and an Indian mobile. */
export function whatsAppReady(garageName: string, phone: string): boolean {
  return garageName.trim().length >= 2 && whatsAppNumber(phone) !== null
}

// ─── Words (both customer apps) ──────────────────────────────────────────────

/** "₹500": the credit, as the screens print it (bold where the mockup has it). */
export function referralAmountLabel(): string {
  return `₹${REFERRAL_CREDIT.perGarageRupees.toLocaleString('en-IN')}`
}

/**
 * The list's end card. `body` and `doneRule` below keep `{amount}` for the
 * screen to fill with the bold "₹500" (`fill`); `…Text` is the plain line.
 */
export function bringGarageCardWords(): { title: string; body: string; action: string } {
  return {
    title: t('Know a good garage? Bring it to Detlio'),
    body: t('Get {amount} when they join and you book them'),
    action: t('Recommend a garage'),
  }
}

export function bringGarageCardText(): string {
  return t('Get {amount} when they join and you book them', { amount: referralAmountLabel() })
}

/** The sheet's line under its title. */
export function recommendCreditLine(): string {
  return t('{amount} Detlio credit if they join and you book them.', { amount: referralAmountLabel() })
}

/** The Profile row. */
export function bringGarageRowLabel(): string {
  return t('Bring your garage · Get {amount}', { amount: referralAmountLabel() })
}

/** The done screen's ₹500 rule, in one line (`{amount}` left for the bold figure). */
export function recommendDoneRule(): string {
  return t('You get {amount} Detlio credit once they join and you finish a paid booking with them.')
}

export function recommendDoneRuleText(): string {
  return t('You get {amount} Detlio credit once they join and you finish a paid booking with them.', { amount: referralAmountLabel() })
}

export type RecommendChannel = 'detlio' | 'whatsapp'
