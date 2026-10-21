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
 */
import {
  BOOKING_DAYS_AHEAD,
  CONFIRMED_CHANGE_CUTOFF_MINS,
  MAX_RESCHEDULES,
  MIN_NOTICE_MINS,
} from '@repo/core/booking-types'
import { COMPLAINT_ACKNOWLEDGE_HOURS, COMPLAINT_RESOLVE_DAYS } from '@repo/core/complaints'
import { DEFAULT_PICKUP_RADIUS_KM, MAX_CODE_ATTEMPTS, PICKUP_RESPONSIBILITY_LINE } from '@repo/core/pickup'
import { RECEIPT_NOT_TAX_INVOICE } from '@repo/core/receipts'
import { BANK_DAYS } from '@repo/core/refunds'
import { SUPPORT_PHONE_DISPLAY } from '@repo/core/support'
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
}

export interface HelpGroup {
  id: string
  title: string
  questions: HelpQuestion[]
}

const hours = (mins: number) => (mins === 60 ? '1 hour' : `${mins / 60} hours`)

const NOTICE_AT_GARAGE = hours(MIN_NOTICE_MINS.dropin)
const NOTICE_DOORSTEP = hours(MIN_NOTICE_MINS.doorstep)
const NOTICE_PICKUP = hours(MIN_NOTICE_MINS.pickup)
const CUTOFF = hours(CONFIRMED_CHANGE_CUTOFF_MINS)
const TWICE = MAX_RESCHEDULES === 2 ? 'twice' : `${MAX_RESCHEDULES} times`

const REFUND_POLICY: HelpLink = { label: 'Cancellation & Refund Policy', href: LEGAL_PATHS.refunds }
const MY_BOOKINGS: HelpLink = { label: 'My bookings', href: '/bookings' }
const CONTACT: HelpLink = { label: 'Contact us', href: LEGAL_PATHS.contact }

export const HELP_INTRO = {
  title: 'Help centre',
  body: 'Answers to the questions we hear most. For a booking, the quickest help is Help with this booking on the booking page.',
  searchLabel: 'Search help',
  searchPlaceholder: 'Search, e.g. refund, reschedule, pickup',
  noResults: 'No answers match that. Try another word, or ask us below.',
}

export const HELP_GROUPS: HelpGroup[] = [
  {
    id: 'booking',
    title: 'Booking',
    questions: [
      {
        id: 'how-to-book',
        q: 'How do I book?',
        a: [
          'Pick a garage and add the services you want. Choose how: At garage, Doorstep (the garage comes to you) or Pickup & drop, where the garage offers them. Then pick a time and pay online.',
          'Your booking shows as Requested until the garage accepts it.',
        ],
        links: [{ label: 'Find a garage', href: '/garages' }],
      },
      {
        id: 'how-soon',
        q: 'How soon, and how far ahead, can I book?',
        a: [
          `The app shows times for the next ${BOOKING_DAYS_AHEAD} days, today included. A booking must start at least ${NOTICE_AT_GARAGE} from now at the garage, and at least ${NOTICE_DOORSTEP} for Doorstep and Pickup & drop, so the garage has time to plan.`,
        ],
      },
      {
        id: 'requested',
        q: 'What if the garage does not accept my booking?',
        a: [
          'If the garage declines, the booking is cancelled and you get a full refund.',
          'If it has not accepted by the start time, the booking will not go ahead. It is not cancelled on its own: cancel it from the booking page for a full refund, or pick a new time.',
        ],
      },
      {
        id: 'cancel',
        q: 'Can I cancel or reschedule?',
        a: [
          `Yes, from the booking page. Before the garage accepts, any time. After it accepts, up to ${CUTOFF} before your slot. After that the app no longer offers it: use Help with this booking to talk to us.`,
          `There is no fee, and a cancellation within these times is refunded in full. You can reschedule up to ${TWICE}; your payment moves to the new time, which goes back to the garage to accept.`,
        ],
        links: [MY_BOOKINGS, REFUND_POLICY],
      },
      {
        id: 'garage-contact',
        q: "Can I call the garage before I book?",
        a: [
          "A garage's phone and WhatsApp are shown once you have booked it: on your booking page, under Help with this booking, along with directions.",
          `Before you book, our team can answer your questions on ${SUPPORT_PHONE_DISPLAY}.`,
        ],
      },
      {
        id: 'updates',
        q: 'How will I know what is happening with my booking?',
        a: [
          'Your booking page shows each step as it happens: accepted, started and completed, with the time of each. We do not send text messages about bookings, so check the app.',
        ],
        links: [MY_BOOKINGS],
      },
      {
        id: 'garage-closed',
        q: 'The garage is closed on my booking day. What now?',
        a: [
          'A holiday or a pause does not cancel a booking already made. If the garage is closed that day, move the booking to another day it is open, or cancel it for a full refund, within the usual times.',
          'If the garage has paused new bookings it cannot take a new time, so cancel it for a full refund or ask us.',
        ],
      },
      {
        id: 'no-show',
        q: 'What if I miss my booking?',
        a: [
          'If the garage accepted your booking and you do not turn up, the payment is not refunded and any promo code you used is not returned. The garage kept the slot for you.',
          'If you think this is wrong, use Help with this booking and we will look into it with the garage.',
        ],
        links: [REFUND_POLICY],
      },
      {
        id: 'review',
        q: 'How do I rate a garage?',
        a: [
          'Once the job is completed, rate it on the booking page, from 1 to 5 stars with a comment if you like.',
          'One review per booking. It is public, showing your first name and initial, never your phone number. You cannot edit or delete it yourself; ask us if you want it changed.',
        ],
      },
    ],
  },
  {
    id: 'payments',
    title: 'Payments & refunds',
    questions: [
      {
        id: 'pay',
        q: 'How do I pay?',
        a: [
          'You pay online when you book, through Razorpay: UPI, cards, net banking and the other methods Razorpay offers. Cash is not accepted. Detlio never sees your card number or UPI PIN.',
        ],
      },
      {
        id: 'receipt',
        q: 'Do I get a receipt?',
        a: [
          `Yes. Once your payment goes through, open the booking and tap View receipt. ${RECEIPT_NOT_TAX_INVOICE}`,
        ],
        links: [MY_BOOKINGS],
      },
      {
        id: 'refund-when',
        q: 'When do I get my refund?',
        a: [
          `You get a full refund when you cancel within the times above, when the garage declines or does not turn up, and when Detlio cancels it (other than at your request). While a refund is due, your booking page says our team will refund it to your original payment method within ${BANK_DAYS}.`,
          `Once it is sent, the booking says so, with the date. Your bank can take ${BANK_DAYS} after that to show it.`,
        ],
        links: [REFUND_POLICY],
      },
      {
        id: 'promo',
        q: 'Do I get my promo code back?',
        a: [
          'Yes, when you cancel within the usual times, or when the garage or Detlio cancels. When you reschedule, the code moves to the new time. If you do not turn up, it is not returned.',
        ],
      },
      {
        id: 'inspection',
        q: 'What is an inspection fee and a final bill?',
        a: [
          'Some work can only be priced once the garage has seen your car. For these you pay an inspection fee when you book. If the work costs more, the garage sends a final bill in the app showing what you have already paid, and you pay the rest from the booking page.',
          'If the work costs less than the fee, the difference is not refunded. If a final bill looks wrong, ask us before you pay it.',
        ],
      },
      {
        id: 'payment-failed',
        q: 'Money left my account but there is no booking',
        a: [
          'If your payment went through but the booking could not be made (the slot was just taken, say, or the checkout expired), the app tells you on the spot with your payment ID, and the payment is refunded in full. Keep the payment ID.',
          'If your bank shows a debit but the payment failed, your bank or Razorpay normally reverses it on its own. If it does not, send us the transaction details.',
        ],
        links: [CONTACT],
      },
    ],
  },
  {
    id: 'pickup',
    title: 'Pickup & drop',
    questions: [
      {
        id: 'pickup-how',
        q: 'How does pickup & drop work?',
        a: [
          'The garage collects your car from your address, works on it at the garage and brings it back. It is offered only by garages that collect.',
          `You need a saved address with a map pin inside the garage's pickup area: ${DEFAULT_PICKUP_RADIUS_KM} km from the garage unless it set its own distance. Checkout tells you if your address is outside it.`,
        ],
      },
      {
        id: 'pickup-cost',
        q: 'What does it cost?',
        a: ['Pickup & drop is free for now. You pay only for the services.'],
      },
      {
        id: 'pickup-notice',
        q: 'How much notice does the garage need?',
        a: [`At least ${NOTICE_PICKUP} before your slot.`],
      },
      {
        id: 'pickup-codes',
        q: 'What are the pickup and delivery codes?',
        a: [
          'Your booking page shows a 4-digit pickup code. Give it to the garage when they collect your car. Once the car has been collected, the page shows a delivery code: give that when your car is returned.',
          `Share each code only at the handover, and only with the garage. After ${MAX_CODE_ATTEMPTS} wrong tries a code locks, and our team confirms that step with you.`,
        ],
      },
      {
        id: 'pickup-responsible',
        q: 'Who is responsible for my car?',
        a: [`${PICKUP_RESPONSIBILITY_LINE} Every garage that collects agrees to this before it can offer pickup & drop.`],
      },
      {
        id: 'pickup-change',
        q: 'Can I cancel once my car has been collected?',
        a: [
          'Not in the app. Until the garage collects your car, the usual cancel and reschedule times apply. Once it has your car, use Help with this booking to reach the garage or our team.',
        ],
      },
    ],
  },
  {
    id: 'doorstep',
    title: 'Doorstep',
    questions: [
      {
        id: 'doorstep-how',
        q: 'How does Doorstep work?',
        a: [
          'The garage comes to the address and map pin you choose at checkout. Each garage sets the area it travels to, and we check your pin is inside it before you pay.',
          `Doorstep bookings need at least ${NOTICE_DOORSTEP}' notice.`,
        ],
      },
      {
        id: 'doorstep-ready',
        q: 'What do I need to do on the day?',
        a: [
          'Be at the address at the booked time, or have someone there with the car and its keys. Give the garage room and access to work.',
          'If you are running late, call or WhatsApp the garage from Help with this booking.',
        ],
      },
      {
        id: 'doorstep-outside',
        q: 'Why can I not book Doorstep at my address?',
        a: [
          'Your pin is outside the area that garage travels to. Try another garage, or book at the garage instead.',
        ],
        links: [{ label: 'Find a garage', href: '/garages' }],
      },
    ],
  },
  {
    id: 'account',
    title: 'Account & privacy',
    questions: [
      {
        id: 'sign-in',
        q: 'How do I sign in?',
        a: [
          'With your mobile number and a one-time code we send by text. There is no password. The code works for 3 minutes.',
        ],
      },
      {
        id: 'who-sees',
        q: 'Who sees my phone number?',
        a: [
          'The garage you book sees your name and mobile number, so it can reach you about that booking. Reviews show only your first name and initial. Garages never see your card or UPI details.',
        ],
        links: [{ label: 'Privacy Policy', href: LEGAL_PATHS.privacy }],
      },
      {
        id: 'cars-addresses',
        q: 'How do I change my cars and addresses?',
        a: ['In Profile you can add and remove cars and addresses, and choose which one is the default.'],
        links: [{ label: 'Profile', href: '/profile' }],
      },
      {
        id: 'delete-account',
        q: 'How do I delete my account?',
        a: [
          'Ask us by phone, WhatsApp or email. We delete what we no longer need and tell you what the law requires us to keep, such as payment records.',
        ],
        links: [CONTACT, { label: 'Privacy Policy', href: LEGAL_PATHS.privacy }],
      },
    ],
  },
  {
    id: 'complaints',
    title: 'Complaints',
    questions: [
      {
        id: 'raise',
        q: 'How do I make a complaint?',
        a: [
          'About a booking: open it, tap Help with this booking, then Raise a complaint. The booking is attached for you. About anything else: sign in and use Raise a complaint on the Contact page.',
          'You get a complaint number, like C-000123, straight away. Profile shows it under My complaints, with our answer.',
        ],
        links: [MY_BOOKINGS, CONTACT],
      },
      {
        id: 'how-long',
        q: 'How quickly will you answer?',
        a: [
          `We reply within ${COMPLAINT_ACKNOWLEDGE_HOURS} hours and aim to resolve it within ${COMPLAINT_RESOLVE_DAYS} days.`,
        ],
      },
      {
        id: 'not-right',
        q: 'The work was not done right, or my car was damaged',
        a: [
          'Tell us soon after the service, with photos if you can. We look at the photos the garage took of the job and take it up with the garage. Depending on what happened, the work is redone or you get a full or part refund.',
        ],
        links: [REFUND_POLICY],
      },
      {
        id: 'escalate',
        q: 'What if I am not happy with the answer?',
        a: [
          'Write to our Grievance Officer. The Contact page has their details, and other places you can go, such as the National Consumer Helpline.',
        ],
        links: [CONTACT],
      },
    ],
  },
]

/** The end of the page: still stuck, here is a person. */
export const HELP_STILL_NEED = {
  title: 'Still need help?',
  body: `Call or WhatsApp our team on ${SUPPORT_PHONE_DISPLAY}, or put it in writing with a complaint number.`,
  contact: CONTACT,
  complaint: { label: 'Raise a complaint', href: `${LEGAL_PATHS.contact}#raise-complaint` },
}
