/**
 * Detlio Guarantee (0051): notes for the owner's lawyer, before
 * GUARANTEE_ENABLED is switched on in production. NOT public copy: these are
 * `note` blocks, which a page shows only under `next dev` while the legal
 * pages are drafts and which always go into the lawyer's Markdown copy
 * (scripts/export-legal.ts). They sit in the Terms' cancellations section and
 * the Refund Policy, where the public guarantee terms would go once agreed.
 * The customer-facing explainer is a draft question in the Help centre
 * (components/help/content.ts, id `free-redo`), shown only while it is on.
 *
 * What the product does (behind the switch, default off; rules in
 * apps/server/src/lib/guarantee.ts): a free redo within 48 hours of a
 * completed car wash or detailing (or a package of only those) paid on
 * Detlio, decided on photos, with limits against misuse.
 */
import { GUARANTEE_RULES as R } from '@repo/core/guarantee'
import type { LegalBlock } from './doc-format'

export const GUARANTEE_LAWYER_NOTES: LegalBlock[] = [
  {
    kind: 'note',
    text: `**Detlio Guarantee (0051, switched off; not in the public text). What it promises.** A customer may ask for a free redo of a completed car wash or detailing (or a package of only those) booked and paid on Detlio, within **${R.claimWindowHours} hours** of completion, with at least **${R.minPhotos} photos** of the problem taken in the app and the problem picked from a list. Coating, scratch removal, inspection and "other" services are excluded (they go through complaints). If the garage took its before and after photos of the job, it has **${R.garageReviewHours} hours of its opening hours** (at most ${R.garageReviewCapHours} hours) to accept or dispute; no answer counts as accepted. If it took no photos, the redo is approved at once. Disputes are decided by Detlio (aimed at ${R.detlioDecideHours} hours): a redo, a **refund instead** (when a redo is not practical), or not approved with a reason. An approved redo is booked at the same garage within **${R.redoWithinDays} days**, free of charge; a customer who does not turn up for it loses the claim with nothing more owed. Please advise: (1) the public wording, which the brand's copy rules otherwise keep free of promise words — whether calling it a "Guarantee" creates obligations under the Consumer Protection Act 2019 beyond what is described (an express warranty), and whether "free redo promise" or similar is safer; (2) whether the exclusions, the time limits and "not approved" with a reason are enforceable and must be shown before purchase (checkout shows "Covered by Detlio Guarantee" with a one-line summary); (3) how it sits beside the customer's statutory rights (deficiency in service) — the guarantee must not read as replacing them.`,
  },
  {
    kind: 'note',
    text: `**Misuse limits (internal, not shown to customers).** At most **${R.maxApprovedClaims} approved claims per customer in 6 months** (waiting ones count); a customer whose claims are more than **${Math.round(R.reviewRateThreshold * 100)}%** of their completed bookings (with at least ${R.reviewRateMinBookings}) and any claim on a customer's **first booking** always go to Detlio, never approved automatically; a redo cannot itself be claimed on. A customer at the limit is told only that the booking can't take a claim and is pointed to complaints. Please confirm that applying these unpublished limits is acceptable, or whether the Terms must say that claims are reviewed and may be declined for repeated use (the Help answer says "Each claim is checked, and Detlio may decline one that does not hold up").`,
  },
  {
    kind: 'note',
    text: '**Garage agreement change needed before switching it on.** Garages must agree in writing to: (a) redo a job **free of charge** when a claim is approved — by them, by not answering in time, by having no before/after photos of the job, or by Detlio on a dispute — within 7 days, at a time the customer picks from their free slots; (b) be paid **nothing** for the redo, and Detlio take no commission on it; (c) when Detlio approves a **refund instead**, be paid nothing for the original job, with any payout already made **deducted from the next payout** (a negative line on the statement); (d) Detlio\'s decision on a dispute being final as between Detlio and the garage, made on both sides\' photos; (e) approved claims counting toward the quality standard of the Detlio badge for garages (its complaint rate). The current agreement (garage documents, type `agreement`) does not cover any of this; the feature stays off until signed versions are on file.',
  },
  {
    kind: 'note',
    text: '**Refunds and receipts.** A refund instead of a redo refunds the booking\'s payment in full (card/UPI to the original method; any Detlio credit part back as credit), through the same refund process as a cancellation, and may be sent automatically when automatic refunds are on. A free redo is a ₹0 booking: it takes no receipt number (no money changed hands) and the original job\'s receipt stands. Please confirm a ₹0 redo needs no receipt or invoice of its own, and that refunding a completed (not cancelled) job needs nothing more in the Refund Policy than a new row.',
  },
  {
    kind: 'note',
    text: '**Personal data.** A claim stores the customer\'s photos of the problem (in the job\'s own photo folder, location and camera details removed in the browser), what they picked and any words they typed, the garage\'s answer and note, and Detlio\'s decision and reason. The garage sees the customer\'s photos, choices and words, and their first name only. The photos are kept with the booking and deleted with it. The Privacy Policy (sections 2, 3 and 7) should mention claim photos before the feature is switched on.',
  },
]
