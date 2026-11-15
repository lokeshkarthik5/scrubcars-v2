import { msg } from '@repo/core/i18n/translate';
import { REPAIR_QUOTE_RULES } from '@repo/core/repair-quotes';

/**
 * The pure parts of the garage's repair-quote screens (0075), as the website's
 * (apps/vendors/components/repair-quote-card.tsx and app/requests/repair/[id]): the car's
 * line, how a closed one ended, and the quote form's checks.
 */

/** The car type as the garage prices it (English, shown as `t(…)`). */
export const CAR_TYPE: Record<string, string> = {
  hatchback: msg('hatchback'),
  sedan: msg('sedan'),
  suv: msg('SUV'),
};

/** How a repair quote ended for this garage, in a word (English, shown as `t(…)`). */
export const CLOSED_WORD: Record<string, string> = {
  quoted: msg('Quote sent'),
  declined: msg('Can’t do'),
  missed: msg('Time ran out'),
  closed: msg('Closed'),
};

/** Whole rupees from what was typed ("4,000" → 4000), or null. */
export function rupees(value: string): number | null {
  const digits = value.replace(/[^\d]/g, '');
  if (!digits) return null;
  const n = Number(digits);
  return Number.isSafeInteger(n) ? n : null;
}

/** Why Send quote can't be pressed yet (English, shown through `t`), or null. */
export function quoteProblem(input: { from: number | null; to: number | null; days: number | null }): string | null {
  if (input.from === null || input.from < 1) return 'Enter a price from';
  if (input.to === null || input.to < 1) return 'Enter a price to';
  if (input.to < input.from) return 'The price to must be the same as or above the price from';
  if (input.to > REPAIR_QUOTE_RULES.priceMax) return 'That price is too high';
  if (input.days === null || input.days < 1 || input.days > REPAIR_QUOTE_RULES.daysMax) return 'Pick the days needed';
  return null;
}
