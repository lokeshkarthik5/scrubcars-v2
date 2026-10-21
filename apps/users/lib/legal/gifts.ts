/**
 * Gift a wash (0049): questions for the owner's lawyer and CA, before
 * GIFTS_ENABLED is switched on in production. NOT public copy: these are
 * `note` blocks, which a page shows only under `next dev` while the legal
 * pages are drafts and which always go into the lawyer's Markdown copy
 * (scripts/export-legal.ts). They sit in the Terms' Payment section, where
 * the public gift terms would go once agreed.
 *
 * What the product does today (behind the switch, default off): a signed-in
 * customer buys a Detlio gift of ₹300–₹5,000 (at most ₹10,000 a day) through
 * Razorpay; the recipient redeems it once into "Detlio credit" on their
 * account; credit pays for bookings at any garage on Detlio; it expires 12
 * months after the gift was paid for; it is never paid out as cash; credit
 * from a cancelled booking comes back as credit.
 */
import type { LegalBlock } from './doc-format'

export const GIFTS_LAWYER_NOTES: LegalBlock[] = [
  {
    kind: 'note',
    text: '**Detlio gifts and credit (0049, switched off; not in the public text). Is this a prepaid payment instrument?** A customer can buy a Detlio gift (₹300–₹5,000, at most ₹10,000 a day per buyer) and share a link; the person who opens it redeems it into "Detlio credit" on their own account, which pays for bookings with **any garage on Detlio**. Under the RBI Master Direction on Prepaid Payment Instruments, an instrument usable only for the issuer\'s own goods and services is a **closed system PPI** (no RBI authorisation needed), while one usable at a group of clearly identified merchants that have a contract with the issuer is a **semi-closed PPI**, which needs RBI authorisation (or issuance through an authorised bank/non-bank PPI issuer). Detlio sells garages\' services as a marketplace, collects the money and pays the garage its share. Please advise: (1) which category Detlio credit falls in; (2) whether presenting Detlio as the seller of the service (merchant of record) to the customer would make it closed system, and what that changes in the Terms, receipts and garage agreement; (3) if it is semi-closed, whether a partner (bank or PPI issuer, or Razorpay\'s gift card product) should issue it instead; (4) any limits we must apply (amount, validity, KYC). The feature stays off until this is answered.',
  },
  {
    kind: 'note',
    text: '**Gift terms to agree before launch.** Defaults built: gift and credit expire **12 months** after the gift was paid for (shown on the gift and the credit screen); a gift can be redeemed **once**, by any signed-in account (including the buyer\'s own); credit is **never refunded as cash** or transferable between accounts; credit from a cancelled booking returns **as credit** (keeping the latest expiry of the credit spent, and at least 30 days from its return), while any card/UPI part of that booking is refunded to the card/UPI as today; a customer no-show keeps the credit spent, like a card payment; an unredeemed gift can be cancelled and refunded by the team on request (by hand, through Razorpay). Please confirm or change each of these, the wording of the gift card and the redeem page, and whether expired credit must be refunded or may lapse (consumer protection; any state rules on gift card expiry). The public gift terms should also carry the line shown under every gift card: "Cars shown for illustration only. Not affiliated with any car maker."',
  },
  {
    kind: 'note',
    text: '**Car photos on gift and scratch cards.** Each gift card and revealed scratch prize shows one photo from a pool of photos of real sports cars (a few are renders of concept cars), downloaded from Unsplash and Pexels under their free licences (free commercial use and editing, no attribution required; the sources are listed in `apps/users/public/cards/cars/CREDITS.md`). The licence covers the photographers\' copyright, not the car makers\' trademarks or registered designs. So that no card suggests a maker endorses Detlio or that the gift is a maker\'s offer: every legible badge, wheel logo, model script, sponsor decal and tyre lettering has been removed; number plates are removed or cropped out, so no photo shows one; no make or model is named anywhere (screen, file names, alt text, shared images); and the gift share screen and the recipient\'s page say under the card "Cars shown for illustration only. Not affiliated with any car maker." A customer can share the card as an Instagram image, which shows the same photo. Please advise: (1) whether showing a recognisable car shape (without badges) on a gift card needs anything more, given registered designs and passing off; (2) whether the illustration-only line should also go in the shared image or on the scratch-card prize; (3) whether the line\'s wording is right.',
  },
  {
    kind: 'note',
    text: '**Tax and evidence of the gift purchase (for the CA).** A gift purchase is not a booking, so it does **not** take a number from the booking receipt series (DTL/YY-YY/NNNNNN, consecutive). It is evidenced by the gift\'s own reference (G-000123, from a sequence that may have gaps when a checkout is abandoned), the amount, the payment date and the Razorpay payment id, shown to the buyer in "Gifts you sent" and kept in the admin Gifts page. When credit pays for a booking, that booking\'s ordinary receipt shows "Paid with Detlio credit ₹X". Please advise: whether the gift sale needs its own receipt or voucher document, and a consecutive serial; how GST applies to the voucher (on issue or on redemption, if Detlio registers); and how the unredeemed balance (shown in admin as "Outstanding liability") should be accounted for, including expired balances.',
  },
  {
    kind: 'note',
    text: '**Personal data in gifts.** The buyer types the recipient\'s name and an optional message; whoever opens the link sees them, the amount and the buyer\'s first name. We keep, per account, the gifts bought and redeemed and a ledger of credit (in, out, expiry, team adjustments with a reason and the team member\'s name). Wrong codes are counted for an hour against a one-way hash of the network address (never the address itself) to stop guessing. Accounts with gifts or credit cannot be deleted from the app (support closes them, so a balance is not lost). The Privacy Policy (sections 2, 3 and 7) should mention these before the feature is switched on.',
  },
]
