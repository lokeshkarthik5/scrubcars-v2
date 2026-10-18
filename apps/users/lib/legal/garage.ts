/**
 * The Detlio Garage (0057): questions for the owner's lawyer before the
 * Garage is switched on, and before any prize is ever tied to it. NOT
 * public copy: `note` blocks, shown on a page only under `next dev` while
 * the legal pages are drafts, and always in the lawyer's Markdown copy
 * (scripts/export-legal.ts). They sit in the Terms' Payment section, beside
 * the gift notes, where public terms for rewards would go once agreed.
 *
 * What the product does (behind REWARDS_ENABLED, the admin's rewards switch
 * and the Garage's own, default off): every booking paid through Detlio that
 * earns a Shine Card stamp also gives the customer one random collectible
 * card of a fictional car (Series 1: 40 cards, Common 55%, Rare 30%, Epic
 * 12%, Legendary 3%, a Rare or better within 10 cards and a Legendary within
 * 60); some scratch cards, challenges and badges give cards too. Duplicates
 * turn into Shine Card stamps; a row of five finished gives ₹100 off once;
 * the whole series gives a badge and is recorded. No car is a prize.
 */
import type { LegalBlock } from './doc-format'

export const GARAGE_LAWYER_NOTES: LegalBlock[] = [
  {
    kind: 'note',
    text: '**Detlio Garage collectible cards (0057, switched off; not in the public text). Is the random card a chance element?** Each booking paid through Detlio that earns a Shine Card stamp gives the customer one random card of an invented car. The odds are fixed and shown on the Garage page (Common 55%, Rare 30%, Epic 12%, Legendary 3%; a Rare or better within 10 cards and a Legendary within 60). Nobody pays for a card: it comes with a booking at the normal price, or with a scratch card, a challenge or a badge. What a card can lead to is small and Detlio-funded: duplicates become Shine Card stamps (every 3 make one), finishing a row of five gives ₹100 off a later booking once (counted in the monthly rewards budget; past it, a bonus stamp instead), and finishing all 40 gives a badge and a record that the customer completed the series. Please confirm (1) that a random collectible given with a purchase, with these small fixed rewards, is not a lottery or a prize competition under the Tamil Nadu Prize Schemes (Prohibition) Act, 1979 and the Lotteries (Regulation) Act, 1998, and is fair as a promotion under the Consumer Protection Act, 2019 (unfair trade practices) and the CCPA dark-pattern guidelines; (2) what the public rewards terms should say about the cards, the odds and that they have no cash value.',
  },
  {
    kind: 'note',
    text: '**Any future grand prize (for example a car for completing the series) is NOT built.** The completion is only recorded. Our understanding, to confirm before anything is offered: a prize decided or unlocked by chance, where entry depends on buying, is a prohibited lottery or prize scheme in Tamil Nadu, so any prize would have to be won by **skill** (for example a judged task among those who completed the series), with a **free route of entry** that needs no booking, published terms, and the usual tax (TDS on winnings) and age rules. Please advise on the structure before the owner announces anything.',
  },
  {
    kind: 'note',
    text: '**Fictional cars only.** Every Garage car is invented: names, colours, stats and short lines were written for Detlio, and each name and line is checked against a list of real makes and models when the team saves it (a match is refused). The default pictures are drawn by code (no photo of a real car); AI pictures, if the team makes them, are asked for an unbranded car with no logos, badges, letters or number plate, and are checked by eye before use. The stats ("0–100: 2.7 s") are for fun and describe cars that do not exist. Please confirm nothing more is needed (for example a line in the rewards terms that the cars are fictional and not affiliated with any maker).',
  },
]
