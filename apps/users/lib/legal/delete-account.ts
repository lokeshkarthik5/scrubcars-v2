/**
 * Delete your Detlio account — the text of /delete-account.
 *
 * The public page the app stores' listings link to ("where can people ask for
 * their account and data to be deleted?"). It describes what the apps already
 * do, so every statement here is read from, or checked against, the code:
 *
 *   - the words the Profile sheet shows come from @repo/core/account-deletion
 *     (ACCOUNT_DELETION_WORDS, ACCOUNT_DELETION_CONFIRM);
 *   - what is deleted and kept is apps/server/src/modules/account
 *     (account.repository `anonymise`) and apps/server/src/lib/account-deletion.ts;
 *   - what must be finished first is that file's `deletionBlockers` (one line
 *     below for each code; legal-docs.test.ts fails if a code is added without
 *     a line here);
 *   - garage staff and owners are components/account-actions.tsx in the
 *     partner app and apps/server/src/modules/garage-closure.
 *
 * `standing`: not part of the draft switch (see LegalDoc.standing), so it is
 * indexable and carries no "not yet in force" banner. The lawyer still reads
 * it in the Markdown copy (scripts/export-legal.ts).
 */
import { ACCOUNT_DELETION_CONFIRM, ACCOUNT_DELETION_WORDS } from '@repo/core/account-deletion'
import { type LegalDoc } from './doc-format'
import { CONTACT_LINE, LINK, RULES, WHO_WE_ARE } from './common'
import { GRIEVANCE_TIMELINES } from './details'
import { LEGAL_PATHS } from './routes'

/** The apps and sites this page covers, as the stores list them. */
export const CUSTOMER_APP_NAME = 'Detlio'
export const GARAGE_APP_NAME = 'Detlio for Garages'

/**
 * What stops a customer's deletion until it is done: one line for each code in
 * `AccountDeletionBlockerCode` (apps/server/src/lib/account-deletion.ts), in
 * the order the app lists them. The app says the same, with the booking
 * numbers and amounts filled in.
 */
export const DELETION_BLOCKER_LINES = [
  '**You own a garage on Detlio.** Garage owners close the garage first (see "Garage staff and owners" below).',
  '**A booking is still open:** waiting for the garage, accepted, or in progress. Cancel it, or wait until it is done.',
  `**A payment you started is still open.** Finish it, or wait ${RULES.checkoutMinutes} minutes for it to lapse.`,
  '**A Detlio Guarantee claim is still being looked at.** Withdraw it, or wait for the answer.',
  '**We still owe you a refund.** Once it reaches you, you can delete your account. If you need it sooner, contact us.',
  '**You have Detlio credit left.** Use it on a booking first, or contact us: deleting the account would lose it.',
  '**A gift you bought has not been redeemed.** Once it is, you can delete your account, or contact us to cancel and refund it.',
] as const

const words = ACCOUNT_DELETION_WORDS

export const DELETE_ACCOUNT: LegalDoc = {
  path: LEGAL_PATHS.deleteAccount,
  title: 'Delete your Detlio account',
  description:
    'How to delete your Detlio account and data, in the app or by contacting us: what is deleted, what we must keep and why, and what to finish first.',
  toc: false,
  standing: true,
  intro: [
    {
      kind: 'p',
      text: `This page is for anyone who wants their account and data deleted from **${CUSTOMER_APP_NAME}** (the customer app and detlio.com) or **${GARAGE_APP_NAME}** (the garage app and partner portal). ${WHO_WE_ARE}`,
    },
    {
      kind: 'callout',
      text: '**In short:** you can delete your account yourself, in the app or on the website, and it is done straight away. If you cannot open the app, contact us from your registered mobile number and ask us to delete it. We keep the money records the law makes us keep, without your name or number.',
    },
    {
      kind: 'note',
      text: `**Developer name.** The page names the business as ${WHO_WE_ARE.replace(/\*\*/g, '')} (details.ts). Google Play and the App Store show the developer name the listing was registered under; if that is a different name, this line must match the listing. Please confirm.`,
    },
  ],
  sections: [
    {
      id: 'in-the-app',
      heading: `Customers: delete it yourself in ${CUSTOMER_APP_NAME}`,
      blocks: [
        {
          kind: 'list',
          ordered: true,
          items: [
            `Open the ${CUSTOMER_APP_NAME} app, or detlio.com, and sign in with your mobile number.`,
            'Go to **Profile** and tap **Delete account**, at the bottom of the page.',
            'If something has to be finished first, the app lists it (see "Finish these first" below). Otherwise it shows what is deleted and what is kept.',
            `Type **${ACCOUNT_DELETION_CONFIRM}** and tap **Delete my account**.`,
          ],
        },
        {
          kind: 'p',
          text: `Your account is deleted straight away, and you are signed out on every device (a sign-in that was already open can keep working for up to 15 minutes before it ends). ${words.final}`,
        },
      ],
    },
    {
      id: 'what-is-deleted',
      heading: 'What is deleted, and what we keep',
      blocks: [
        {
          kind: 'p',
          text: '**Deleted now:**',
        },
        {
          kind: 'list',
          items: [
            ...words.deleted,
            'Your birthday, your service reminders and your invite code',
          ],
        },
        {
          kind: 'p',
          text: '**Kept, and why:**',
        },
        {
          kind: 'list',
          items: [
            'Your bookings, receipts, payments, refunds and gifts. These are money records, which the law makes us keep. They stay with no name or number (they show "Deleted account"), and the addresses on your bookings are removed.',
            'Your reviews, shown as "Former customer".',
            'Complaints you made, with the name and number you gave then. They are our record of how we answered you.',
            'The make and model of a saved car that one of your bookings used, with no number plate or colour.',
            'The before and after photos taken on your jobs, which stay with the booking.',
            'Usage statistics, which no longer point to you.',
          ],
        },
        {
          kind: 'p',
          text: `Records we must keep are kept for as long as the law requires. Details we sent to our service providers, such as Razorpay for payments, are also held under their own terms; our ${LINK.privacy} says who they are.`,
        },
        {
          kind: 'note',
          text: '**How long records are kept.** The page says "as long as the law requires" because no period has been decided (details.ts RETENTION is unset; the code deletes nothing on a timer). Please give the period and the law for booking, payment, refund and receipt records, for complaint records, and for job photos (which are not deleted with the account and may show a number plate). Also: (1) the in-app sheet now says complaints keep the name and number they were made with (bookings and money records are kept without them); (2) copies of the database in backups are not touched by deletion, and nobody has confirmed how long the host keeps them.',
        },
      ],
    },
    {
      id: 'finish-first',
      heading: 'Finish these first',
      blocks: [
        {
          kind: 'p',
          text: 'Your account can be deleted once nothing below is open. The app checks, and tells you exactly what to do.',
        },
        { kind: 'list', items: [...DELETION_BLOCKER_LINES] },
      ],
    },
    {
      id: 'without-the-app',
      heading: 'Without the app: ask us',
      blocks: [
        {
          kind: 'p',
          text: `If you cannot open the app, or no longer have it, contact us and ask us to delete your account and data. Please say **${CUSTOMER_APP_NAME}** or **${GARAGE_APP_NAME}** and write from, or call from, **the mobile number you signed up with**, so we know it is you. We may ask you to confirm the request from that number. To reach us: ${CONTACT_LINE}. Our ${LINK.contact} page has the address and the Grievance Officer.`,
        },
        {
          kind: 'p',
          text: `What is deleted and what is kept is the same as above, and if something has to be finished first we will tell you what. We reply within ${GRIEVANCE_TIMELINES.outerLimit} at most.`,
        },
        {
          kind: 'note',
          text: `**Requests made to us.** The "${GRIEVANCE_TIMELINES.outerLimit}" is the reply time already printed in the Privacy Policy for any right, not a promised time to finish. There is no admin tool for deleting an account on someone's behalf: the owner must decide who does it, how, and how fast, then this line can say so. Please confirm the line is acceptable meanwhile.`,
        },
      ],
    },
    {
      id: 'garages',
      heading: `Garage staff and owners (${GARAGE_APP_NAME})`,
      blocks: [
        {
          kind: 'p',
          text: '**Staff (operators, and admins who do not own the garage).** In the garage app or the partner portal, open **Your account** from Home (or **Settings**, then **Account**) and tap **Delete my account**. It deletes your login: your name, number and every garage you can open. Jobs you did stay on the garage\'s records, without your name. To stop working with one garage and keep your login, tap **Leave this garage** instead.',
        },
        {
          kind: 'p',
          text: '**Garage owners.** An owner cannot delete the login while the garage is open on Detlio. Ask us to close the garage: in the garage app, open **Settings**, then **Account**, tap **Close my garage**, say why, and tap **Send request**. We call you first and nothing changes until we do. Your bookings still to come are then cancelled and refunded, and the garage leaves Detlio. You can cancel the request until we act. We have not set a fixed time for the call.',
        },
        {
          kind: 'p',
          text: `Closing a garage takes it off Detlio and locks its team out; it does not delete the garage's records by itself. To have them deleted for good, say so when we call you; money records we must keep stay. Once the garage is closed, ask us to delete your login too (${LINK.contact}). The rules for money records and for what happens to your own details are the ones above.`,
        },
        {
          kind: 'note',
          text: '**Closing a garage.** The request is a phone call, with no promised time (garage-closure: "Detlio will call you"). Moving it to the Bin hides the garage and locks the team out; "Delete forever" is a separate admin action, only for a garage in the Bin, that keeps what cannot be deleted (live money records). The page says forever-deletion is done "when you ask"; the owner must confirm that is offered. After closing, an owner has no way in the app to delete their own login (the account route would allow it, the portal shows only Close my garage), so the page sends them to us. Please advise on all three.',
        },
      ],
    },
    {
      id: 'questions',
      heading: 'Questions',
      blocks: [
        {
          kind: 'p',
          text: `How we handle your data is in our ${LINK.privacy}. To ask anything about deleting your account, ${CONTACT_LINE}.`,
        },
      ],
    },
  ],
}
