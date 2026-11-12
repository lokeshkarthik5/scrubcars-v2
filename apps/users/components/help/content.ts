/**
 * Everything the Help centre (/help) says, in one place, so the owner can
 * change a question or an answer without touching the screen.
 *
 * ── Rules for the answers ─────────────────────────────────────────────────
 * Every answer says what the product does today, and nothing it does not.
 * Each one was checked against the code and the legal pages
 * (lib/legal/refunds.ts, terms.ts, service-delivery.ts, contact.ts):
 *
 *   - booking timings: packages/core/src/booking-types.ts (MIN_NOTICE_MINS,
 *     CONFIRMED_CHANGE_CUTOFF_MINS, MAX_RESCHEDULES, BOOKING_DAYS_AHEAD),
 *     which mirror the server's lib/slots.ts and bookings.service.ts;
 *   - refunds: apps/server/src/lib/refunds.ts and the Cancellation & Refund
 *     Policy; the wording of BANK_DAYS from packages/core/src/refunds.ts;
 *   - pickup & drop: packages/core/src/pickup.ts (the server's lib/pickup.ts);
 *   - complaints: packages/core/src/complaints.ts (24 hours / 7 days);
 *   - garage contact: shown only on the customer's own booking (owner
 *     decision, 17 Oct 2026; GET /bookings/:id), never before booking.
 *
 * Numbers come from those constants rather than being typed here, so a rule
 * changed in code changes its answer too. Change an answer and its rule
 * together; a question about something the product does not do yet is left
 * out rather than answered with a promise. Short sentences, no hype, no
 * "guaranteed" (the brand guideline, as in components/marketing/content.ts).
 *
 * ── Draft ─────────────────────────────────────────────────────────────────
 * HELP_DRAFT puts a small "Draft" note on the page, like LEGAL_DRAFT does on
 * the legal pages. Set it to false once the owner has signed the copy off.
 *
 * ── Tamil ─────────────────────────────────────────────────────────────────
 * The copy is written once, in helpCopy(t): the English constants below are
 * it with t leaving the English as it is (what the tests read), and the
 * screen builds it again with useT()'s t. Numbers go in as {placeholders},
 * so the Tamil (packages/core/src/i18n/ta/customer-web.ts) keeps them too.
 */
import {
  BOOKING_DAYS_AHEAD,
  CONFIRMED_CHANGE_CUTOFF_MINS,
  MAX_RESCHEDULES,
  MIN_NOTICE_MINS,
} from '@repo/core/booking-types'
import { COMPLAINT_ACKNOWLEDGE_HOURS, COMPLAINT_RESOLVE_DAYS } from '@repo/core/complaints'
import { GUARANTEE_RULES } from '@repo/core/guarantee'
import { DEFAULT_PICKUP_RADIUS_KM, MAX_CODE_ATTEMPTS, PICKUP_RESPONSIBILITY_LINE } from '@repo/core/pickup'
import { RECEIPT_NOT_TAX_INVOICE } from '@repo/core/receipts'
import { BANK_DAYS } from '@repo/core/refunds'
import { SUPPORT_PHONE_DISPLAY } from '@repo/core/support'
import { CONTACT_OPENS_HOURS_BEFORE, CONTACT_STAYS_HOURS_AFTER } from '@repo/core/contact-window'
import { interpolate, type Translate } from '@repo/core/i18n/translate'
import { LEGAL_PATHS } from '@/lib/legal/routes'

/** Waiting for the owner's sign-off: the page says "Draft" while true. */
export const HELP_DRAFT = true

export interface HelpLink {
  label: string
  href: string
}

export interface HelpQuestion {
  /** Stable, for the page's anchors (/help#cancel). */
  id: string
  q: string
  /** One or two short paragraphs. */
  a: string[]
  /** Where to go next, under the answer. */
  links?: HelpLink[]
  /**
   * Shown only while that feature is on at the API: the Detlio Guarantee's
   * answer (0051, GUARANTEE_ENABLED) says nothing while customers cannot use
   * it. Left out is always shown.
   */
  feature?: 'free_redo'
}

export interface HelpGroup {
  id: string
  title: string
  questions: HelpQuestion[]
}

export interface HelpCopy {
  intro: {
    title: string
    body: string
    searchLabel: string
    searchPlaceholder: string
    noResults: string
  }
  groups: HelpGroup[]
  stillNeed: {
    title: string
    body: string
    contact: HelpLink
    complaint: HelpLink
  }
}

/** Every word of the page, in the language t speaks. */
export function helpCopy(t: Translate): HelpCopy {
  const hours = (mins: number) =>
    mins === 60 ? t('1 hour') : t('{count} hours', { count: mins / 60 })

  const NOTICE_AT_GARAGE = hours(MIN_NOTICE_MINS.dropin)
  const NOTICE_DOORSTEP = hours(MIN_NOTICE_MINS.doorstep)
  const NOTICE_PICKUP = hours(MIN_NOTICE_MINS.pickup)
  const CUTOFF = hours(CONFIRMED_CHANGE_CUTOFF_MINS)
  const TWICE =
    MAX_RESCHEDULES === 2 ? t('twice') : t('{count} times', { count: MAX_RESCHEDULES })
  // As lib/legal/contact-window.ts says it, from the same numbers.
  const CONTACT_WINDOW_HOURS = t(
    'from {before} hours before your booking until {after} after the job is done',
    {
      before: CONTACT_OPENS_HOURS_BEFORE,
      after:
        CONTACT_STAYS_HOURS_AFTER === 1
          ? t('an hour')
          : t('{count} hours', { count: CONTACT_STAYS_HOURS_AFTER }),
    }
  )

  const REFUND_POLICY: HelpLink = { label: t('Cancellation & Refund Policy'), href: LEGAL_PATHS.refunds }
  const MY_BOOKINGS: HelpLink = { label: t('My bookings'), href: '/bookings' }
  const CONTACT: HelpLink = { label: t('Contact us'), href: LEGAL_PATHS.contact }

  const intro = {
    title: t('Help centre'),
    body: t('Answers to the questions we hear most. For a booking, the quickest help is Help with this booking on the booking page.'),
    searchLabel: t('Search help'),
    searchPlaceholder: t('Search, e.g. refund, reschedule, pickup'),
    noResults: t('No answers match that. Try another word, or ask us below.'),
  }

  const groups: HelpGroup[] = [
    {
      id: 'booking',
      title: t('Booking'),
      questions: [
        {
          id: 'how-to-book',
          q: t('How do I book?'),
          a: [
            t('Pick a garage and add the services you want. Choose how: At garage, Doorstep (the garage comes to you) or Pickup & drop, where the garage offers them. Then pick a time and pay online.'),
            t('Your booking shows as Requested until the garage accepts it.'),
          ],
          links: [{ label: t('Find a garage'), href: '/garages' }],
        },
        {
          id: 'how-soon',
          q: t('How soon, and how far ahead, can I book?'),
          a: [
            t('The app shows times for the next {days} days, today included. A booking must start at least {atGarage} from now at the garage, and at least {doorstep} for Doorstep and Pickup & drop, so the garage has time to plan.', { days: BOOKING_DAYS_AHEAD, atGarage: NOTICE_AT_GARAGE, doorstep: NOTICE_DOORSTEP }),
          ],
        },
        {
          id: 'requested',
          q: t('What if the garage does not accept my booking?'),
          a: [
            t('If the garage declines, the booking is cancelled and you get a full refund.'),
            t('If it has not accepted by the start time, the booking will not go ahead. It is not cancelled on its own: cancel it from the booking page for a full refund, or pick a new time.'),
          ],
        },
        {
          id: 'cancel',
          q: t('Can I cancel or reschedule?'),
          a: [
            t('Yes, from the booking page. Before the garage accepts, any time. After it accepts, up to {cutoff} before your slot. After that the app no longer offers it: use Help with this booking to talk to us.', { cutoff: CUTOFF }),
            t('There is no fee, and a cancellation within these times is refunded in full. You can reschedule up to {times}; your payment moves to the new time, which goes back to the garage to accept.', { times: TWICE }),
          ],
          links: [MY_BOOKINGS, REFUND_POLICY],
        },
        {
          id: 'garage-contact',
          q: t("Can I call the garage before I book?"),
          a: [
            t("A garage's address and directions are on your booking page once you have booked it. Its phone and WhatsApp are there too, under Help with this booking, {window}.", { window: CONTACT_WINDOW_HOURS }),
            t('Before you book, or outside those hours, our team can answer your questions and pass a message to the garage on {phone}.', { phone: SUPPORT_PHONE_DISPLAY }),
          ],
        },
        {
          id: 'updates',
          q: t('How will I know what is happening with my booking?'),
          a: [
            t('Your booking page shows each step as it happens: accepted, started and completed, with the time of each. We do not send text messages about bookings, so check the app.'),
          ],
          links: [MY_BOOKINGS],
        },
        {
          id: 'garage-closed',
          q: t('The garage is closed on my booking day. What now?'),
          a: [
            t('A holiday or a pause does not cancel a booking already made. If the garage is closed that day, move the booking to another day it is open, or cancel it for a full refund, within the usual times.'),
            t('If the garage has paused new bookings it cannot take a new time, so cancel it for a full refund or ask us.'),
          ],
        },
        {
          id: 'no-show',
          q: t('What if I miss my booking?'),
          a: [
            t('If the garage accepted your booking and you do not turn up, the payment is not refunded and any promo code you used is not returned. The garage kept the slot for you.'),
            t('If you think this is wrong, use Help with this booking and we will look into it with the garage.'),
          ],
          links: [REFUND_POLICY],
        },
        {
          id: 'review',
          q: t('How do I rate a garage?'),
          a: [
            t('Once the job is completed, rate it on the booking page, from 1 to 5 stars with a comment if you like.'),
            t('One review per booking. It is public, showing your first name and initial, never your phone number. You cannot edit or delete it yourself; ask us if you want it changed.'),
          ],
        },
      ],
    },
    {
      id: 'payments',
      title: t('Payments & refunds'),
      questions: [
        {
          id: 'pay',
          q: t('How do I pay?'),
          a: [
            t('You pay online when you book, through Razorpay: UPI, cards, net banking and the other methods Razorpay offers. Cash is not accepted. Detlio never sees your card number or UPI PIN.'),
          ],
        },
        {
          id: 'receipt',
          q: t('Do I get a receipt?'),
          a: [
            t('Yes. Once your payment goes through, open the booking and tap View receipt. {receiptNote}', { receiptNote: t(RECEIPT_NOT_TAX_INVOICE) }),
          ],
          links: [MY_BOOKINGS],
        },
        {
          id: 'refund-when',
          q: t('When do I get my refund?'),
          a: [
            t('You get a full refund when you cancel within the times above, when the garage declines or does not turn up, and when Detlio cancels it (other than at your request). While a refund is due, your booking page says our team will refund it to your original payment method within {bankDays}.', { bankDays: t(BANK_DAYS) }),
            t('Once it is sent, the booking says so, with the date. Your bank can take {bankDays} after that to show it.', { bankDays: t(BANK_DAYS) }),
          ],
          links: [REFUND_POLICY],
        },
        {
          id: 'promo',
          q: t('Do I get my promo code back?'),
          a: [
            t('Yes, when you cancel within the usual times, or when the garage or Detlio cancels. When you reschedule, the code moves to the new time. If you do not turn up, it is not returned.'),
          ],
        },
        {
          id: 'inspection',
          q: t('What is an inspection fee and a final bill?'),
          a: [
            t('Some work can only be priced once the garage has seen your car. For these you pay an inspection fee when you book. If the work costs more, the garage sends a final bill in the app showing what you have already paid, and you pay the rest from the booking page.'),
            t('If the work costs less than the fee, the difference is not refunded. If a final bill looks wrong, ask us before you pay it.'),
          ],
        },
        {
          id: 'payment-failed',
          q: t('Money left my account but there is no booking'),
          a: [
            t('If your payment went through but the booking could not be made (the slot was just taken, say, or the checkout expired), the app tells you on the spot with your payment ID, and the payment is refunded in full. Keep the payment ID.'),
            t('If your bank shows a debit but the payment failed, your bank or Razorpay normally reverses it on its own. If it does not, send us the transaction details.'),
          ],
          links: [CONTACT],
        },
      ],
    },
    {
      id: 'pickup',
      title: t('Pickup & drop'),
      questions: [
        {
          id: 'pickup-how',
          q: t('How does pickup & drop work?'),
          a: [
            t('The garage collects your car from your address, works on it at the garage and brings it back. It is offered only by garages that collect.'),
            t("You need a saved address with a map pin inside the garage's pickup area: {km} km from the garage unless it set its own distance. Checkout tells you if your address is outside it.", { km: DEFAULT_PICKUP_RADIUS_KM }),
          ],
        },
        {
          id: 'pickup-cost',
          q: t('What does it cost?'),
          a: [t('Pickup & drop is free for now. You pay only for the services.')],
        },
        {
          id: 'pickup-notice',
          q: t('How much notice does the garage need?'),
          a: [t('At least {notice} before your slot.', { notice: NOTICE_PICKUP })],
        },
        {
          id: 'pickup-codes',
          q: t('What are the pickup and delivery codes?'),
          a: [
            t('Your booking page shows a 4-digit pickup code. Give it to the garage when they collect your car. Once the car has been collected, the page shows a delivery code: give that when your car is returned.'),
            t('Share each code only at the handover, and only with the garage. After {tries} wrong tries a code locks, and our team confirms that step with you.', { tries: MAX_CODE_ATTEMPTS }),
          ],
        },
        {
          id: 'pickup-responsible',
          q: t('Who is responsible for my car?'),
          a: [t('{responsibility} Every garage that collects agrees to this before it can offer pickup & drop.', { responsibility: t(PICKUP_RESPONSIBILITY_LINE) })],
        },
        {
          id: 'pickup-change',
          q: t('Can I cancel once my car has been collected?'),
          a: [
            t('Not in the app. Until the garage collects your car, the usual cancel and reschedule times apply. Once it has your car, use Help with this booking to reach the garage or our team.'),
          ],
        },
      ],
    },
    {
      id: 'doorstep',
      title: t('Doorstep'),
      questions: [
        {
          id: 'doorstep-how',
          q: t('How does Doorstep work?'),
          a: [
            t('The garage comes to the address and map pin you choose at checkout. Each garage sets the area it travels to, and we check your pin is inside it before you pay.'),
            t("Doorstep bookings need at least {doorstep}' notice.", { doorstep: NOTICE_DOORSTEP }),
          ],
        },
        {
          id: 'doorstep-ready',
          q: t('What do I need to do on the day?'),
          a: [
            t('Be at the address at the booked time, or have someone there with the car and its keys. Give the garage room and access to work.'),
            t('If you are running late, call or WhatsApp the garage from Help with this booking.'),
          ],
        },
        {
          id: 'doorstep-outside',
          q: t('Why can I not book Doorstep at my address?'),
          a: [
            t('Your pin is outside the area that garage travels to. Try another garage, or book at the garage instead.'),
          ],
          links: [{ label: t('Find a garage'), href: '/garages' }],
        },
      ],
    },
    {
      id: 'account',
      title: t('Account & privacy'),
      questions: [
        {
          id: 'sign-in',
          q: t('How do I sign in?'),
          a: [
            t('With your mobile number and a one-time code we send by text. There is no password. The code works for 3 minutes.'),
          ],
        },
        {
          id: 'who-sees',
          q: t('Who sees my phone number?'),
          a: [
            t('The garage you book sees your name and mobile number, so it can reach you about that booking. Reviews show only your first name and initial. Garages never see your card or UPI details.'),
          ],
          links: [{ label: t('Privacy Policy'), href: LEGAL_PATHS.privacy }],
        },
        {
          id: 'cars-addresses',
          q: t('How do I change my cars and addresses?'),
          a: [
            t('In Profile you can add, edit and remove cars and addresses, and choose which one is the default. The pencil beside your name changes your name and email; your phone number is how you sign in, so it stays as it is.'),
          ],
          links: [{ label: t('Profile'), href: '/profile' }],
        },
        {
          id: 'delete-account',
          q: t('How do I delete my account?'),
          a: [
            t('In Profile, tap Delete account at the bottom. We delete your name, phone number, email, photo, saved cars’ number plates, addresses and devices, and sign you out everywhere. Your bookings, receipts and refunds stay, without your name or number, because the law says we keep money records; your reviews stay as “Former customer”.'),
            t('If something is still open (a booking to come, a refund we owe you, Detlio credit or a gift nobody has redeemed), the app says what to finish first. You can sign up again later with the same number, as a new account.'),
          ],
          links: [{ label: t('Profile'), href: '/profile' }, { label: t('Privacy Policy'), href: LEGAL_PATHS.privacy }],
        },
      ],
    },
    {
      id: 'complaints',
      title: t('Complaints'),
      questions: [
        {
          id: 'raise',
          q: t('How do I make a complaint?'),
          a: [
            t('About a booking: open it, tap Help with this booking, then Raise a complaint. The booking is attached for you. About anything else: sign in and use Raise a complaint on the Contact page.'),
            t('You get a complaint number, like C-000123, straight away. Profile shows it under My complaints, with our answer.'),
          ],
          links: [MY_BOOKINGS, CONTACT],
        },
        {
          id: 'how-long',
          q: t('How quickly will you answer?'),
          a: [
            t('We reply within {hours} hours and aim to resolve it within {days} days.', { hours: COMPLAINT_ACKNOWLEDGE_HOURS, days: COMPLAINT_RESOLVE_DAYS }),
          ],
        },
        {
          id: 'not-right',
          q: t('The work was not done right, or my car was damaged'),
          a: [
            t('Tell us soon after the service, with photos if you can. We look at the photos the garage took of the job and take it up with the garage. Depending on what happened, the work is redone or you get a full or part refund.'),
          ],
          links: [REFUND_POLICY],
        },
        {
          // Draft, like the whole page (HELP_DRAFT), and shown only while the
          // guarantee is on (0051). Numbers from @repo/core/guarantee, the
          // server's twin.
          id: 'free-redo',
          feature: 'free_redo',
          q: t('What is the Detlio Guarantee?'),
          a: [
            t('Not happy with a wash or detailing paid on Detlio? Within {hours} hours of completion, open the booking, tap Not happy?, pick what is wrong and take {photos} or more photos.', { hours: GUARANTEE_RULES.claimWindowHours, photos: GUARANTEE_RULES.minPhotos }),
            t("We compare them with the garage's before and after photos. The garage answers within {reviewHours} hours of its opening hours, or Detlio decides. Once approved, book a free redo at the same garage within {days} days. Coating and inspection jobs are not covered.", { reviewHours: GUARANTEE_RULES.garageReviewHours, days: GUARANTEE_RULES.redoWithinDays }),
          ],
          links: [MY_BOOKINGS],
        },
        {
          id: 'escalate',
          q: t('What if I am not happy with the answer?'),
          a: [
            t('Write to our Grievance Officer. The Contact page has their details, and other places you can go, such as the National Consumer Helpline.'),
          ],
          links: [CONTACT],
        },
      ],
    },
  ]

  // The end of the page: still stuck, here is a person.
  const stillNeed = {
    title: t('Still need help?'),
    body: t('Call or WhatsApp our team on {phone}, or put it in writing with a complaint number.', { phone: SUPPORT_PHONE_DISPLAY }),
    contact: CONTACT,
    complaint: { label: t('Raise a complaint'), href: `${LEGAL_PATHS.contact}#raise-complaint` },
  }

  return { intro, groups, stillNeed }
}

/** The copy in English, as written: what the tests read. */
const english: Translate = (text, vars) => interpolate(text, vars)
const EN = helpCopy(english)

export const HELP_INTRO = EN.intro
export const HELP_GROUPS = EN.groups
export const HELP_STILL_NEED = EN.stillNeed

/** The groups as shown now: a feature's questions only while it is on. */
export function helpGroupsFor(
  features: { guarantee: boolean },
  groups: HelpGroup[] = HELP_GROUPS
): HelpGroup[] {
  return groups.map((group) => ({
    ...group,
    questions: group.questions.filter((question) => question.feature !== 'free_redo' || features.guarantee),
  }))
}

