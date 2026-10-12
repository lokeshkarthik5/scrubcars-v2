/**
 * The one place for every business detail the legal pages print.
 *
 * Change a detail here and every page (and the Markdown copy for the lawyer,
 * scripts/export-legal.ts) follows. `null` means nobody has confirmed it yet:
 * the pages then show a visible "[to be confirmed: …]" marker instead of
 * guessing. Fill each one in before LEGAL_DRAFT goes false.
 *
 * Keep the address, phone and email the same as the receipt's issuer block
 * (apps/server/src/lib/receipts.ts RECEIPT_ISSUER) and the business's Razorpay
 * account: change all three together. The phone itself comes from
 * @repo/core/support, which every screen already reads.
 */
import { SUPPORT_PHONE_DISPLAY, SUPPORT_TEL_HREF } from '@repo/core/support'

/**
 * Draft mode. While true, every legal page says "Draft for legal review — not
 * yet in force" and tells search engines not to index it, and under
 * `next dev` (never in a build) shows the reviewer notes inline. Set to false
 * only once the lawyer has signed off and every `null` below is filled in.
 *
 * Do not merge to main or deploy while this is true: the footer, sign-in,
 * checkout and Profile link these pages unconditionally, so production would
 * ask customers to agree to pages marked "not yet in force".
 */
export const LEGAL_DRAFT = true

/** The customer site, for canonical URLs and the Markdown copy's links. */
export const SITE_ORIGIN = 'https://detlio.com'

/** The date the current text was last changed. */
export const LAST_UPDATED = '12 October 2026'

/** The date the current text takes effect. Null until it is published. */
export const EFFECTIVE_DATE: string | null = null

export const BUSINESS = {
  /** The brand customers see. */
  brand: 'Detlio',
  /** The trade name of the sole proprietorship that runs Detlio. */
  tradeName: 'ScrubCars',
  /**
   * The proprietor's own name, which is the proprietorship's legal name.
   * Deliberately not filled in: the owner and lawyer decide whether and how
   * it is printed (see the reviewer note on the Terms).
   */
  proprietorName: null as string | null,
  address:
    'No. 47, Radha Nagar Main Road, Chromepet, Chengalpattu, Tamil Nadu 600044',
  website: 'detlio.com',
  phone: SUPPORT_PHONE_DISPLAY,
  phoneHref: SUPPORT_TEL_HREF,
  /** A Gmail inbox for now; to move to a detlio.com address later. */
  email: 'contact.scrubcars@gmail.com',
  /** As the owner set them (5 Oct 2026). */
  supportHours: '6 am to 1 am IST' as string | null,
}

/**
 * The Grievance Officer (Consumer Protection (E-Commerce) Rules 2020 rule
 * 4(4), IT Rules 2021 rule 3(2), SPDI Rules 2011 rule 5(9)), who is also the
 * contact for privacy questions (DPDP Act s.8(9)). Contact details default to
 * the business's own until the officer has their own.
 */
export const GRIEVANCE_OFFICER = {
  name: null as string | null,
  designation: null as string | null,
  email: BUSINESS.email,
  phone: BUSINESS.phone,
  address: BUSINESS.address,
}

/**
 * Complaint timelines, as published. The strictest that may apply are used
 * (IT Rules as amended in 2026, for a platform relying on intermediary
 * status), with the Consumer Protection outer limit kept beside them — see the
 * reviewer note on the Contact page. Words, not numbers, because they are
 * printed as they stand.
 */
export const GRIEVANCE_TIMELINES = {
  acknowledge: '24 hours',
  resolve: '7 days',
  contentRemoval: '36 hours',
  urgentContentRemoval: '2 hours',
  outerLimit: 'one month',
}

/**
 * The city whose courts hear disputes under the Terms (subject always to the
 * customer's right to go to a Consumer Commission). The owner chose Chennai;
 * the lawyer confirms it (the business address is in Chengalpattu district).
 */
export const GOVERNING_COURTS: string | null = 'Chennai'

/**
 * How many days after a job a customer has to report damage or a problem
 * with the work. Null until the owner decides.
 */
export const DISPUTE_WINDOW_DAYS: number | null = null

/** How long records are kept. Null until the owner, lawyer and CA decide. */
export const RETENTION = {
  /** Booking, payment, refund and receipt records, after the booking. */
  bookingRecords: null as string | null,
  /** Before/after job photos, after the job. */
  jobPhotos: null as string | null,
  /** Server and error logs. */
  logs: null as string | null,
  /** Account details after the account is closed. */
  afterClosure: null as string | null,
}

/**
 * Where the main database is hosted, as it should be printed (e.g. "Mumbai,
 * India"). Only a planning document says Supabase ap-south-1; null until
 * confirmed in the Supabase dashboard.
 */
export const DATABASE_LOCATION: string | null = null

/** Public escalation routes. */
export const ESCALATION = {
  consumerHelplinePhone: '1915',
  consumerHelplineUrl: 'https://consumerhelpline.gov.in',
  eDaakhilUrl: 'https://edaakhil.nic.in',
  grievanceAppellateUrl: 'https://gac.gov.in',
  /** Not verified yet; confirm the Board's complaint page at publish time. */
  dataProtectionBoardUrl: null as string | null,
  razorpayGrievanceUrl: 'https://razorpay.com/grievance-redressal/payments/',
}
