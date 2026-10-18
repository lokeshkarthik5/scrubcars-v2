/**
 * Service Delivery Policy — the text of /service-delivery.
 *
 * Razorpay asks every merchant for a "shipping" policy; for a service this is
 * how, where and when the service is delivered. Kept short.
 */
import { type LegalDoc, tbc } from './doc-format'
import { CONTACT_LINE, LINK, RULES } from './common'
import { LEGAL_PATHS } from './routes'
import { CONTACT_WINDOW_HOURS } from './contact-window'

const GRACE = tbc('grace period after the booked time')

export const SERVICE_DELIVERY: LegalDoc = {
  path: LEGAL_PATHS.delivery,
  title: 'Service Delivery Policy',
  description:
    'How Detlio bookings are delivered: at the garage or at your door, at the time you booked, and what happens if a slot cannot be kept.',
  toc: false,
  intro: [
    {
      kind: 'p',
      text: `Detlio books services, not goods, so nothing is shipped. The service is carried out on your car by the partner garage you book, at the time you book. This policy is part of our ${LINK.terms}.`,
    },
  ],
  sections: [
    {
      id: 'how',
      heading: 'Two ways to get it done',
      blocks: [
        {
          kind: 'list',
          items: [
            `**At garage:** you take your car to the garage at the booked time. The garage's address and map location are on your booking page, with directions, and its phone and WhatsApp ${CONTACT_WINDOW_HOURS}.`,
            '**Doorstep:** the garage comes to the address and map pin you chose at checkout. Each garage sets the area it travels to, and we check your pin is inside it before you pay.',
          ],
        },
        {
          kind: 'p',
          text: 'Pickup and drop is not available yet.',
        },
      ],
    },
    {
      id: 'where',
      heading: 'Where',
      blocks: [
        {
          kind: 'p',
          text: `Detlio is live in Chennai. You can book only the garages listed on Detlio, and doorstep visits only within each garage's own area. Service area: ${tbc('exact service area for the pilot')}.`,
        },
      ],
    },
    {
      id: 'when',
      heading: 'When',
      blocks: [
        {
          kind: 'list',
          items: [
            `You pick the date and time when you book. The app shows times up to ${RULES.daysAhead} days ahead.`,
            `A booking must start at least **${RULES.noticeAtGarage}** after you book at the garage, and at least **${RULES.noticeDoorstep}** after you book a doorstep visit, so the garage has time to plan.`,
            'The time shown for each service is the garage\'s estimate of how long it takes.',
          ],
        },
      ],
    },
    {
      id: 'confirmation',
      heading: 'Confirmation',
      blocks: [
        {
          kind: 'list',
          items: [
            'After you pay, your booking is **Requested**. The garage then accepts or declines it.',
            'The booking page in the app shows when it is accepted, and every later step: started and completed. We do not send texts about bookings, so check the app.',
            'If the garage declines, the booking is cancelled and you get a full refund.',
          ],
        },
      ],
    },
    {
      id: 'arriving',
      heading: 'On the day',
      blocks: [
        {
          kind: 'list',
          items: [
            'Be on time. If you are running late, call or WhatsApp the garage from the booking page.',
            'For a doorstep visit, be at the address (or have someone there with the car and keys), and give the garage reasonable access and room to work.',
            `**What counts as a no-show.** For an accepted booking, you are a no-show if, within ${GRACE} after the booked time, you have not brought the car to the garage (At garage), or neither you nor someone with the car and keys is at the address and pin you booked (Doorstep). A no-show is not refunded (see the ${LINK.refunds}). The garage is a no-show if it is not ready to take your car at the garage, or has not arrived at your address, within ${GRACE} after the booked time; you then get a full refund.`,
          ],
        },
        {
          kind: 'note',
          text: '**No-show definition.** The product has no grace period: the Detlio team marks a no-show by hand after the start time, on the garage\'s word or the customer\'s. Owner to decide the grace period (e.g. 15 or 30 minutes) and what evidence the team needs (a call log, a photo at the address). This is the only definition: the refund policy points here rather than defining it again. The same definition should be in the Partner Terms for garage no-shows.',
        },
      ],
    },
    {
      id: 'not-honoured',
      heading: 'If your slot cannot be kept',
      blocks: [
        {
          kind: 'list',
          items: [
            'If the garage has not accepted by the start time, the booking will not go ahead. You can cancel it for a full refund or pick a new time.',
            `If the garage cannot keep an accepted booking because it has closed that day, it is asked to contact you. You can move the booking to another day it is open, or cancel it for a full refund, within the rules in the ${LINK.refunds}. If it has paused bookings, it cannot take a new time, so you can cancel for a full refund or contact us, and we can cancel it for you with a full refund.`,
            'If the garage does not turn up, or is badly late, tell us. Once we confirm it, you get a full refund.',
            `For anything else, use **Help with this booking**, or ${CONTACT_LINE}.`,
          ],
        },
      ],
    },
    {
      id: 'inspection',
      heading: 'Inspection jobs',
      blocks: [
        {
          kind: 'p',
          text: `For work that can only be priced after the garage sees the car, you pay an inspection fee when you book. If the work costs more, the garage sends a final bill in the app and you pay the balance there. See section 7 of our ${LINK.terms}.`,
        },
      ],
    },
  ],
}
