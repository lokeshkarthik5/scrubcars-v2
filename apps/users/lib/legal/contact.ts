/**
 * Contact & Grievances — the text of /contact.
 *
 * Carries the business identity the E-Commerce Rules (rule 4(2)) want shown
 * prominently, the Grievance Officer (rule 4(4), IT Rules 3(2), SPDI rule
 * 5(9)) and how complaints are handled.
 */
import type { LegalDoc } from './doc-format'
import {
  EMAIL_LINK,
  LINK,
  OFFICER_DESIGNATION,
  OFFICER_NAME,
  PHONE_LINK,
  PROPRIETOR,
  SUPPORT_HOURS,
  WHATSAPP_LINK,
} from './common'
import { BUSINESS, ESCALATION, GRIEVANCE_OFFICER, GRIEVANCE_TIMELINES as T } from './details'
import { LEGAL_PATHS } from './routes'

export const CONTACT: LegalDoc = {
  path: LEGAL_PATHS.contact,
  title: 'Contact us',
  description:
    'How to reach Detlio: phone, WhatsApp, email and address, our Grievance Officer, and how complaints are handled.',
  toc: false,
  intro: [
    {
      kind: 'p',
      text: 'For help with a booking, the quickest way is **Help with this booking** on the booking page: it reaches the garage or our team with your booking details filled in, and lets you raise a complaint about it.',
    },
  ],
  sections: [
    {
      id: 'support',
      heading: 'Customer support',
      blocks: [
        {
          kind: 'list',
          items: [
            `**Phone:** ${PHONE_LINK}`,
            `**WhatsApp:** ${WHATSAPP_LINK}`,
            `**Email:** ${EMAIL_LINK}`,
            `**Hours:** ${SUPPORT_HOURS}`,
            `**Website:** [${BUSINESS.website}](/)`,
          ],
        },
        {
          kind: 'note',
          text: '**Support hours** are a placeholder; Razorpay asks for a phone number "with business hours". A Gmail address is the support inbox for now.',
        },
      ],
    },
    {
      id: 'business',
      heading: 'Who we are',
      blocks: [
        {
          kind: 'list',
          items: [
            `**Brand:** ${BUSINESS.brand}`,
            `**Operated by:** ${BUSINESS.tradeName}, a sole proprietorship of ${PROPRIETOR}`,
            `**Address:** ${BUSINESS.address}`,
            '**Branches:** none',
          ],
        },
        {
          kind: 'p',
          text: 'Detlio connects you with independent partner garages, which do the work. After a booking, you can ask us in writing for the garage\'s full details and we will send them.',
        },
        {
          kind: 'note',
          text: '**Nodal contact.** E-Commerce Rules rule 4(1) also asks for a nodal person of contact (or alternate senior designated functionary) resident in India. It need not be displayed; it can be the Grievance Officer. Please confirm who. "Branches: none" — owner to confirm.',
        },
      ],
    },
    {
      id: 'grievance-officer',
      heading: 'Grievance Officer',
      blocks: [
        {
          kind: 'p',
          text: 'If you have a complaint about a booking, a garage, a payment or refund, content on Detlio, or how we handle your personal data, and our support team has not resolved it, write to our Grievance Officer:',
        },
        {
          kind: 'list',
          items: [
            `**Name:** ${OFFICER_NAME}`,
            `**Designation:** ${OFFICER_DESIGNATION}`,
            `**Email:** [${GRIEVANCE_OFFICER.email}](mailto:${GRIEVANCE_OFFICER.email})`,
            `**Phone:** ${PHONE_LINK}`,
            `**WhatsApp:** ${WHATSAPP_LINK}`,
            `**Post:** ${GRIEVANCE_OFFICER.address}`,
          ],
        },
        {
          kind: 'p',
          text: 'Please include your name, your registered mobile number, the booking reference or payment ID if there is one, and what you would like us to do.',
        },
      ],
    },
    {
      id: 'how-complaints-work',
      heading: 'How we handle complaints',
      blocks: [
        {
          kind: 'list',
          items: [
            `We acknowledge your complaint within **${T.acknowledge}** and give you a **complaint number** to track it, with a copy of the complaint as we recorded it.`,
            `We aim to resolve it within **${T.resolve}**, and in every case within **${T.outerLimit}** of receiving it.`,
            `If you report content on Detlio that breaks the rules in section 14 of our ${LINK.terms}, we act on it within **${T.contentRemoval}**; content that shows someone in an intimate or sexual way, or impersonates someone, within **${T.urgentContentRemoval}**.`,
            'We tell you what we decided and why.',
          ],
        },
        {
          kind: 'note',
          text: `**Which timelines.** E-Commerce Rules rule 4(5): acknowledge within 48 hours, redress within one month; from 1 Jan 2027, also give the complainant "a copy of the complaint as recorded". IT Rules 3(2) as amended from 20 Feb 2026 (from commentary, Gazette not read): acknowledge within 24 hours, resolve within 7 days (was 15); content complaints under rule 3(1)(b) within 36 hours (was 72); intimate-image/impersonation within 2 hours (was 24) — these bind only if Detlio relies on intermediary status (see the note on Terms section 14). The page publishes the stricter set, with one month as the outer limit (SPDI rule 5(9); DPDP rule 14(3) allows up to 90 days). They are one setting in details.ts (GRIEVANCE_TIMELINES). **Operational:** complaints raised in the app (from a booking's Help, or from this page when signed in) get a number like C-000123 at once, and the customer sees it, their words as recorded, and the team's answer under Profile → My complaints; admin's Complaints tab counts down the 24 hours and 7 days and flags what is overdue. Complaints that arrive by phone, WhatsApp or email still need entering by hand: there is no admin form for that yet, so until there is, ask the customer to raise it in the app, or log it in the booking's notes. The acknowledge and resolve numbers come from packages/core/src/complaints.ts (the clock's own), so this page and the clock cannot disagree. Keep them only at levels the team can actually meet.`,
        },
      ],
    },
    {
      id: 'escalation',
      heading: 'If you are still not satisfied',
      blocks: [
        {
          kind: 'list',
          items: [
            `**National Consumer Helpline:** call **${ESCALATION.consumerHelplinePhone}** or use [consumerhelpline.gov.in](${ESCALATION.consumerHelplineUrl}).`,
            `**Consumer Commission:** you can file a consumer complaint, including online through [e-Daakhil](${ESCALATION.eDaakhilUrl}).`,
            `**About content on Detlio:** you can appeal our Grievance Officer's decision to the Grievance Appellate Committee at [gac.gov.in](${ESCALATION.grievanceAppellateUrl}).`,
            `**About your personal data:** see "Complaining to the Data Protection Board" in our ${LINK.privacy}.`,
          ],
        },
        {
          kind: 'note',
          text: '**National Consumer Helpline convergence.** Joining the NCH convergence programme is "best effort" today (rule 4(7)) and mandatory from 1 Jan 2027 (2026 amendment). The GAC route applies only if Detlio is an intermediary.',
        },
      ],
    },
    {
      id: 'other-pages',
      heading: 'Our policies',
      blocks: [
        {
          kind: 'list',
          items: [LINK.terms, LINK.privacy, LINK.refunds, LINK.delivery],
        },
      ],
    },
  ],
}
