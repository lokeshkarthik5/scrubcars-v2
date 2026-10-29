/**
 * Collection lists (0059, "Send to team"): the rules, pure so the tests pin
 * them. Twins of packages/core/src/onboarding-marks.ts's collectionItemDone
 * and collectionProgress (collection-lists.rules.test.ts checks they agree).
 *
 * "Cleared" is never stored: an item is cleared once its garage's live
 * missing keys (lib/vendor-missing.ts) no longer hold its kind. A custom
 * item is never cleared. Progress = (collected or cleared) / total, and a
 * list is open until it is closed or every item is done.
 */

import { isMissingKey, type MissingKey } from '../../lib/vendor-missing.js'

export const COLLECTION_ITEM_STATUSES = ['to_collect', 'collected'] as const
export type CollectionItemStatus = (typeof COLLECTION_ITEM_STATUSES)[number]

export const COLLECTION_LIMITS = {
  labelMax: 80,
  noteMax: 500,
  /** Garages on one list. */
  garagesPerList: 50,
  /** Lists in one Send to team. */
  listsPerRequest: 20,
  /** The closed or finished lists GET ?open=false returns, newest first. */
  closedListed: 50,
} as const

/** Whether the garage no longer misses the item's kind. Never for custom. */
export function itemCleared(
  kind: string,
  missing: readonly MissingKey[] | undefined
): boolean {
  if (!isMissingKey(kind)) return false
  // A garage that is gone (deleted forever) has no missing keys to read;
  // its items go with it, so this is only a guard.
  if (!missing) return false
  return !missing.includes(kind)
}

export function collectionItemDone(item: {
  status: CollectionItemStatus
  cleared: boolean
}): boolean {
  return item.status === 'collected' || item.cleared
}

export function collectionProgress(
  items: ReadonlyArray<{ status: CollectionItemStatus; cleared: boolean }>
): { done: number; total: number } {
  return { done: items.filter(collectionItemDone).length, total: items.length }
}

/** Open until closed, or until every item is collected or cleared. */
export function collectionListOpen(
  closedAt: Date | null,
  items: ReadonlyArray<{ status: CollectionItemStatus; cleared: boolean }>
): boolean {
  if (closedAt) return false
  return !items.every(collectionItemDone)
}

/**
 * Where a collector goes: the garage's own Google Maps link, else one built
 * from its pin, else nothing.
 */
export function collectionMapsUrl(garage: {
  mapsUrl: string | null
  lat: number | null
  lng: number | null
}): string | null {
  const own = garage.mapsUrl?.trim()
  if (own) return own
  if (garage.lat === null || garage.lng === null) return null
  // Six decimals is ~10 cm; a float4 pin reads back with noise digits.
  return `https://www.google.com/maps/search/?api=1&query=${garage.lat.toFixed(6)},${garage.lng.toFixed(6)}`
}

/**
 * One list's garages and kinds as sent: a garage named twice is merged and
 * each kind kept once (the unique index on list, garage and kind), in the
 * order sent; a garage left with nothing to collect is dropped.
 */
export function dedupeGarages(
  garages: ReadonlyArray<{ vendorId: string; kinds: readonly MissingKey[] }>
): Array<{ vendorId: string; kinds: MissingKey[] }> {
  const byVendor = new Map<string, MissingKey[]>()
  for (const garage of garages) {
    const kinds = byVendor.get(garage.vendorId) ?? []
    for (const kind of garage.kinds) if (!kinds.includes(kind)) kinds.push(kind)
    byVendor.set(garage.vendorId, kinds)
  }
  return [...byVendor.entries()]
    .filter(([, kinds]) => kinds.length > 0)
    .map(([vendorId, kinds]) => ({ vendorId, kinds }))
}

/**
 * Whether a list can be opened again (0065): only a closed one with
 * something left to collect. A finished list (every item collected or
 * cleared) would only close itself again on the next read.
 */
export function reopenRefusal(
  closedAt: Date | null,
  items: ReadonlyArray<{ status: CollectionItemStatus; cleared: boolean }>
): 'not_closed' | 'nothing_left' | null {
  if (!closedAt) return 'not_closed'
  if (items.every(collectionItemDone)) return 'nothing_left'
  return null
}
