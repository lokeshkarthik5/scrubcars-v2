/**
 * Terms of Use for customers — the text of /terms.
 *
 * Plain data: edit the strings. Inline markup and placeholders are explained
 * in packages/core/src/legal-doc.ts; business details come from details.ts.
 * Every booking rule here must match what the code enforces — the figures are
 * read from it (common.ts RULES) wherever they can be.
 */
import { type LegalDoc, tbc } from './doc-format'
import {
  CONTACT_LINE,
  DISPUTE_WINDOW,
  LINK,
  RULES,
  WHO_WE_ARE,
} from './common'
import { BUSINESS, GOVERNING_COURTS } from './details'
import { LEGAL_PATHS } from './routes'
import { GIFTS_LAWYER_NOTES } from './gifts'

const COURTS = GOVERNING_COURTS ?? tbc('city whose courts have jurisdiction')

export const TERMS: LegalDoc = {
  path: LEGAL_PATHS.terms,
  title: 'Terms of Use',
  description:
    'The terms for booking car wash, detailing and other car care through Detlio: bookings, payments, cancellations, reviews and your rights.',
  toc: true,
  intro: [
    {
      kind: 'p',
      text: `These terms apply when you use Detlio to find a garage and book car care, on detlio.com or in the Detlio app. By signing in or making a booking you agree to them, so please read them along with our ${LINK.privacy} and ${LINK.refunds}.`,
    },
    {
      kind: 'p',
      text: 'Nothing in these terms takes away any right you have under the Consumer Protection Act, 2019 or any other law.',
    },
  ],
  sections: [
    {
      id: 'who-we-are',
      heading: '1. Who we are',
      blocks: [
        { kind: 'p', text: WHO_WE_ARE },
        {
          kind: 'p',
          text: `In these terms, "Detlio", "we" and "us" mean that business. "You" means the person using Detlio to book a service. To reach us, ${CONTACT_LINE}. Our full contact details and Grievance Officer are on the ${LINK.contact} page.`,
        },
        {
          kind: 'note',
          text: "**Legal name.** Consumer Protection (E-Commerce) Rules 2020 rule 4(2)(a) asks for the \"legal name of the e-commerce entity\". For a sole proprietorship that is the proprietor's own name; ScrubCars is a trade name, and Razorpay asks for the name \"as registered\". The proprietor's name is left as a placeholder on purpose. Decide whether it is printed here, in the footer and on the Contact page.",
        },
        {
          kind: 'note',
          text: '**"Shall be a company."** E-Commerce Rules rule 4(1)(a) says an e-commerce entity "shall be a company" (or an LLP/foreign company office). The 2026 amendment did not change this, and I found no clarification for proprietorships. Please advise whether, and by when, the business should incorporate. Every display duty on these pages applies either way.',
        },
      ],
    },
    {
      id: 'what-detlio-does',
      heading: '2. What Detlio does',
      blocks: [
        {
          kind: 'p',
          text: 'Detlio is an online marketplace. It lists independent partner garages and lets you book their car care services, either **at the garage** or **at your door** (doorstep), and pay for them online.',
        },
        {
          kind: 'list',
          items: [
            '**The garage does the work.** Each partner garage is an independent business. It sets its own services and prices, decides whether to accept your booking, and is responsible for the work it does on your car.',
            '**Detlio runs the booking.** We take your booking, collect your payment through our payment partner Razorpay, pass the garage its share, handle cancellations and refunds under our policies, and help if something goes wrong.',
            '**Detlio is not a garage** and does not itself wash, detail or repair cars.',
          ],
        },
        {
          kind: 'p',
          text: 'A garage is listed only after our team has approved it. That is a check we make before listing, not a promise about the quality of any particular job.',
        },
        {
          kind: 'p',
          text: `Before you book, the garage's page shows its name, area and rating. After you book, its address, phone and WhatsApp are on your booking page. You can also ask us in writing for the garage's full details (its legal name, address and contact details), and we will give them to you.`,
        },
        {
          kind: 'note',
          text: '**Seller details before purchase.** E-Commerce Rules rule 5(3)(a) requires the garage\'s business name, whether it is registered, its geographic address and its customer care number before purchase. The garage page shows only name, area (the city) and rating; the street address, phone and WhatsApp reach the customer only on the booking page, after paying. The server\'s vendor payload (vendors.service.ts toVendorResponse) carries phone, address, city, pincode and WhatsApp, but the customer app\'s public mapper keeps only the city (mappers.ts mapPublicVendor sets area from it); confirm the public garage endpoint returns them before showing them. No registration-status field exists. This must be fixed in the product before launch (show them on the garage page, or at least at checkout before Pay); the sentence above then changes back.',
        },
        {
          kind: 'note',
          text: '**Money model.** The code collects the full price into Detlio\'s Razorpay account and pays the garage its share separately (no commission is visible in code; the payout equals the price unless the garage funded the discount). Please check: (a) whether collecting for garages needs a particular Razorpay set-up (e.g. Route) under the RBI Payment Aggregator Directions 2025; (b) with the CA, whether Detlio, as an e-commerce operator collecting payment for suppliers, must register for GST and collect TCS (CGST Act ss.24 and 52) regardless of turnover — the receipts currently say "not a tax invoice".',
        },
      ],
    },
    {
      id: 'your-account',
      heading: '3. Your account',
      blocks: [
        {
          kind: 'list',
          items: [
            'You must be **18 or older** to use Detlio.',
            'You sign in with an Indian mobile number and a one-time code (OTP) sent by SMS. There is no password. One mobile number has one account.',
            'Keep your phone and the codes we send you to yourself. We treat bookings made after signing in with your number as made by you, unless they were not made by you and not through your carelessness. If you think someone else has used your account, tell us straight away; you are not responsible for anything done after you tell us.',
            'Give us your real name and accurate details (your car, and your address and map pin for doorstep visits). The garage relies on them.',
            'You can use Detlio only for your own bookings, or for a car you are allowed to have serviced, and only for lawful purposes.',
          ],
        },
        {
          kind: 'note',
          text: '**Age.** The product has no age check or age statement at sign-up. "18 or older" is recommended so Detlio stays outside the DPDP Act s.9 parental-consent regime (a "child" is anyone under 18). Consider a line at sign-up such as "By continuing you confirm you are 18 or older". The sign-in screen now reads "By continuing, you agree to our Terms. Our Privacy Policy explains how we use your data." (the Privacy Policy as a notice, not bundled into the agreement, per DPDP s.6(1)), with no checkbox: please confirm a linked statement is enough for acceptance (E-Commerce Rules rule 4(9) forbids pre-ticked boxes).',
        },
      ],
    },
    {
      id: 'bookings',
      heading: '4. Booking a service',
      blocks: [
        {
          kind: 'list',
          items: [
            '**Prices.** Each garage sets its own prices, in Indian rupees (₹). Where it applies, the price depends on your car\'s size (hatchback, sedan or SUV). You see each service\'s price, any discount and the total amount to pay before you pay.',
            '**No extra fees.** Detlio adds no booking, convenience or platform fee. The amount on the Pay button is the full price, except for inspection services, where it is the minimum and the garage may send a final bill for more (section 7).',
            `**Minimum notice.** An At garage booking must start at least **${RULES.noticeAtGarage}** after you book, and a Doorstep visit at least **${RULES.noticeDoorstep}** after. The app shows times up to ${RULES.daysAhead} days ahead, and only times when the garage is open, has room, and can finish all the services you picked before it closes.`,
            '**Doorstep area.** Each garage chooses the area it travels to. You must pin your exact address on the map, and we check the garage covers it before you pay.',
            '**Your booking is a request until the garage accepts it.** After you pay, the booking shows as "Requested". It is confirmed when the garage accepts. If the garage declines, you get a full refund. Check the booking page in the app: that is where acceptance, a decline and every later change are shown. We do not send texts about bookings.',
            '**Promo codes.** One code per booking. Codes are issued by Detlio and may have conditions (dates, a minimum amount, particular garages, a limit on uses). The discount is shown before you pay. A promo code can never bring a booking below ₹1.',
            `**Durations** shown for a service are the garage's estimate.`,
          ],
        },
        {
          kind: 'p',
          text: `How bookings are cancelled, moved and refunded is set out in the ${LINK.refunds}. How and where services are delivered is in the ${LINK.delivery}.`,
        },
      ],
    },
    {
      id: 'payment',
      heading: '5. Payment',
      blocks: [
        {
          kind: 'list',
          items: [
            'You pay online when you book, through **Razorpay**, our payment partner. You can use the methods Razorpay offers at checkout (such as UPI, cards and net banking). Cash is not accepted.',
            'Your card, UPI and bank details are entered on Razorpay\'s secure checkout. Detlio never sees or stores your card number, CVV, UPI PIN or banking password.',
            'There are no subscriptions or automatic repeat payments.',
            `Each booking with a successful payment has a payment receipt in the app. **${RULES.receiptLine}** Detlio is not registered for GST at present, so no GST is charged or shown.`,
          ],
        },
        // Gift a wash (0049): questions for the lawyer and CA only (notes are
        // never public copy). The public gift terms go here once agreed.
        ...GIFTS_LAWYER_NOTES,
      ],
    },
    {
      id: 'cancellations',
      heading: '6. Cancellations, reschedules and refunds',
      blocks: [
        {
          kind: 'p',
          text: `In short (the full rules, with every case, are in the ${LINK.refunds}):`,
        },
        {
          kind: 'list',
          items: [
            'Until the garage accepts, you can cancel or reschedule any time, for a full refund.',
            `Once the garage has accepted, you can cancel or reschedule up to **${RULES.changeCutoff} before** your slot, for a full refund. There is no cancellation fee.`,
            `You can reschedule up to **${RULES.maxReschedules} times**. Each new time goes back to the garage to accept. If it can't take it, the booking is cancelled and refunded in full.`,
            'If the garage declines or does not turn up, or we cancel for a reason other than your request, you get a full refund.',
            '**If you do not turn up for an accepted booking, your payment is not refunded**, because the garage kept the slot for you.',
            `Refunds are made by our team, normally to your original payment method, within ${RULES.refundDays}.`,
          ],
        },
      ],
    },
    {
      id: 'inspection',
      heading: '7. Inspection jobs and final bills',
      blocks: [
        {
          kind: 'p',
          text: 'Some work can only be priced once the garage has seen the car. For these services the price shown is an **inspection fee, which is the minimum you pay**, and the final price can be higher.',
        },
        {
          kind: 'list',
          items: [
            'You pay the inspection fee when you book.',
            `If the work costs more, the garage sends a final bill in the app, after it starts the job and no later than ${RULES.finalBillWindowDays} days after finishing it. The bill lists the work and its cost and shows what you have already paid; you pay the balance in the app, through Razorpay.`,
            'If the work costs no more than the inspection fee, there is nothing more to pay. The difference is not refunded when the work costs less than the fee.',
            'A promo code you used on the booking is not taken back: the final bill credits the full pre-discount price you booked at.',
            'If you think a final bill is wrong, or includes work you did not agree to, contact us **before paying it**. We will take it up with the garage.',
          ],
        },
        {
          kind: 'note',
          text: '**Consent to extra work.** The product has no step where the customer approves the quote before the garage does extra work, no deadline for paying the balance, and no dispute flow inside the app. Billing for work the customer did not agree to risks being "an unreasonable charge" (CPA s.2(46)(vi)). Options: tell garages (Partner Terms) to get the customer\'s agreement before extra work; or add an approval step to the product. These terms promise neither, on purpose.',
        },
      ],
    },
    {
      id: 'doorstep',
      heading: '8. Doorstep visits',
      blocks: [
        {
          kind: 'list',
          items: [
            'Make sure the address and map pin are right. The garage comes to the pin.',
            'Be there at the booked time, or have someone there who can hand over the car and keys.',
            'Give the garage reasonable access to the car, with enough room to work safely, at a place where the car may lawfully be serviced (for example, your building or society allows it).',
            'Some services may need water or a power point. If you are not sure what the garage needs from you, ask it before the visit (the booking page has the garage\'s phone and WhatsApp).',
          ],
        },
        {
          kind: 'note',
          text: '**Owner to confirm.** The product says nothing about water, power, parking or society permission. Confirm what garages actually need and whether Detlio wants to promise anything here (for example "the garage brings its own water").',
        },
      ],
    },
    {
      id: 'your-car',
      heading: '9. Your car',
      blocks: [
        {
          kind: 'list',
          items: [
            'Remove valuables and personal belongings before the service. The garage and Detlio are not responsible for items left in the car, except where they are lost or damaged through the garage\'s own fault.',
            'Tell the garage about existing damage, scratches, dents, aftermarket parts, warning lights or anything else it should know before it starts.',
            'You confirm that you own the car or are allowed to have the work done on it.',
          ],
        },
      ],
    },
    {
      id: 'garage-work',
      heading: '10. The garage\'s work',
      blocks: [
        {
          kind: 'p',
          text: 'The garage is responsible for doing the work with reasonable care and skill, as described on Detlio, and for damage it causes to your car. If a service is deficient, or not as described, you are entitled to have it put right — by the work being redone, or by a full or part refund — under the Consumer Protection Act, 2019 and the E-Commerce Rules.',
        },
        {
          kind: 'p',
          text: 'Garages may photograph your car before and after the work (see section 12). These photos help everyone see what changed if there is a disagreement.',
        },
      ],
    },
    {
      id: 'problems',
      heading: '11. If something goes wrong',
      blocks: [
        {
          kind: 'list',
          items: [
            `Tell us as soon as you can, and ideally ${DISPUTE_WINDOW} of the service, with your booking reference and photos if you have them. Use **Help with this booking** on the booking page, or ${CONTACT_LINE}.`,
            'We will look at the booking, the job photos and what you and the garage tell us, and take it up with the garage for you.',
            `If the work was deficient or the garage damaged your car, we will work with you and the garage to put it right: by having the work redone, by a refund under our ${LINK.refunds}, or by the garage making good the damage.`,
            'Reporting later than this does not take away your legal rights, but the sooner you tell us, the easier it is to check what happened.',
          ],
        },
        {
          kind: 'note',
          text: '**Reporting window (N days).** Not fixed by the owner yet — it is a placeholder. It is drafted as "ideally within N days" rather than a hard cut-off, because a hard cut-off on reporting deficiency could be an unfair contract term (CPA s.2(46)). Also decide who pays for damage the garage caused, and whether Detlio itself pays first and recovers from the garage — the Partner Terms should match.',
        },
      ],
    },
    {
      id: 'job-photos',
      heading: '12. Job photos',
      blocks: [
        {
          kind: 'list',
          items: [
            `Garages may take before and after photos of your car (up to ${RULES.photosPerStage} of each). They may show your number plate.`,
            'You can see them on your booking page once the job has started.',
            `They can be added or removed until ${RULES.photosFrozenAfterDays} days after the job is completed; after that they are fixed, so they can be relied on if there is a dispute.`,
            `They are shown to you, the garage and our team, and are used to deal with questions and disputes about the job. They are stored at unlisted web links that anyone with the exact link can open (see the ${LINK.privacy}), and how long we keep them is in the ${LINK.privacy}.`,
          ],
        },
      ],
    },
    {
      id: 'reviews',
      heading: '13. Reviews',
      blocks: [
        {
          kind: 'list',
          items: [
            'You can review a garage only after a booking with it is completed, once per booking: a rating of 1 to 5 stars and, if you like, a comment.',
            'Reviews are public. They show your **first name and the initial of your last name** (for example "Arjun K."), never your phone number.',
            'Write about your own experience, honestly. Garages, their staff and anyone paid by them must not review their own garage or a competitor, and nobody may post reviews for payment or reward.',
            'Once posted, you cannot edit or delete a review yourself. Contact us if you want it changed or removed.',
            'We may remove a review that breaks the content rules in section 14, is fake, or is about something other than the booking. We do not remove reviews because they are negative.',
          ],
        },
        {
          kind: 'note',
          text: '**Removing reviews.** The public feed shows only first name and initial (#18, now merged). There is no tool for the team to remove a review; today it would have to be done in the database. Please confirm the right to remove reviews can stay in the terms on that basis.',
        },
      ],
    },
    {
      id: 'content-rules',
      heading: '14. What you must not post or send',
      blocks: [
        {
          kind: 'p',
          text: 'These rules apply to anything you put on Detlio — reviews, comments, photos, names, cancellation reasons and messages. You must not host, display, upload, modify, publish, transmit, store, update or share anything that:',
        },
        {
          kind: 'list',
          ordered: true,
          items: [
            'belongs to another person and to which you have no right;',
            'is obscene, pornographic, paedophilic, invasive of another\'s privacy (including bodily privacy), insulting or harassing on the basis of gender, racially or ethnically objectionable, relates to or encourages money laundering or gambling, or is an online game that causes user harm, or promotes enmity between groups on the grounds of religion or caste with the intent to incite violence;',
            'is harmful to children;',
            'infringes any patent, trademark, copyright or other proprietary right;',
            'deceives or misleads anyone about where a message came from, or knowingly and intentionally communicates misinformation or information that is patently false and untrue or misleading in nature;',
            'impersonates another person;',
            'threatens the unity, integrity, defence, security or sovereignty of India, friendly relations with foreign States, or public order, causes incitement to any cognisable offence, prevents the investigation of any offence, or insults another nation;',
            'contains a software virus or any other computer code, file or program designed to interrupt, destroy or limit the functionality of any computer resource;',
            'is in the nature of an online game that is not verified as a permissible online game;',
            'is in the nature of advertisement or surrogate advertisement or promotion of an online game that is not a permissible online game, or of any online gaming intermediary offering such an online game; or',
            'violates any law for the time being in force.',
          ],
        },
        {
          kind: 'p',
          text: 'Do not harass or abuse garage staff or our team, use Detlio to commit fraud, try to get into accounts or systems that are not yours, or copy Detlio\'s listings in bulk.',
        },
        {
          kind: 'p',
          text: `If you break these rules, we may remove the content, suspend or close your account, or both (section 15). To report content that breaks them, contact our Grievance Officer (see ${LINK.contact}).`,
        },
        {
          kind: 'note',
          text: '**Intermediary status.** This list follows IT (Intermediary Guidelines) Rules 2021 rule 3(1)(b), which E-Commerce Rules rule 5(1) ties to safe harbour under IT Act s.79. Please advise whether Detlio can rely on intermediary status at all (it sets the booking rules, collects payment and handles refunds). If it does, the IT Rules also require telling users of these rules at least once a year and, since 20 Feb 2026, of the consequence of breaking them at least once every three months — an in-app or SMS notice the product does not have yet. The list is taken from the consolidated text of 6 April 2023; please check it against the Gazette for any later change (the 2026 amendment text was read only in commentary).',
        },
      ],
    },
    {
      id: 'suspension',
      heading: '15. Suspending or closing an account',
      blocks: [
        {
          kind: 'list',
          items: [
            'We may suspend or close your account, or refuse a booking, if you break these terms, misuse Detlio, act fraudulently or abusively, or if the law requires it. We will tell you why, by WhatsApp or a call to your registered mobile number, unless the law stops us, and you can ask us to reconsider through our Grievance Officer.',
            'A suspension does not take away a refund you are already owed under the Cancellation & Refund Policy.',
            `You can ask us to close your account at any time: ${CONTACT_LINE}. What we delete and what we must keep is explained in the ${LINK.privacy}.`,
          ],
        },
      ],
    },
    {
      id: 'ranking',
      heading: '16. How garages are shown',
      blocks: [
        {
          kind: 'p',
          text: 'Only garages that our team has approved and that are taking bookings are shown. They are filtered by what you ask for: At garage or Doorstep, the type of service, your search words and the map area. Within that, the order is decided by these, most important first:',
        },
        {
          kind: 'list',
          ordered: true,
          items: [
            '**Whether the garage has set its map location.** Garages that have come before those that have not, whatever the sort.',
            '**Within each group: on the home screen, distance from you**, nearest first, when you have shared your location; **otherwise, and in search results, the garage\'s name**, alphabetically, unless you choose another sort.',
          ],
        },
        {
          kind: 'p',
          text: 'You can instead sort by distance, by rating, or by starting price (low to high, or high to low); the sort you choose applies within each of the two groups. Garages cannot pay to be shown higher, and there are no sponsored listings. If that ever changes, sponsored listings will be clearly labelled.',
        },
        {
          kind: 'p',
          text: '**Offers on the Home screen** are promo codes our team chooses to show there, up to three at a time. The ones our team marks as most important come first, then the one ending soonest, then the newest. Once offers are matched to you (section 2 of our Privacy Policy), offers of the same importance are shown in this order: offers from garages you have booked, then from garages near you, then Detlio\'s own offers, then other garages\' offers.',
        },
        {
          kind: 'note',
          text: '**Offers on Home and ranking.** Added because Home now shows garages\' promo codes in an order (apps/server/src/lib/offers.ts rankOffers: the team\'s priority, then, only once matching is on, the customer\'s tie to the garage, with Detlio\'s own codes after booked and nearby garages but before every other garage\'s, then the soonest end, then the newest). Detlio ranking its own offers above other garages\' is disclosed here because it is a ranking parameter; if the owner would rather not rank them first, offerTier can give Detlio-wide and other garages\' offers the same tier and this paragraph changes with it. Please confirm that no garage pays for an offer\'s place on Home; if one ever does, the offer must be labelled as sponsored, as the paragraph above promises for listings, and this paragraph must say so.',
        },
      ],
    },
    {
      id: 'liability',
      heading: '17. Our responsibility to you',
      blocks: [
        {
          kind: 'list',
          items: [
            'We are responsible for the part of the service we provide: the booking, handling your payment, refunds under our policies, and helping when something goes wrong.',
            'The garage is responsible for the work on your car (section 10). Where a garage is at fault, we will help you get it put right, as set out in section 11.',
            'We work to keep Detlio available and accurate, but it may sometimes be unavailable, for example for maintenance or because of a fault with our providers. If that affects a paid booking, the Cancellation & Refund Policy applies.',
            'We are not responsible for loss that was not reasonably foreseeable, or that was caused by events outside our reasonable control.',
            'Nothing in these terms limits our responsibility for our own negligence, fraud or deficiency in service, or any right you have under the Consumer Protection Act, 2019 or other law.',
          ],
        },
        {
          kind: 'note',
          text: '**No liability cap.** Drafted without a cap on purpose: a cap or blanket exclusion on a consumer contract risks CPA s.2(46). Please advise whether a fair cap (for example, the amount paid for the booking, for Detlio\'s own platform failures only) is acceptable.',
        },
      ],
    },
    {
      id: 'ip',
      heading: '18. Detlio\'s name and content',
      blocks: [
        {
          kind: 'p',
          text: 'The Detlio name, logo, app and website belong to us. Garages\' names, photos and descriptions belong to the garages. You may use Detlio for your own bookings but not copy or reuse its content for anything else without permission. By posting a review you allow us to show it on Detlio.',
        },
      ],
    },
    {
      id: 'changes',
      heading: '19. Changes to these terms',
      blocks: [
        {
          kind: 'list',
          items: [
            'We may update these terms, for example when the service or the law changes. The date at the top shows when they last changed.',
            'We will tell you about important changes before they apply, by WhatsApp or a call to your registered mobile number, and remind you of these terms the same way at least once a year.',
            'A change never applies to a booking you have already paid for: that booking follows the terms in force when you paid.',
          ],
        },
        {
          kind: 'note',
          text: '**No way to notify yet.** The product has no in-app notice, email or SMS for telling customers about changes (SMS is used only for login codes). The text now promises only WhatsApp or a call to the registered number, which the team can do by hand, but there is no list or process for it yet. Telling users of changes, and of the rules at least yearly (IT Rules 3(1)(f)) and, if Detlio relies on intermediary status, of the consequences of breaking them every three months, needs that process (or an in-app notice) before these terms are relied on.',
        },
      ],
    },
    {
      id: 'law',
      heading: '20. Governing law and disputes',
      blocks: [
        {
          kind: 'list',
          items: [
            'These terms are governed by the laws of India.',
            `Subject to the next point, the courts at ${COURTS}, Tamil Nadu, have jurisdiction over disputes about them.`,
            'This does not affect your right to file a complaint before a Consumer Commission, including where you live or work, under the Consumer Protection Act, 2019. You are not required to go to arbitration.',
            `Before going to court or a Commission, we encourage you to raise the issue with us — most problems can be sorted out quickly. See ${LINK.contact}.`,
          ],
        },
        {
          kind: 'note',
          text: '**Seat of jurisdiction.** Chromepet is in Chengalpattu district (Tambaram), outside Chennai city. An exclusive-jurisdiction clause can only choose among courts that already have jurisdiction (Swastik Gases v. IOC, (2013) 9 SCC 32 — citation not verified). The owner chose Chennai (`details.ts` GOVERNING_COURTS); please confirm Chennai courts can be named for a business whose address is in Chengalpattu district, or say which seat to use.',
        },
      ],
    },
    {
      id: 'contact',
      heading: '21. Contact and complaints',
      blocks: [
        {
          kind: 'p',
          text: `For help, ${CONTACT_LINE}. For complaints, our Grievance Officer's details and how complaints are handled, see ${LINK.contact}.`,
        },
        {
          kind: 'p',
          text: `These terms are in English. If you would like them in Tamil, ask us at ${BUSINESS.email}.`,
        },
        {
          kind: 'note',
          text: '**Language.** IT Rules 3(1)(a)–(b) and, from 13 May 2027, DPDP s.5(3) expect the rules and privacy notice to be available in English or a language of the Eighth Schedule "of his choice". A Tamil translation on request is the practical minimum; it does not exist yet. Please advise whether on-request is enough.',
        },
      ],
    },
  ],
}
