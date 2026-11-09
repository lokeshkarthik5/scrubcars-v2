import { msg } from '@repo/core/i18n/translate';
/**
 * Opening a list on one item a link or a notification named: `/guarantee?claim=<id>`,
 * `/requests?request=<id>`. Which list holds it (Open first, then Closed), and the
 * words when neither does. Pure, so it can be tested; the screens' hook is
 * lib/use-item-focus.ts.
 */

export const CLAIM_MISSING = msg('That claim is no longer here');
export const REQUEST_MISSING = msg('That request is no longer here');

/** Long enough for any id the server makes, short enough to refuse rubbish. */
const MAX_ID_LENGTH = 100;

/** The id a `?claim=` or `?request=` names, or null for nothing usable. */
export function itemIdParam(value: string | string[] | undefined | null): string | null {
  const raw = Array.isArray(value) ? value[0] : value;
  const id = typeof raw === 'string' ? raw.trim() : '';
  return id && id.length <= MAX_ID_LENGTH ? id : null;
}

/** One scope's list as the screen knows it, since the item was named. */
export interface ScopeLookup {
  /** The ids on the list; undefined until it has loaded. */
  ids: readonly string[] | undefined;
  /** When it last loaded (react-query's dataUpdatedAt); 0 for never. */
  updatedAt: number;
  /** When it last failed to load (errorUpdatedAt); 0 for never. */
  failedAt: number;
}

export type Scope = 'open' | 'closed';

export type Located =
  /** A list is still on its way. */
  | 'wait'
  | { scope: Scope }
  /** Both lists loaded and neither holds it: say so. */
  | 'missing'
  /** A list would not load, so it can't be said it is gone: show the list as it is. */
  | 'unknown';

function settle(lookup: ScopeLookup, askedAt: number): 'ok' | 'failed' | 'pending' {
  // Data from before the item was named may predate it (a push can beat the list's polling).
  if (lookup.ids !== undefined && lookup.updatedAt >= askedAt) return 'ok';
  if (lookup.failedAt >= askedAt) return 'failed';
  return 'pending';
}

/**
 * Where the item is. Open first; Closed only when Open (loaded after `askedAt`)
 * does not have it.
 */
export function locateItem(id: string, askedAt: number, open: ScopeLookup, closed: ScopeLookup): Located {
  const o = settle(open, askedAt);
  if (o === 'ok' && open.ids!.includes(id)) return { scope: 'open' };
  if (o === 'pending') return 'wait';
  const c = settle(closed, askedAt);
  if (c === 'ok' && closed.ids!.includes(id)) return { scope: 'closed' };
  if (c === 'pending') return 'wait';
  return o === 'failed' || c === 'failed' ? 'unknown' : 'missing';
}

/** Where to scroll so the card sits a little below the top. */
export function scrollTarget(listTop: number, cardTop: number, margin = 16): number {
  return Math.max(0, listTop + cardTop - margin);
}
