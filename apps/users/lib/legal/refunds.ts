/**
 * Cancellation & Refund Policy — the text of /refund-policy.
 *
 * Every case here is decided in code by apps/server/src/lib/refunds.ts (what
 * is owed), bookings.service.ts (who may cancel or move when) and
 * discounts.predicates.ts (whether a promo code comes back). Change the code
 * and this page together.
 */
import { type LegalDoc, tbc } from './doc-format'
import { CONTACT_LINE, LINK, RULES } from './common'
import { ESCALATION } from './details'
import { LEGAL_PATHS } from './routes'

const LATE_CANCEL = tbc('what is refunded when support cancels a confirmed booking less than 2 hours before the slot')

export const REFUNDS: LegalDoc = {
  path: LEGAL_PATHS.refunds,
  title: 'Cancellation & Refund Policy',
  description:
    'When you can cancel or reschedule a Detlio booking, what you get back in each case, and how and when refunds are paid.',
  toc: true,
  intro: [
    {
      kind: 'p',
      text: `This policy explains when you can cancel or move a booking, what you get back, and how refunds are paid. It is part of our ${LINK.terms}.`,
    },
    {
      kind: 'callout',
      text: `**In short:** cancel any time before the garage accepts, or up to ${RULES.changeCutoff} before your slot after it accepts, and you get **everything back**, with no fee. If you do not turn up for an accepted booking, the payment is **not refunded**.`,
    },
  ],
  sections: [
    {
      id: 'every-case',
      heading: '1. What you get back, case by case',
      blocks: [
        {
          kind: 'table',
          caption: 'Refunds for each kind of cancellation',
          head: ['What happens', 'When', 'What you get back', 'Promo code'],
          rows: [
            [
              'You cancel',
              'Before the garage accepts — any time, even after the start time if the garage never answered',
              'Full refund',
              'Returned',
            ],
            [
              'You cancel',
              `After the garage accepts, at least ${RULES.changeCutoff} before the slot`,
              'Full refund',
              'Returned',
            ],
            [
              'You want to cancel',
              `After the garage accepts, less than ${RULES.changeCutoff} before the slot`,
              `You can't cancel in the app. Contact us: ${LATE_CANCEL}`,
              tbc('promo code on a late cancellation'),
            ],
            [
              'You reschedule',
              `Same windows as cancelling; up to ${RULES.maxReschedules} times in all`,
              'Nothing charged or refunded: your payment moves to the new time',
              'Moves to the new booking',
            ],
            [
              'The garage declines (including a new time after a reschedule)',
              'Any time before it accepts',
              'Full refund',
              'Returned',
            ],
            [
              'The garage does not turn up, or cannot do the job',
              'At or after the slot',
              'Full refund',
              'Returned',
            ],
            [
              'Detlio cancels the booking (other than at your request)',
              'Any time before the job is completed',
              'Full refund',
              'Returned',
            ],
            [
              '**You do not turn up** for an accepted booking',
              'At the slot',
              '**No refund**',
              '**Not returned**',
            ],
            [
              'Your payment went through but no booking was made (for example the slot was just taken, or the checkout expired)',
              'At checkout',
              'Full refund',
              'Not used',
            ],
            [
              'A final-bill payment that was not needed (paid twice, the garage changed the bill while you paid, or the booking was cancelled while you paid)',
              'Any time',
              'That payment in full',
              '—',
            ],
            [
              'A paid final bill on a booking Detlio then cancels',
              'Before the job is completed',
              'The final-bill payment in full, as well as the booking payment',
              'Returned',
            ],
            [
              'The work on an inspection job costs less than the inspection fee',
              'After the inspection',
              'No refund of the difference',
              '—',
            ],
          ],
        },
        {
          kind: 'note',
          text: '**Late cancellation through support.** In the app a confirmed booking cannot be cancelled inside 2 hours. If the customer then asks support, ops can cancel it, and the code treats every ops cancellation of a paid booking as a full refund owed. The owner has not decided what applies (full refund, part, or treated like a no-show). It is a placeholder in the table. Whatever is decided, the "Detlio cancels" row and Terms section 6 must stay consistent: both now exclude cancellations made at the customer\'s request.',
        },
        {
          kind: 'note',
          text: '**Rule 4(8) and the no-show rule.** E-Commerce Rules rule 4(8): no cancellation charges "unless similar charges are also borne by the e-commerce entity, if they cancel the purchase order unilaterally". Inside 2 hours the customer cannot cancel, so not turning up costs 100% of the payment; a garage no-show or a Detlio cancellation only refunds the customer, with no matching charge to the garage or Detlio. This could be read as a one-sided cancellation charge, and it must also pass CPA s.2(46)(ii) (a penalty not "wholly disproportionate to the loss"). Options for the owner: keep it (the garage held the slot and is paid its share); add a credit to the customer when a garage no-shows; or cap the amount kept. Please decide before launch. The no-show rule is already shown at checkout and in the homepage FAQ.',
        },
        {
          kind: 'note',
          text: '**Detlio cancelling a job in progress.** The code refunds in full whenever ops cancels, including a job already in progress. The page says so. If the owner wants to keep part of the payment for work already done, that needs a rule here and in the product.',
        },
      ],
    },
    {
      id: 'cancelling',
      heading: '2. Cancelling or moving a booking yourself',
      blocks: [
        {
          kind: 'list',
          items: [
            'Open the booking in **My bookings** and choose Cancel or Reschedule.',
            '**Before the garage accepts** (the booking shows "Requested"), you can cancel or move it any time.',
            `**After the garage accepts**, you can cancel or move it up to ${RULES.changeCutoff} before the slot. After that, the app no longer offers it; use **Help with this booking** to talk to us.`,
            'There is no cancellation fee. A cancellation within these rules is refunded in full and any promo code is returned for you to use again.',
          ],
        },
      ],
    },
    {
      id: 'rescheduling',
      heading: '3. Rescheduling',
      blocks: [
        {
          kind: 'list',
          items: [
            `You can reschedule a booking up to ${RULES.maxReschedules} times in all.`,
            `The new time must meet the usual minimum notice (${RULES.noticeAtGarage} at the garage, ${RULES.noticeDoorstep} for doorstep) and be a time the garage has free.`,
            'Your payment and any promo code move to the new booking, so nothing is charged again. The services and prices stay as you booked them.',
            'The new booking goes back to **Requested** until the garage accepts the new time. If it declines, the booking is cancelled and you get a full refund.',
          ],
        },
      ],
    },
    {
      id: 'garage-side',
      heading: '4. If the garage declines, does not answer or does not turn up',
      blocks: [
        {
          kind: 'list',
          items: [
            'If the garage **declines** your booking, it is cancelled and you get a full refund. The booking page shows the garage\'s reason.',
            'If the garage **has not accepted by the start time**, the booking will not go ahead. It is not cancelled automatically: the booking page tells you, and you can cancel it for a full refund or pick a new time.',
            'If the garage **does not turn up** for a doorstep visit, or cannot serve you at the garage, tell us. Once we confirm it, you get a full refund.',
            'Closing for a day or pausing bookings does not cancel bookings already made, and the garage is asked to contact you. If it has closed that day, you can move the booking to another day it is open, or cancel for a full refund, within the rules above. If it has paused bookings, it cannot take a new time, so you can cancel for a full refund or contact us.',
          ],
        },
        {
          kind: 'note',
          text: '**Only Detlio can record a no-show.** In the product, only the Detlio team can mark a no-show (by either side), and only after the start time. The customer must contact support for a garage no-show; there is no button for it.',
        },
      ],
    },
    {
      id: 'no-show',
      heading: '5. If you do not turn up',
      blocks: [
        {
          kind: 'p',
          text: `If the garage accepted your booking and you do not turn up (as defined in the ${LINK.delivery}), **your payment is not refunded** and any promo code you used is not returned. The garage kept the slot for you and is paid for it.`,
        },
        {
          kind: 'p',
          text: 'If you think you were marked as a no-show by mistake, use **Help with this booking** and we will look into it with the garage.',
        },
        {
          kind: 'note',
          text: '**No way to correct a no-show yet.** Once the team marks a customer no-show, nothing in the product can change it: the server\'s refunds rule then never counts a refund as due, so a refund cannot be recorded and the customer\'s page keeps saying there is none. The page therefore promises only to look into it. Build an admin "correct no-show" action (customer → garage, with a note) before promising a refund here.',
        },
      ],
    },
    {
      id: 'payment-problems',
      heading: '6. Payment problems',
      blocks: [
        {
          kind: 'list',
          items: [
            '**Money taken but the payment failed.** If your bank or UPI app shows a debit but the payment failed, it is normally reversed by your bank or Razorpay automatically, within the time the Reserve Bank of India sets for failed transactions. If it is not, contact us with the transaction details.',
            `**Paid, but no booking was made.** Occasionally a payment goes through but the booking cannot be made — for example the slot was taken, the garage closed or paused, the promo code ran out, or the ${RULES.checkoutMinutes}-minute checkout expired. The app tells you so on the spot, with your payment ID, and the payment is refunded in full. Keep the payment ID: this payment has no booking in My bookings.`,
            '**Paid twice.** If you are charged twice for the same booking or final bill, tell us with both payment IDs and we will refund the extra payment in full.',
          ],
        },
        {
          kind: 'note',
          text: '**Duplicate checkout payments are not flagged.** A second payment against an already-used checkout is not alerted to the team; it would only be found by reconciling Razorpay. The text therefore asks the customer to tell us. To make the promise unconditional, have the `already` branch in booking-intents raise an ops alert and a refund-owed record when the payment id differs from the consumed one. (A second payment on a final bill is detected and refunded already.) Failed-checkout refunds are also shown to the customer only at that moment.',
        },
      ],
    },
    {
      id: 'inspection',
      heading: '7. Inspection jobs and final bills',
      blocks: [
        {
          kind: 'list',
          items: [
            'The inspection fee you pay when booking is refunded in full if the booking is cancelled under section 1 before the work starts.',
            'Once the inspection is done, the fee is not refunded just because the work costs less than the fee. If Detlio cancels the booking, the fee is refunded as set out in section 1.',
            'If the work costs more, you pay the balance on the garage\'s final bill in the app. A final-bill payment is refunded in full if the booking is then cancelled by Detlio, or if the payment was not needed (section 6).',
            'If you think a final bill is wrong, contact us before paying it.',
          ],
        },
      ],
    },
    {
      id: 'deficient',
      heading: '8. If the work is not right',
      blocks: [
        {
          kind: 'p',
          text: `If the service was deficient, not as described, or late against the booked time (other than for reasons outside anyone's control), tell us — ideally soon after the service, with photos. We will look at the job photos and take it up with the garage. Depending on what happened, the work is redone or you get a full or part refund. See section 11 of our ${LINK.terms}.`,
        },
      ],
    },
    {
      id: 'warranties',
      heading: '9. Warranties and guarantees',
      blocks: [
        {
          kind: 'p',
          text: 'Detlio does not give a warranty or guarantee of its own on any service. If a garage offers one (for example on a coating), it is the garage\'s promise, and the garage gives its terms before you book. You can claim it through **Help with this booking**, and we will take it up with the garage. Your rights for a deficient service (section 8) apply whether or not there is a warranty.',
        },
        {
          kind: 'note',
          text: '**Warranty terms (rule 5(3)(c)).** The E-Commerce Rules list "warranty and guarantee" among the information a marketplace must show. Confirm whether any garage offers warranties (coating and scratch-removal services usually come with one). If so, the product must show each warranty\'s terms on the service before purchase; today a service has no warranty field, only its description.',
        },
      ],
    },
    {
      id: 'how-refunds-work',
      heading: '10. How and when refunds are paid',
      blocks: [
        {
          kind: 'list',
          items: [
            `Refunds are made by the Detlio team. When a refund is due, your booking page says: "${RULES.refundOwedLine}"`,
            'Refunds normally go back through Razorpay to the method you paid with (the same card, UPI account or bank). If that is not possible, we refund you by UPI or bank transfer to an account in your name, after checking it with you.',
            `Once the refund is sent, the booking shows "Refunded ₹X on <date>". Depending on your bank, it can take up to ${RULES.refundDays} after that date to show in your account.`,
            'Your payment receipt in the app is updated to show the refund.',
          ],
        },
        {
          kind: 'note',
          text: `**Timeline wording.** The app says two things: while owed, the team will refund "within ${RULES.refundDays}"; once sent, it "can take ${RULES.refundDays} to show". Read together the customer could wait up to twice that. Internally a refund is late after 2 days. Recommendation: publish "we send your refund within 2 working days; your bank can then take ${RULES.refundDays} to show it", and change the app's "owed" line to match (a REFUND_SEND_DAYS constant in packages/core/src/refunds.ts, used by customerRefundLine and quoted here). **Not done:** the owner set the current wording ("Our team will refund your payment … within ${RULES.refundDays}", then "Refunded ₹X on <date>"), so the page quotes the app as it is until the owner confirms a send period. Whatever is published is the period Detlio is held to (CPA s.2(47)(viii)); refunds are manual, so ops must be able to meet it.`,
        },
      ],
    },
    {
      id: 'chargebacks',
      heading: '11. Disputes with your bank, and Razorpay',
      blocks: [
        {
          kind: 'p',
          text: `Payments are processed by Razorpay Software Private Limited. You can also raise a dispute or chargeback with your bank or card issuer. Please talk to us first: it is usually quicker, and a chargeback on a payment we are already refunding can delay your money. For a problem with the payment itself, Razorpay's grievance page is [razorpay.com/grievance-redressal](${ESCALATION.razorpayGrievanceUrl}).`,
        },
      ],
    },
    {
      id: 'ask',
      heading: '12. Asking about a refund',
      blocks: [
        {
          kind: 'p',
          text: `Use **Help with this booking** on the booking page, or ${CONTACT_LINE}. Give your booking reference, or the payment ID if there is no booking. If you are not happy with our answer, you can complain to our Grievance Officer (see ${LINK.contact}).`,
        },
      ],
    },
  ],
}
