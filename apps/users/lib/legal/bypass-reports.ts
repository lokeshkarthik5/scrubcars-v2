/**
 * "Did the garage ask you to book directly?" (0052): questions for the
 * owner's lawyer about the garage agreement and the customer reports. NOT
 * public copy: these are `note` blocks, which a page shows only under
 * `next dev` while the legal pages are drafts and which always go into the
 * lawyer's Markdown copy (scripts/export-legal.ts). They sit in the Terms'
 * "How garages are shown" section, the nearest the customer Terms come to
 * Detlio's relationship with garages; the clause itself belongs in the
 * garage agreement, which is not in this repository.
 *
 * What the product does (lib/bypass-reports.ts): a customer reports, from a
 * booking, that the garage asked them to book directly, offered a lower price
 * outside Detlio, asked for cash or UPI directly, or gave its number for
 * future bookings; Detlio looks into it and confirms or dismisses it; a
 * confirmed report is a "strike" against the garage for 180 days, removes its
 * Detlio Certified eligibility, and earns the customer ₹100 of Detlio credit
 * once per garage. The garage portal reminds garages: "Asking Detlio
 * customers to book directly breaks your agreement and can lead to
 * suspension."
 */
import type { LegalBlock } from './doc-format'

export const BYPASS_LAWYER_NOTES: LegalBlock[] = [
  {
    kind: 'note',
    text: '**Garage agreement: a non-solicitation (anti-circumvention) clause is needed (0052).** The garage portal now tells garages that "asking Detlio customers to book directly breaks your agreement and can lead to suspension", so the signed garage agreement must actually say so. Please draft a clause that: (1) forbids the garage, its staff and anyone acting for it from asking or encouraging a customer it met through Detlio to book or pay outside Detlio (including offering a lower price, asking for cash or UPI to the garage, or handing out its number "for next time"), for the term of the agreement and a reasonable period after (we suggest 12 months), limited to customers introduced through Detlio; (2) says what happens on a breach: a written warning, then Detlio may pause the garage\'s listing, suspend it or end the agreement, and whether a fixed fee (for example the commission Detlio would have earned) may be charged, if that is enforceable as genuine pre-estimate of loss and not a penalty (Indian Contract Act s.74); (3) does not restrict the customer, who stays free to go wherever they like (the clause binds the garage only); (4) fits the Indian Contract Act s.27 (agreements in restraint of trade): it must restrain soliciting Detlio\'s customers, not the garage carrying on its business or serving walk-in customers. Please also confirm that the garages already signed (the `agreement` document in admin) can be moved onto the new wording by notice, or need to sign again.',
  },
  {
    kind: 'note',
    text: '**How Detlio decides a breach, and what the garage is told.** A report is looked into by the team and confirmed or dismissed with the team member\'s name (kept in the audit log). Confirmed reports in the last 180 days are counted as "strikes"; at 2 the team is alerted to act. The garage is **never told who reported it** (to protect the customer from pressure), which means a garage facing a warning or suspension cannot see the report itself. Please advise: (1) what notice and chance to respond the agreement should give before a suspension for this reason (natural justice; any platform-to-business fairness expectations); (2) whether we may rely on a customer\'s report alone, or need something more (a second report, a message or call recording the customer shares); (3) what we may tell the garage about the evidence without identifying the customer.',
  },
  {
    kind: 'note',
    text: '**The customer reward (₹100 of Detlio credit) and customer data.** A customer whose report Detlio confirms receives ₹100 of Detlio credit, once per garage, only after confirmation (never on submission). It is Detlio\'s own money, spent like gift credit and expiring after 12 months; while Detlio credit is switched off (the gift a wash questions above) the reward is recorded as owed and added when credit is switched on. Please confirm: (1) this promotional credit does not change the prepaid-instrument analysis of Detlio credit, or what would; (2) the wording a customer sees ("If we confirm it, we add ₹100 to your Detlio credit (once per garage)") is acceptable, and whether Terms need a short public paragraph on reports and rewards (no right to a reward, Detlio decides, abuse loses it); (3) the Privacy Policy should mention that a report (the booking, what happened, an optional note) is kept with the customer\'s account for the team, never shown to the garage, and kept after the account is deleted without the link to it (for the garage\'s record).',
  },
]
