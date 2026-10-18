/**
 * Contact windows (owner decision, 18 Oct 2026): the garage's phone and
 * WhatsApp reach the customer, and the customer's phone reaches the garage,
 * only from 2 hours before the booking until an hour after the job is done
 * (apps/server/src/lib/contact-window.ts). The public sentences quote the
 * hours from the same numbers the apps print (@repo/core/contact-window), so
 * a page can't promise a different window from the one enforced.
 *
 * CONTACT_WINDOW_LAWYER_NOTE is NOT public copy: a `note` block, shown on a
 * page only under `next dev` while the legal pages are drafts, and always in
 * the lawyer's Markdown copy (scripts/export-legal.ts).
 */
import { CONTACT_OPENS_HOURS_BEFORE, CONTACT_STAYS_HOURS_AFTER } from '@repo/core/contact-window'
import type { LegalBlock } from './doc-format'

const after = CONTACT_STAYS_HOURS_AFTER === 1 ? 'an hour' : `${CONTACT_STAYS_HOURS_AFTER} hours`

/** "from 2 hours before your booking until an hour after the job is done" */
export const CONTACT_WINDOW_HOURS = `from ${CONTACT_OPENS_HOURS_BEFORE} hours before your booking until ${after} after the job is done`

export const CONTACT_WINDOW_LAWYER_NOTE: LegalBlock = {
  kind: 'note',
  text: `**Contact windows (owner decision, 18 Oct 2026).** To stop customers and garages swapping numbers and booking around Detlio, the garage's phone and WhatsApp are on the customer's booking page only ${CONTACT_WINDOW_HOURS} (closed at once if the booking is cancelled; for a booking nobody started, ${CONTACT_OPENS_HOURS_BEFORE} hours after its time). The same window applies to the customer's phone in the garage portal. The garage's name and address are always on the booking page, and on the receipt (which never printed the garage's phone and still doesn't). Outside the window, and for anything after the job (a grievance, a refund, damage), **Detlio support is the channel**: the booking page's Help sheet offers Detlio's call and WhatsApp at all times, complaints get a number and the 24-hour/7-day clock, and on written request we give the garage's full details (sentence above). Please confirm: (1) that this meets E-Commerce Rules rule 5(3)(a) (the seller's "customer care number") and rule 4(4)–(5) (grievance redressal) for a marketplace, given that the seller's own number is shown only around the service and Detlio's support number always; (2) whether the garage agreement should say the garage may not ask customers to book it directly (non-circumvention), and whether that needs anything in these Terms; (3) whether anything in the Consumer Protection Act requires the seller's direct contact after the service (for example for a warranty claim on a coating), in which case the window would need an exception for those services.`,
}
