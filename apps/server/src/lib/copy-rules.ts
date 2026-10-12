/**
 * Words Detlio does not put in front of customers.
 *
 * Offer titles and team notices are typed by people, and they reach every
 * customer's Home. These are the claims the brand rules forbid: hype the
 * product cannot back ("miracle", "instant perfection"), promises it cannot
 * keep ("guaranteed flawless", "lifetime"), trust badges nobody has earned
 * ("verified", "certified"), and "we'll notify you" (there are no push, SMS
 * or WhatsApp messages yet, so nothing would arrive).
 *
 * The same list is in packages/core/src/copy-rules.ts, so the admin form can
 * warn while typing; copy-rules.parity.test.ts fails if the two drift. Change
 * both together.
 */
export const BANNED_COPY: readonly string[] = [
  // Whole words, so each form is listed: "cheaper" is a fair comparison,
  // "cheapest" is a claim nobody has checked.
  'cheap',
  'cheapest',
  'miracle',
  'guarantee',
  'guarantees',
  'guaranteed',
  'flawless',
  'ultimate luxury',
  'instant perfection',
  'verified',
  'certified',
  'lifetime',
  // Nothing is sent yet, so no promise of a message in any wording.
  "we'll notify you",
  'we will notify you',
  "we'll let you know",
  'we will let you know',
  "we'll message you",
  'we will message you',
  "we'll text you",
  'we will text you',
  "we'll call you",
  'we will call you',
]

/**
 * The first banned phrase in `text`, or null when it reads fine. Whole words,
 * any case, and a curly apostrophe counts as a straight one ("we’ll").
 */
export function bannedPhraseIn(text: string): string | null {
  const normalised = text.toLowerCase().replace(/[‘’]/g, "'")
  for (const phrase of BANNED_COPY) {
    const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    if (new RegExp(`(^|[^a-z])${escaped}($|[^a-z])`).test(normalised)) return phrase
  }
  return null
}
