/**
 * Words Detlio does not put in front of customers: hype, promises the product
 * cannot keep, trust badges nobody has earned, and "we'll notify you" (no
 * push, SMS or WhatsApp messages are sent yet).
 *
 * A twin of apps/server/src/lib/copy-rules.ts, which is what actually refuses
 * an offer title or a notice; this copy lets the admin form warn while the
 * text is typed. apps/server/src/lib/copy-rules.parity.test.ts fails if the
 * two drift, so change both together. No imports, so the server test can load
 * this file directly.
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
