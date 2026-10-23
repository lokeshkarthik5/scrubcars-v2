/**
 * Privacy Policy — the text of /privacy.
 *
 * Shaped as a notice under the Digital Personal Data Protection Act 2023 and
 * its Rules (in force for notices from 13 May 2027), while meeting what
 * applies today: the IT Act s.43A and the SPDI Rules 2011. Every statement
 * about what is collected and where it goes was checked against the code; if
 * the code changes what it collects or who receives it, change this page.
 * That includes the Meta Pixel (components/meta-pixel.tsx, mounted on every
 * page by app/layout.tsx) and the server switch HOME_OFFER_TARGETING, which
 * stays off until this text is in force (section 2, "Offers on Home").
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
      text: '**In short:** we collect what we need to book your car care — your mobile number, name, car, and for doorstep visits your address. The garage you book sees your name, number, car and (for doorstep) address. Payments are handled by Razorpay; we never see your card or UPI PIN. We do not sell your data or show ads in Detlio. Our website does load Meta\'s pixel, which tells Meta (Facebook and Instagram) which of our pages you open, so we can measure our ads there (section 4).',
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
              'Showing garages near you, distances and travel times, and how many garages are near you on Home. Kept on your device; only a rounded position (to about 100 metres) is sent to us, and Home does not save it. Once matched offers are switched on, also choosing offers from garages near you (see "Offers on Home" below).',
            ],
            [
              'Address searches and map pins you drop',
              'You',
              'Finding the address you mean (sent to our maps provider, see section 4)',
            ],
            [
              'Car details: make, model, size, and number plate if you add it',
              'You',
              'Pricing by car size; telling the garage which car to expect; the picture on Home, which is of a car the same size as yours, not your own car. Once matched offers are switched on, also offers for your size of car.',
            ],
            [
              'How often you want each car washed (if you choose)',
              'You',
              'The wash reminder on your Home screen, counted from your last completed wash. Without a choice we use 14 days, or 10 from October to December. Once matched offers are switched on, also offers for customers whose wash is due.',
            ],
            [
              'When you last opened Updates, and the offers, team notices and "Rate your wash" prompts you closed',
              'You, when you open Updates or tap × on Home',
              'Showing which updates are new, and keeping what you closed hidden on every device you use. Not used for anything else, including choosing offers, and deleted with your account (the mark that you closed "Rate your wash" is kept with that booking\'s record).',
            ],
            [
              'Bookings: garage, services, time, amounts, promo code, status and history',
              'You and the garage',
              'Running the booking, your booking history, receipts, support and our accounts; on Home, your last wash, next booking and Book again. Once matched offers are switched on, also whether, and with which garages, you have booked, to choose offers.',
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
              'The pages you open on detlio.com, with your IP address and details of your browser and device',
              'Your browser sends them to Meta, through Meta\'s pixel (section 4)',
              'Measuring and improving our ads on Facebook and Instagram. Sent straight to Meta; we do not receive or keep it.',
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
          text: '**Lawful basis.** DPDP Act s.7(a) lets data the customer volunteers for a booking be used for it without separate consent; other uses need consent (s.6). Please mark which basis covers each row (the table could gain a fourth column). Two uses are marketing and are not needed for a booking: matched offers on Home ("Offers on Home" below; off until this text is in force) and Meta\'s pixel (section 4; live on every page today). Neither has a consent step yet; see the notes on each.',
        },
        {
          kind: 'note',
          text: '**Saved garages (new, Oct 2026).** Customers can now save garages with a heart; the list of which garages someone saved is kept on their account, shown only to them, and deleted with the account (or with the garage). It is personal data not yet in the table above: please say whether it needs a row (it would sit under "You", used for "Showing you the garages you saved") or is covered by the account row. Complaints our team logs from a call or WhatsApp are linked to the account with that phone number, so the customer sees them in the app; that is the existing "What you tell our team" row.',
        },
        {
          kind: 'note',
          text: '**Profile photos and metadata.** Every photo upload (profile photos, garage logos and gallery, service photos, job photos, admin uploads) is now re-encoded in the browser before it leaves the device, which strips location and camera details (every current browser can for JPEG and PNG; Safari cannot write WebP, so a WebP picked in Safari, or a file the browser cannot read, still goes up as it is). Photos uploaded before that change were stored as-is and are not rewritten, so the profile-photo row\'s last sentence is still true of older photos. Suggested wording once the team is happy to drop it: "We remove location and camera details from the file before it is uploaded."',
        },
      ],
      subsections: [
        {
          id: 'home-offers',
          heading: 'Offers on Home',
          blocks: [
            {
              kind: 'p',
              text: 'The Home screen shows up to three offers: promo codes our team chooses to put there. Offers from a single garage are hidden until you save a car, because they are priced by car size. Other than that, some offers are for everyone, and others can be matched to you, so that the offers you see are ones that are relevant to you. Each matched offer is for one of these groups, customers who:',
            },
            {
              kind: 'list',
              items: [
                'have not paid for a booking on Detlio yet;',
                'have paid for a booking with that garage before (even if it was later refunded);',
                'are near the garage, within a distance our team sets for each offer (10 km unless the team picks another, at most 50 km). This is measured from the rounded location the app sends when you open Home: your device\'s location if you shared it, or the saved address or area you picked. Home does not save it;',
                'have a wash due within the next 2 days, or overdue, on one of their cars, worked out from their last completed wash on Detlio and the reminder interval chosen for that car;',
                'own a particular size of car (hatchback, sedan, or SUV / MUV).',
              ],
            },
            {
              kind: 'p',
              text: 'When offers are matched, offers our team has marked as equally important are shown in this order: offers from garages you have booked, then from garages near you, then Detlio\'s own offers, then other garages\' offers.',
            },
            {
              kind: 'p',
              text: 'This only decides which offers you see on Home. It does not change any price or who may use a code: anyone who has a code can use it at checkout, whether or not it was shown to them. Garages do not see who was shown their offer. When our team sets up an offer, it sees only an estimate of how many customers it would reach, counted from the same facts (with distance measured from saved addresses), never who they are. Nothing is sent to you by SMS, WhatsApp or email because of it.',
            },
            {
              kind: 'p',
              text: '**Matching starts only when this version of the policy takes effect.** Before then, offers are not matched to you: you see the offers shown to everyone, apart from garages\' offers until you save a car, and any you have closed or used up.',
            },
            {
              kind: 'p',
              text: 'If you would rather see only the offers shown to everyone, tell us (section 9). There is no setting for this in the app.',
            },
            {
              kind: 'note',
              text: '**Matched offers are off until this text is approved.** The server switch HOME_OFFER_TARGETING is off in production. While it is off, only offers for everyone are shown, none of the facts above are read to choose offers, and our team cannot save an offer for any other audience. It is to be turned on only in the release that publishes this version. Please confirm the lawful basis: choosing offers is not needed for a booking, so this is likely s.6 consent rather than s.7(a). If consent is needed, the product needs a consent step before the switch goes on.',
            },
            {
              kind: 'note',
              text: '**Opting out of matched offers.** There is no setting in the app, and today there is no per-customer switch in the system either: the team could honour "show me only general offers" only by switching matching off for everyone. Before matching is switched on, either build a per-customer opt-out (a flag that the Home read checks, ideally with a toggle in Profile, so that withdrawing is as easy as agreeing: DPDP Rules rule 3(c)(i)), or change the sentence above. Is an in-app opt-out needed?',
            },
          ],
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
            'We use one advertising tool, Meta\'s pixel (section 4), and no other advertising or analytics trackers. We do not show ads in Detlio.',
            'We do not sell your personal data, and we do not send you marketing messages by SMS, WhatsApp or email. Offers appear only inside the app, on Home (section 2).',
          ],
        },
        {
          kind: 'note',
          text: '**Detlio\'s own usage events (new; the public text above is unchanged and may need updating).** The customer app now records a few steps of each visit for the owner\'s booking funnel in admin Statistics: app opened, Home, the garage list (booking type and category chip), a search (its category and how many characters were typed, never the words), the map, a garage\'s page (its id and booking type), a service added (garage and category), checkout started (garage, booking type, number of services), a slot picked, an address picked (that one was, not which), Pay pressed (garage, booking type, number of services, a price band such as ₹1,000–1,999), a review or complaint submitted (that it was, never the stars or words), and Help or the Contact page opened. The API adds "booking paid" and "booking cancelled" itself (garage, booking type, price band, who cancelled), with no user id and never for test payments. Each event also has the page path with its query string and any ids removed, the device class (phone, tablet or desktop, from the window width, not the browser\'s identity), the app version, and a random visit id kept in the browser tab\'s sessionStorage, which ends when the tab is closed (no cookie, no localStorage). When the customer is signed in, the server attaches their account id from the session; it is set to null if the account is deleted. No name, number, address, car, IP address or user agent is stored; nothing goes to a third party (it is sent to api.detlio.com only); a browser with its DNT (Do-Not-Track) or Global Privacy Control setting on sends nothing. Kept 180 days, then deleted automatically. Returning-customer figures are worked out from bookings, not from these events. Please advise: (1) "no other advertising or analytics trackers" above and the storage table in section 5 (which would gain a "detlio:visit (session storage)" row) should probably mention this; (2) which lawful basis covers it (product improvement is not needed for a booking, so likely s.6 consent or a legitimate-use argument; the DNT/GPC opt-out exists today, a consent step does not); (3) whether attaching the signed-in account id is acceptable, or events should stay anonymous for everyone (one line in modules/analytics to change).',
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
                [
                  'OpenAI',
                  'Reading the forms, posters and price lists a garage gives us when it joins, to fill in its listing for our team to check (section 12)',
                  'Those documents, which can include the garage owner\'s name, phone number and address. Never customers\' data. Its servers are outside India.',
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
          id: 'meta',
          heading: 'Meta (Facebook and Instagram), for our ads',
          blocks: [
            {
              kind: 'p',
              text: 'Every page of detlio.com loads the **Meta Pixel**, a small piece of code from Meta Platforms, the company behind Facebook and Instagram. We use it to measure and improve our ads on Facebook and Instagram: for example, to count how many people open Detlio after seeing one of our ads.',
            },
            {
              kind: 'p',
              text: 'It runs on every page of the customer website, whether or not you are signed in: the homepage, sign-in, garage pages, checkout, your bookings and receipts, your profile, Home and these policies. It is not on the partner portal garages use. Each time you open a page, including moving from screen to screen inside the app, your browser sends Meta a "page view" with:',
            },
            {
              kind: 'list',
              items: [
                'the web address (URL) of the page. On checkout (and on sign-in, when you sign in on the way to checkout) it names the garage, the services you picked (by reference number) and whether the visit is at your door, and can include a promo code. On a booking\'s pages it carries the booking\'s reference number and can show that you have just paid for it, that you have a bill to pay, or the star rating you tapped on Home before writing a review;',
                'the address of the page you came from;',
                'your IP address, and details of your browser and device, such as its type and screen size;',
                'the IDs in Meta\'s cookies on detlio.com (_fbp, and _fbc if it is set; section 5), and, if you use Facebook or Instagram in the same browser and it allows it, Meta\'s own cookies, which let Meta link the visit to your Facebook or Instagram account.',
              ],
            },
            {
              kind: 'p',
              text: 'Apart from what the page address shows, we have not set it up to send your name, mobile number or car. Meta receives this directly from your browser, on its servers outside India, and also uses it for its own purposes under [Meta\'s Privacy Policy](https://www.facebook.com/privacy/policy/), for example to choose which ads to show you. Your browser can limit it (blocking third-party cookies, or its tracking protection), and your Facebook and Instagram settings let you see and disconnect activity that websites share with Meta.',
            },
            {
              kind: 'note',
              text: '**Consent before the pixel loads (DPDP).** The pixel loads on every page as soon as it opens, before any choice is offered (components/meta-pixel.tsx, mounted in app/layout.tsx), and nothing in the app turns it off. Measuring ads is not needed for a booking and is not a s.7 "legitimate use", so it likely needs s.6 consent: a banner or opt-in, with the pixel not loading until the customer agrees, and a way to withdraw that is as easy. Please advise. Also: is Meta a Data Processor for Detlio, or a separate Data Fiduciary for what it does with the data for itself? Meta\'s Business Tools Terms treat it partly as each. That decides whether Meta belongs in the provider table above (processors only) or, as drafted, here on its own.',
            },
            {
              kind: 'note',
              text: '**Which pages the pixel runs on.** Recommendation, not done in this release: load the pixel only on the public marketing pages (the homepage, garage pages, these policies), not on signed-in pages, whose web addresses carry booking ids (/bookings/<id>, /bookings/<id>/receipt) and checkout choices (/book/<garage>?service=…&mode=doorstep&code=…, also inside /login?next=… on the way there). Every page view sends that address to Meta, as soon as the page opens: the booking page removes ?celebrate=1 (just paid), ?then=pay (a final bill to pay) and ?rate=N (the star tapped on Home\'s "Rate your wash") with replaceState, but only after the first page view has gone. If the pixel stays on these pages, at least strip those parameters before it loads, or send Meta only the path without the query. The list above describes what is sent today. The code is unchanged here; if the pages change, the second paragraph above changes with them.',
            },
            {
              kind: 'note',
              text: '**Meta requires this notice.** Meta\'s Business Tools Terms require a site using the pixel to tell visitors, clearly and prominently, that Meta and others collect information through cookies and similar tools, how they can opt out, and to obtain consent where the law requires it. This section and the cookie rows in section 5 are that notice, now added. The opt-out offered is only the browser\'s and Meta\'s own settings until there is a consent choice.',
            },
            {
              kind: 'note',
              text: '**Settings in Meta\'s Events Manager.** "Apart from what the page address shows, we have not set it up to send your name, mobile number or car" holds only while "Automatic advanced matching" and automatic event tracking (button clicks and page metadata) are off for pixel 891710590692874. With automatic advanced matching on, the pixel itself reads form fields, such as the mobile number on the sign-in screen, and sends them hashed. Please have the team confirm both are off, or change the sentence. The code sends only page views.',
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
          text: 'Most of what we store is needed to make Detlio work. The exception is Meta\'s pixel (section 4), which sets advertising cookies on detlio.com.',
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
            ['_fbp (cookie, set by Meta\'s pixel)', 'Advertising: a random ID that lets Meta recognise this browser on each visit to detlio.com, to measure our ads', '90 days, renewed on each visit'],
            ['_fbc (cookie, set by Meta\'s pixel)', 'Advertising: set when you arrive from a link on Facebook or Instagram (including our ads) that carries Meta\'s click ID, to record which click brought you', '90 days'],
          ],
        },
        {
          kind: 'p',
          text: 'Razorpay\'s checkout may set its own cookies when you pay; see Razorpay\'s privacy policy. Meta\'s pixel loads code from Meta\'s servers, and your browser may also send Meta its own cookies if you use Facebook or Instagram in the same browser; see Meta\'s Privacy Policy. You can clear cookies and storage in your browser settings at any time, which signs you out of Detlio.',
        },
      ],
    },
    {
      id: 'where',
      heading: '6. Where your data is processed',
      blocks: [
        {
          kind: 'p',
          text: `Our main database is hosted in ${DATABASE}. Some of our providers (such as Vercel, Cloudflare, Sentry, Telegram and OpenAI) may process data on servers outside India, and Meta receives what its pixel sends (section 4) on its servers outside India. Indian law allows this except to countries the Government restricts, and we only use providers that protect data to a reasonable standard.`,
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
            ['What Meta\'s pixel sends (section 4)', 'We do not receive or keep it. Meta keeps it under its own policy; the _fbp cookie on your device lasts 90 days from your last visit.'],
            ['After you close your account', `${AFTER_CLOSURE}, except records we must keep by law, as above`],
          ],
        },
        {
          kind: 'note',
          text: '**Browser notifications (0044, not yet in the public text).** Customers and garage staff can turn on notifications in their browser (Profile → Notifications; the partner portal\'s Settings → Notifications). Each device that does gives us a push subscription: the browser\'s push service address (Google, Mozilla, Apple or Microsoft, depending on the browser) and two encryption keys. It identifies that browser, so treat it as personal data: we store it with the account (and, for staff, the garage) until the person turns notifications off or signs out, the push service tells us the browser dropped it, or the account or garage is deleted; we keep a short device label ("Chrome on Android"), never the full user agent. Notification text passes through that push service, encrypted end to end, and shows on the lock screen, so it carries only booking basics (garage name, service, time, an amount, a complaint number), never names, phone numbers, addresses, car numbers or pickup codes. Customers also have two switches stored on the account (booking updates, reminders), and we record which reminders were sent for each booking so none is sent twice. Purpose: telling people about their own bookings, which they switched on (consent, DPDP s.6, withdrawable in the same screen). Section 4 (service providers), section 5 (storage on the device: a service worker is installed when notifications are turned on) and section 7 should mention this before the feature is switched on in production.',
        },
        {
          kind: 'note',
          text: '**Almost nothing is deleted automatically.** The code purges almost nothing: sign-in code records (stored as a keyed hash, never the code) are deleted a day after the code expires, but session records are never deleted, nor are abandoned checkouts, job photos or the maps cache. Periods to decide: booking/payment records (for the CA: e.g. Income-tax Rules rule 6F for a proprietorship, and CGST Act s.36 once GST-registered); logs (DPDP Rules rule 8(3): at least one year; CERT-In Directions 2022: ICT logs for 180 days in India; IT Rules 3(1)(h): registration data for 180 days after an account is closed). Once decided, the product needs purge jobs to match (at least `refresh_tokens`; `otp_verifications` already goes after a day, so the retention row\'s "Records of codes sent … are kept for" period could say a day) before any period is published — the policy must not promise deletion that does not happen. Removing a car archives it rather than deleting it when a booking points at it, and addresses are copied onto doorstep bookings; the account row now says so.',
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
          text: '**Security facts to settle.** SPDI Rules rule 8 treats ISO 27001 or an approved code as "reasonable security practices"; Detlio has neither, so the list above describes measures only. Sign-in codes are stored as a keyed hash, not the code itself; photos are at public links (section 4). CERT-In requires reporting incidents within 6 hours — an operational process to set up.',
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
            '**Withdrawing consent.** You can stop sharing your location at any time in your browser\'s settings, limit Meta\'s pixel with your browser\'s cookie settings (section 4), ask us to show you only the offers shown to everyone (section 2), and withdraw consent for anything else by asking us. Withdrawing does not affect what was done before, but we may not be able to provide a booking without the data it needs.',
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
        {
          kind: 'p',
          text: 'When a garage joins, it may give us an onboarding form, a poster, a price list or photos of them. To set up its listing, these documents may be processed by our service providers, including an AI provider outside India (OpenAI, section 4), which reads them and fills in our form. Our team checks everything before the garage is added, and it is not shown to customers until our team has verified it. Detlio does not keep the files. Our AI provider may keep them for a short period under its own terms, and does not use them to train its models.',
        },
        {
          kind: 'note',
          text: '**Garage documents read by AI.** Owner decision: the admin panel\'s "Import from a form or poster" sends the photos or PDFs a garage gave us to OpenAI (the one AI provider Detlio uses, servers outside India) to fill in the new-garage form. They can carry the owner\'s name, mobile number and address, and anything else the garage wrote on them; the instructions tell the model not to copy ID or bank numbers, but the file itself is sent whole. The files are held in memory for that one request and never stored by Detlio, and the request asks OpenAI not to keep the response (`store: false`; otherwise it keeps it for at least 30 days). OpenAI\'s API terms say it does not train on API data by default but may still keep inputs for a limited period for abuse monitoring, which is why section 12 says "may keep them for a short period under its own terms" rather than that the files are not stored at all. Please confirm the current terms, that the wording of that sentence is right, and that a data-processing agreement is in place (DPDP s.8(2)). A Tally CSV is read by our own code and is not sent to OpenAI. Please advise: (1) whether s.7 covers this as part of the garage asking to join, or whether the Tally form and the onboarding call should ask for consent, and the line we should add to the Tally form and the poster brief; (2) whether a transfer outside India needs anything beyond this notice (s.16 restricts only countries the government lists).',
        },
        {
          kind: 'note',
          text: '**Garage owners\' ID and bank documents (not yet in the public text).** Owner decision, 17 Oct 2026: garages upload documents in the partner portal (Settings → Documents) so Detlio can check them and show customers a "Documents verified" badge. This is garage data, not customer data: a shop-front photo, the owner\'s ID (a PAN card, or an Aadhaar card with the first 8 digits covered, which the upload screen asks for), bank proof (a cancelled cheque or a passbook or statement page showing the payout account), the signed Detlio agreement, and optionally a GST certificate and a trade licence. How they are held: in a private Cloudflare R2 bucket of their own with no public access (R2 is a processor, see the provider table); a file is only ever opened through a link that lasts five minutes, made for the garage\'s owner login or a Detlio admin, and never stored or logged; photos are re-encoded in the browser to drop location data before upload. Customers see only whether the badge is earned, never the documents. Replacing a document deletes the old files. Moving a garage to the Bin keeps them; deleting it forever deletes them all, except the signed agreement when bookings with real money are kept for the accounts (the agreement is the contract they were taken under). Nothing here is sent to OpenAI or anyone else; the team\'s Telegram alert names only the garage and the kind of document. Please advise: (1) the lawful basis (s.7 as part of the garage\'s contract with Detlio, or consent) and whether the upload screen needs a notice line; (2) how long to keep them after a garage leaves; (3) whether collecting a masked Aadhaar is acceptable under the Aadhaar Act and its regulations, or whether we should ask for PAN only; (4) whether section 12 should now mention the documents, and in what words.',
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
