/**
 * Privacy Policy — the text of /privacy.
 *
 * Shaped as a notice under the Digital Personal Data Protection Act 2023 and
 * its Rules (in force for notices from 13 May 2027), while meeting what
 * applies today: the IT Act s.43A and the SPDI Rules 2011. Every statement
 * about what is collected and where it goes was checked against the code; if
 * the code changes what it collects or who receives it, change this page.
 */
import { type LegalDoc, orTbc, tbc } from './doc-format'
import {
  CONTACT_LINE,
  EMAIL_LINK,
  LINK,
  OFFICER_DESIGNATION,
  OFFICER_NAME,
  PHONE_LINK,
  WHATSAPP_LINK,
  WHO_WE_ARE,
} from './common'
import {
  DATABASE_LOCATION,
  ESCALATION,
  GRIEVANCE_OFFICER,
  GRIEVANCE_TIMELINES,
  RETENTION,
} from './details'
import { LEGAL_PATHS } from './routes'

const BOOKING_RECORDS = orTbc(RETENTION.bookingRecords, 'how long booking and payment records are kept')
const JOB_PHOTOS = orTbc(RETENTION.jobPhotos, 'how long job photos are kept')
const LOGS = orTbc(RETENTION.logs, 'how long logs are kept')
const AFTER_CLOSURE = orTbc(RETENTION.afterClosure, 'how long account details are kept after closure')
const DATABASE = orTbc(DATABASE_LOCATION, 'where our database is hosted (believed to be Mumbai, India)')
const BOARD = ESCALATION.dataProtectionBoardUrl
  ? `[the Board's website](${ESCALATION.dataProtectionBoardUrl})`
  : `the Board's website (${tbc('Data Protection Board complaint link')})`

export const PRIVACY: LegalDoc = {
  path: LEGAL_PATHS.privacy,
  title: 'Privacy Policy',
  description:
    'What personal data Detlio collects when you book car care, why, who it is shared with, how long it is kept, and how to use your rights.',
  toc: true,
  intro: [
    {
      kind: 'p',
      text: 'This policy explains what personal data Detlio collects when you use detlio.com or the Detlio app, why we use it, who we share it with, how long we keep it, and the rights you have over it. It is written to be read on its own.',
    },
    {
      kind: 'callout',
      text: '**In short:** we collect what we need to book your car care — your mobile number, name, car, and for doorstep visits your address. The garage you book sees your name, number, car and (for doorstep) address. Payments are handled by Razorpay; we never see your card or UPI PIN. We do not sell your data, show you ads or track you across other sites.',
    },
  ],
  sections: [
    {
      id: 'who',
      heading: '1. Who is responsible for your data',
      blocks: [
        { kind: 'p', text: WHO_WE_ARE },
        {
          kind: 'p',
          text: `We decide why and how your personal data is used, so under the Digital Personal Data Protection Act, 2023 we are the "Data Fiduciary". For any question about your data, contact our Grievance Officer, ${OFFICER_NAME} (${OFFICER_DESIGNATION}), at [${GRIEVANCE_OFFICER.email}](mailto:${GRIEVANCE_OFFICER.email}) or ${PHONE_LINK}.`,
        },
      ],
    },
    {
      id: 'what-we-collect',
      heading: '2. What we collect and why',
      blocks: [
        {
          kind: 'table',
          caption: 'Personal data Detlio collects',
          head: ['Data', 'Where it comes from', 'What we use it for'],
          rows: [
            [
              'Mobile number',
              'You, when you sign in',
              'Your account and sign-in; shown to the garage you book so it can reach you; on your receipts (partly hidden, e.g. ******4321)',
            ],
            [
              'One-time sign-in codes',
              'We create them and send them by SMS',
              'Checking the number is yours. A code works for 3 minutes.',
            ],
            [
              'Name',
              'You, when you set up your profile',
              'Your account, bookings and receipts; shown to the garage you book; your first name and last initial on reviews you write',
            ],
            [
              'Profile photo (optional)',
              'You',
              'Shown on your profile. Not shared with garages. The file is stored as you upload it, so any location or camera details your phone saved in it are kept.',
            ],
            [
              'Saved addresses and map pins',
              'You: typed, picked on the map, or your device\'s precise location if you tap "Use my current location"',
              'Doorstep visits: checking the garage covers your address, and telling it where to come. The exact position is sent to our maps provider to find the address, and is stored with the address and on each doorstep booking.',
            ],
            [
              'Approximate location while browsing (if you allow it)',
              'Your device',
              'Showing garages near you, distances and travel times. Kept on your device; only a rounded position (to about 100 metres) is sent to us.',
            ],
            [
              'Address searches and map pins you drop',
              'You',
              'Finding the address you mean (sent to our maps provider, see section 4)',
            ],
            [
              'Car details: make, model, size, and number plate if you add it',
              'You',
              'Pricing by car size; telling the garage which car to expect',
            ],
            [
              'How often you want each car washed (if you choose)',
              'You',
              'The wash reminder on your Home screen. Without a choice we use 14 days, or 10 from October to December.',
            ],
            [
              'When you last opened Updates, and the offers, team notices and "Rate your wash" prompts you closed',
              'You, when you open Updates or tap × on Home',
              'Showing which updates are new, and keeping what you closed hidden on every device you use. Not used for anything else, and deleted with your account.',
            ],
            [
              'Bookings: garage, services, time, amounts, promo code, status and history',
              'You and the garage',
              'Running the booking, your booking history, receipts, support and our accounts',
            ],
            [
              'A reason you type when cancelling (optional)',
              'You',
              'Handling the change. Seen by the garage and our team.',
            ],
            [
              'Payment records: amounts, Razorpay order, payment and refund IDs, status',
              'Razorpay and us',
              'Confirming payment, refunds, receipts, and our accounts. No card or UPI details (section 3).',
            ],
            [
              'Final bills on inspection jobs',
              'The garage',
              'Charging the balance for extra work',
            ],
            [
              'Reviews (rating and comment)',
              'You',
              'Published on the garage\'s page, with your first name and last initial',
            ],
            [
              'Before and after photos of your car (may show the number plate)',
              'The garage',
              'A record of the job, shown to you, and evidence if there is a dispute',
            ],
            [
              'What you tell our team by phone or WhatsApp, and our notes of it',
              'You and our team',
              'Helping you and dealing with complaints. Our internal notes are not shown to garages.',
            ],
            [
              'Technical data: sign-in cookies, server logs (including the web addresses requested, which can contain address searches, map coordinates and, when our team looks up your booking, your name or mobile number, and your IP address), and error reports',
              'Your browser and our systems',
              'Keeping you signed in, security, preventing abuse, and fixing faults',
            ],
          ],
        },
        {
          kind: 'p',
          text: 'You do not have to give us any of this, but without your mobile number we cannot create an account, and without the booking details we cannot make a booking. Location is always optional: you can search or pick on the map instead.',
        },
        {
          kind: 'note',
          text: '**Offers on Home are not targeted.** The same offers go to every signed-in customer, except that garage offers are hidden until a car is saved (they are priced per car). Booking history and location are not used to choose them (the server switch HOME_OFFER_TARGETING is off). Turning targeting on needs new rows here saying so, a lawful basis (likely s.6 consent), and the lawyer\'s view first.',
        },
        {
          kind: 'note',
          text: '**Lawful basis.** DPDP Act s.7(a) lets data the customer volunteers for a booking be used for it without separate consent; other uses need consent (s.6). Please mark which basis covers each row (the table could gain a fourth column). Nothing is used for marketing today, so no marketing consent is collected.',
        },
        {
          kind: 'note',
          text: '**Profile photos keep their metadata.** Customer profile photos are uploaded as-is, so a photo taken on a phone can carry its GPS location in its metadata at a public link. Garage job photos are re-encoded, which strips it. The row now says so. Recommend re-encoding avatars in the browser before upload (reuse `resizeForUpload` from apps/vendors/lib/resize-image.ts, moved to a shared package) and then dropping that sentence.',
        },
      ],
    },
    {
      id: 'what-we-dont',
      heading: '3. What we do not collect or do',
      blocks: [
        {
          kind: 'list',
          items: [
            'We never see or store your card number, CVV, UPI PIN or net-banking password. You enter them on Razorpay\'s checkout, and Razorpay tells us only whether the payment went through and its reference IDs.',
            'There are no passwords: you sign in with a one-time code.',
            'We do not collect Aadhaar, PAN or other government ID numbers, health information or biometrics.',
            'We do not use advertising or analytics trackers, and we do not track you across other websites.',
            'We do not sell your personal data, and we do not send you marketing messages.',
          ],
        },
      ],
    },
    {
      id: 'sharing',
      heading: '4. Who we share it with',
      blocks: [],
      subsections: [
        {
          id: 'garages',
          heading: 'The garage you book',
          blocks: [
            {
              kind: 'p',
              text: 'As soon as you book and pay — while the booking is still "Requested", and also if it is later cancelled — the garage (its owner and staff using the Detlio partner portal) sees:',
            },
            {
              kind: 'list',
              items: [
                'your name and mobile number;',
                'for a doorstep visit, the address and map pin;',
                'your car\'s make, model, size and number plate (if added);',
                'the services, time, amount, payment method, promo code used, and the Razorpay payment ID;',
                'any reason you typed when cancelling;',
                'your review of the garage.',
              ],
            },
            {
              kind: 'p',
              text: 'The garage uses this to do the job and contact you about it, and must not use it for anything else. It does not see your other bookings, your saved addresses or your profile photo.',
            },
            {
              kind: 'note',
              text: '**Garages\' use of the data.** "Must not use it for anything else" needs a matching clause in the Partner Terms (garages as data processors or as separate fiduciaries — your call). There is no Partner Terms document yet.',
            },
          ],
        },
        {
          id: 'public',
          heading: 'The public',
          blocks: [
            {
              kind: 'list',
              items: [
                'Reviews are public, with your first name and last initial (for example "Arjun K."), the date, the services you booked, the rating and the comment. Never your phone number.',
                'Profile photos and job photos are stored at long, random web addresses that are not published anywhere. They are not password-protected: anyone who has the exact link can open the image.',
              ],
            },
            {
              kind: 'note',
              text: '**Photos at public links.** The review feed shows only first name and initial (#18, now merged). Garage and job photos, though, are served from public links: unguessable, but anyone holding a link can open the photo. Recommend moving to private storage with signed, expiring links before launch, which would let the second bullet go.',
            },
          ],
        },
        {
          id: 'providers',
          heading: 'Service providers who process data for us',
          blocks: [
            {
              kind: 'p',
              text: 'These companies process personal data on our behalf, only to provide their service to us:',
            },
            {
              kind: 'table',
              caption: 'Service providers',
              head: ['Provider', 'What for', 'What they receive'],
              rows: [
                [
                  'Razorpay Software Pvt Ltd',
                  'Payments and refunds',
                  'Your name and mobile number (filled in on checkout), the amount, booking reference IDs, and what you enter on the checkout',
                ],
                [
                  '2Factor (2factor.in)',
                  'Sending sign-in codes by SMS',
                  'Your mobile number and the code',
                ],
                [
                  'Ola Maps (olamaps.io)',
                  'Address search, turning a map pin into an address, and travel times',
                  'What you type in address search, the exact position of a pin you drop or of your device when you tap "Use my current location", and your rounded position for travel times',
                ],
                [
                  'OpenFreeMap',
                  'Map images',
                  'Your IP address and the map area you are viewing (your browser loads the map images directly)',
                ],
                [
                  'Vercel',
                  'Hosting the website and our servers',
                  'Everything sent to or from Detlio, and server logs including IP addresses',
                ],
                [
                  'Supabase',
                  'Our database',
                  'All the account and booking data in section 2',
                ],
                [
                  'Cloudflare (R2 storage)',
                  'Storing photos',
                  'Profile photos and job photos',
                ],
                [
                  'Sentry',
                  'Error monitoring',
                  'Details of errors in the app. We switch off IP addresses, cookies, request contents and user details, and remove phone numbers and codes, but an error message can still contain other text.',
                ],
                [
                  'Telegram',
                  'A private team channel where our team gets booking alerts',
                  'The booking reference, your **first name only**, the services, time and amount, the garage\'s name and phone, payment and refund IDs, and any reason you typed (shortened, with numbers, emails and links removed). Never your phone number or address; if a sign-in SMS fails, only the last 4 digits of the number.',
                ],
                [
                  'UptimeRobot',
                  'Checking the site is up',
                  'No personal data',
                ],
              ],
            },
            {
              kind: 'note',
              text: '**Confirm the provider list against production.** Found in code; not verified live: whether the Sentry DSNs are set, whether UptimeRobot is live, whether the map style URL overrides OpenFreeMap, and the Supabase project. The Sentry row says IP addresses are switched off: the SDK does not send them, but also turn on the project setting that stops Sentry storing the sender\'s IP, or soften the row. Please also confirm each provider\'s data-processing terms are in place (DPDP s.8(2) needs a valid contract with each processor).',
            },
          ],
        },
        {
          id: 'team',
          heading: 'Our team',
          blocks: [
            {
              kind: 'p',
              text: 'Members of the Detlio team can see bookings and customer details in our internal tools, to run bookings, refunds and support. Access is limited to the team.',
            },
          ],
        },
        {
          id: 'calls',
          heading: 'Calls and WhatsApp',
          blocks: [
            {
              kind: 'p',
              text: 'When you tap Call or WhatsApp in the app, the conversation happens through your phone or WhatsApp, not through Detlio. WhatsApp buttons start a message with your booking reference (or payment ID) filled in, which you can edit before sending.',
            },
          ],
        },
        {
          id: 'legal',
          heading: 'When the law requires it',
          blocks: [
            {
              kind: 'p',
              text: 'We share personal data with government agencies, courts or the police when the law requires it, and where needed to protect people\'s safety, prevent fraud, or defend legal claims. If the Detlio business is ever transferred to someone else, your data would go with it, under this policy, and we would tell you first.',
            },
          ],
        },
      ],
    },
    {
      id: 'storage',
      heading: '5. Cookies and storage on your device',
      blocks: [
        {
          kind: 'p',
          text: 'We use only what is needed to make Detlio work. There are no advertising or analytics cookies.',
        },
        {
          kind: 'table',
          caption: 'Cookies and browser storage',
          head: ['Name', 'What it is for', 'How long'],
          rows: [
            ['refresh_token (cookie)', 'Keeps you signed in. A random value; we store only a scrambled (hashed) copy.', '30 days, renewed while you use Detlio, or until you log out'],
            ['access_token (cookie)', 'Proves you are signed in to our servers. Contains your account ID, not your name or number.', '15 minutes'],
            ['auth_phone and related items (session storage)', 'Remember the number and timers between the sign-in and code screens', 'Until you close the tab'],
            ['detlio:signed-in (local storage)', 'Remembers that this browser is signed in, to skip the homepage', 'Until you log out'],
            ['detlio-location (local storage)', 'Your last location and place name, if you shared it, so the app can show nearby garages', 'Until you clear it in your browser'],
            ['detlio-pending-checkout (local storage)', 'The offer code and car you picked on Home, so checkout can apply the code', 'Cleared when you book, remove the code or log out; ignored after a day, or once the offer ends'],
            ['detlio:tip-hidden-on (local storage)', 'The day you hid the car care tip on Home', 'Until you clear it in your browser; the tip comes back the next day'],
          ],
        },
        {
          kind: 'p',
          text: 'Razorpay\'s checkout may set its own cookies when you pay; see Razorpay\'s privacy policy. You can clear cookies and storage in your browser settings at any time, which signs you out.',
        },
      ],
    },
    {
      id: 'where',
      heading: '6. Where your data is processed',
      blocks: [
        {
          kind: 'p',
          text: `Our main database is hosted in ${DATABASE}. Some of our providers (such as Vercel, Cloudflare, Sentry and Telegram) may process data on servers outside India. Indian law allows this except to countries the Government restricts, and we only use providers that protect data to a reasonable standard.`,
        },
        {
          kind: 'note',
          text: '**Locations unconfirmed.** "Database in India" rests only on a planning document (Supabase ap-south-1, Mumbai); confirm. Vercel function and app regions, Cloudflare R2 bucket location, Sentry data region (US/EU) and whether Ola Maps, 2Factor and Razorpay keep data only in India are not in the code. Confirm before publishing; the sentence names only what is certain.',
        },
      ],
    },
    {
      id: 'retention',
      heading: '7. How long we keep it',
      blocks: [
        {
          kind: 'table',
          caption: 'How long data is kept',
          head: ['Data', 'How long'],
          rows: [
            ['Your account (number, name, photo, cars, saved addresses)', 'While your account is open. You can remove saved addresses, cars and your photo in Profile; a car or address already used for a booking stays on that booking\'s record.'],
            ['Bookings, payments, refunds and receipts', `${BOOKING_RECORDS} after the booking, because tax and accounting law requires these records`],
            ['Job photos', JOB_PHOTOS],
            ['Reviews', 'Shown while the garage is listed, unless removed under our Terms or at your request; kept with the booking record after that'],
            ['Sign-in codes and session records', `Codes stop working after 3 minutes. Records of codes sent and of sign-in sessions are kept for ${LOGS}`],
            ['Server logs and error reports', LOGS],
            ['After you close your account', `${AFTER_CLOSURE}, except records we must keep by law, as above`],
          ],
        },
        {
          kind: 'note',
          text: '**Nothing is deleted automatically today.** The code purges nothing on a schedule: sign-in code records (stored in plain text, not hashed) and session records are never deleted, nor are abandoned checkouts, job photos or the maps cache. Periods to decide: booking/payment records (for the CA: e.g. Income-tax Rules rule 6F for a proprietorship, and CGST Act s.36 once GST-registered); logs (DPDP Rules rule 8(3): at least one year; CERT-In Directions 2022: ICT logs for 180 days in India; IT Rules 3(1)(h): registration data for 180 days after an account is closed). Once decided, the product needs purge jobs to match (at least `otp_verifications` and `refresh_tokens`) before any period is published — the policy must not promise deletion that does not happen. Removing a car archives it rather than deleting it when a booking points at it, and addresses are copied onto doorstep bookings; the account row now says so.',
        },
      ],
    },
    {
      id: 'security',
      heading: '8. How we protect it',
      blocks: [
        {
          kind: 'list',
          items: [
            'All traffic to and from Detlio is encrypted (HTTPS).',
            'Sign-in sessions are stored only in hashed form, and sign-in cookies cannot be read by scripts on the page.',
            'Only the Detlio team can use our internal tools, and garages see only their own bookings.',
            'Payment details stay with Razorpay.',
            'We keep personal data out of alerts and error reports where we can (see section 4).',
          ],
        },
        {
          kind: 'p',
          text: `If a breach of security affects your personal data, we will tell you without delay, by WhatsApp or a call to your registered mobile number, with what happened, when, what it may mean for you, what we are doing about it and what you can do, and who to contact. We will also report it to the Data Protection Board and CERT-In as the law requires.`,
        },
        {
          kind: 'note',
          text: '**No notification channel yet.** Breach notices (DPDP Rules rule 7) and notice of changes (section 13) need a way to reach users. The product sends SMS only for login codes (2Factor OTP template) and has no in-app notice; the text promises only WhatsApp or a call to the registered number, which the team can do by hand. Set up an SMS to the registered number or an in-app banner if that will not scale. Withdrawing consent must be as easy as giving it (rule 3(c)(i)); today it is "ask us" — consider a self-serve withdraw / close-account entry in Profile.',
        },
        {
          kind: 'note',
          text: '**Security facts to settle.** SPDI Rules rule 8 treats ISO 27001 or an approved code as "reasonable security practices"; Detlio has neither, so the list above describes measures only. Sign-in codes are stored in plain text (recommend hashing), and photos are at public links (section 4). CERT-In requires reporting incidents within 6 hours — an operational process to set up.',
        },
      ],
    },
    {
      id: 'rights',
      heading: '9. Your rights and how to use them',
      blocks: [
        {
          kind: 'list',
          items: [
            '**Access.** Ask for a summary of the personal data we hold about you, what we do with it, and who we have shared it with.',
            '**Correction and updating.** You can change your cars, saved addresses and profile photo in the app (Profile). For your name or anything else, ask us.',
            '**Erasure and closing your account.** Ask us to delete your data or close your account. We will delete what we no longer need, except records the law requires us to keep (section 7), and tell you what we kept and why.',
            '**Withdrawing consent.** You can stop sharing your location at any time in your browser\'s settings, and withdraw consent for anything else by asking us. Withdrawing does not affect what was done before, but we may not be able to provide a booking without the data it needs.',
            '**Grievance.** Complain to our Grievance Officer about how we handle your data (section 14).',
            '**Nominating someone.** You can name a person to use these rights for you if you die or are unable to.',
          ],
        },
        {
          kind: 'p',
          text: `**How:** email ${EMAIL_LINK}, call ${PHONE_LINK} or message us on ${WHATSAPP_LINK} from your registered mobile number, saying which right you want to use. We may ask you to confirm the request from that number so we know it is you. We reply within ${GRIEVANCE_TIMELINES.outerLimit} at most.`,
        },
        {
          kind: 'note',
          text: '**No in-app deletion.** The API has an account-delete endpoint but the app has no button for it, and it should not be used as-is: it hard-deletes payment and refund records, may fail for anyone with bookings, leaves photos in storage, and for a garage owner would delete the garage and other customers\' bookings. Deletion is therefore offered on request only, handled by the team. DPDP rule 14 needs the "means" for requests published (done above); a one-month reply also meets SPDI rule 5(9).',
        },
      ],
    },
    {
      id: 'board',
      heading: '10. Complaining to the Data Protection Board',
      blocks: [
        {
          kind: 'p',
          text: `If you are not satisfied with how we have handled your grievance, you can complain to the Data Protection Board of India, through ${BOARD}. The law asks you to raise it with us first.`,
        },
        {
          kind: 'note',
          text: '**Timing.** The Board exists since 13 Nov 2025, but the Act\'s rights and complaint provisions start 13 May 2027 (MeitY consulted on bringing this forward to 13 Nov 2026; no notification found as of Aug 2026 — re-check). The complaint link is a placeholder until verified.',
        },
      ],
    },
    {
      id: 'children',
      heading: '11. Children',
      blocks: [
        {
          kind: 'p',
          text: 'Detlio is only for people aged 18 or over, and we do not knowingly collect data about anyone younger. If you believe someone under 18 has an account, tell us and we will close it and delete their data.',
        },
      ],
    },
    {
      id: 'garage-staff',
      heading: '12. If you work at a partner garage',
      blocks: [
        {
          kind: 'p',
          text: `Garage owners and staff sign in to the Detlio partner portal with their mobile number in the same way. We keep their name and number, their role at the garage, which bookings they accepted or completed, the photos and bills they add, and a log of when our team accesses a garage's portal to help it. A garage's business details (its name, area, map location, photos, opening hours and rating) are shown publicly on Detlio, and its address, phone and WhatsApp are shown to customers who book it. The rest of this policy, including your rights, applies to you too, and your garage's agreement with Detlio covers anything specific to garages.`,
        },
      ],
    },
    {
      id: 'changes',
      heading: '13. Changes to this policy',
      blocks: [
        {
          kind: 'p',
          text: 'We will update this policy when what we collect, or how we use it, changes. The date at the top shows the last change. If a change matters to how your data is used, we will tell you before it applies, by WhatsApp or a call to your registered mobile number, and, where the law needs it, ask for your consent again.',
        },
        {
          kind: 'note',
          text: '**Notice of changes.** Same gap as the breach notice: see the "No notification channel yet" note in section 8.',
        },
      ],
    },
    {
      id: 'contact',
      heading: '14. Contact and Grievance Officer',
      blocks: [
        {
          kind: 'list',
          items: [
            `**Grievance Officer:** ${OFFICER_NAME}, ${OFFICER_DESIGNATION}`,
            `**Email:** [${GRIEVANCE_OFFICER.email}](mailto:${GRIEVANCE_OFFICER.email})`,
            `**Phone:** ${PHONE_LINK}`,
            `**WhatsApp:** ${WHATSAPP_LINK}`,
            `**Post:** ${GRIEVANCE_OFFICER.address}`,
          ],
        },
        {
          kind: 'p',
          text: `For anything else, ${CONTACT_LINE}. How complaints are handled is on our ${LINK.contact} page, and the rules for bookings, reviews and job photos are in our ${LINK.terms}.`,
        },
      ],
    },
  ],
}
