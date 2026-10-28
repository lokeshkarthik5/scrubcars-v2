/**
 * Onboarding marks and collection lists (0059): what a garage still owes us,
 * in the words admin shows and the words a WhatsApp or Telegram message asks
 * for it with.
 *
 * The missing keys are worked out on the server from the garage's own data
 * (apps/server/src/lib/vendor-missing.ts, this file's twin; a parity test
 * keeps the keys and tabs the same) and vanish by themselves once the garage
 * is filled in. They drive the Missing chips and the messages, never
 * `readiness`. Marks are the team's own notes for what the data can't show
 * ("Call back", "Visit the shop"), each To ask → Asked → Received.
 */

// ─── Missing keys ────────────────────────────────────────────────────────────

export const MISSING_KEYS = [
  'photos',
  'logo',
  'map_pin',
  'radius_default',
  'bays',
  'hours',
  'services',
  'prices',
  'documents',
  'payout',
] as const
export type MissingKey = (typeof MISSING_KEYS)[number]

/** The garage editor's tabs, as `?tab=` values. */
export type GarageTab =
  | 'details'
  | 'location'
  | 'operations'
  | 'services'
  | 'team'
  | 'documents'
  | 'certification'

/** The chip and checklist words: "Map pin". */
export const MISSING_LABELS: Record<MissingKey, string> = {
  photos: 'Photos',
  logo: 'Logo',
  map_pin: 'Map pin',
  radius_default: 'Doorstep radius',
  bays: 'Bays',
  hours: 'Hours',
  services: 'Services',
  prices: 'Prices',
  documents: 'Documents',
  payout: 'Payout details',
}

/** The editor tab where each is filled in ("Save to garage" opens it). */
export const MISSING_TABS: Record<MissingKey, GarageTab> = {
  photos: 'details',
  logo: 'details',
  map_pin: 'location',
  radius_default: 'operations',
  bays: 'operations',
  hours: 'operations',
  services: 'services',
  prices: 'services',
  documents: 'documents',
  payout: 'team',
}

/**
 * How each is asked for in a message to the owner (WhatsApp) or a teammate
 * (Telegram): a phrase that follows "we still need:".
 */
export const MISSING_ASKS: Record<MissingKey, string> = {
  photos: '3 shop photos',
  logo: 'your logo',
  map_pin: 'your shop’s location on Google Maps',
  radius_default: 'the distance you’ll travel for doorstep jobs (now 10 km by default)',
  bays: 'how many cars you can work on at once',
  hours: 'your opening hours',
  services: 'the services you offer',
  prices: 'the prices for your services',
  documents: 'your shop documents',
  payout: 'payout bank details (account + IFSC) or a UPI id',
}

/**
 * Red: customers can't book it yet, or it can't be verified. Amber: it
 * works, but we still want it.
 */
export const MISSING_TONES: Record<MissingKey, 'red' | 'amber'> = {
  photos: 'amber',
  logo: 'amber',
  map_pin: 'red',
  radius_default: 'amber',
  bays: 'amber',
  hours: 'red',
  services: 'red',
  prices: 'red',
  documents: 'amber',
  payout: 'amber',
}

export function isMissingKey(value: unknown): value is MissingKey {
  return typeof value === 'string' && (MISSING_KEYS as readonly string[]).includes(value)
}

// ─── Marks ───────────────────────────────────────────────────────────────────

export const MARK_STATUSES = ['to_ask', 'asked', 'received'] as const
export type MarkStatus = (typeof MARK_STATUSES)[number]

export const MARK_STATUS_LABELS: Record<MarkStatus, string> = {
  to_ask: 'To ask',
  asked: 'Asked',
  received: 'Received',
}

/** A missing key (one open mark of each per garage) or the team's own. */
export type MarkKind = MissingKey | 'custom'

export function isMarkKind(value: unknown): value is MarkKind {
  return value === 'custom' || isMissingKey(value)
}

/** Column sizes and request limits, the same on the server. */
export const MARK_LIMITS = {
  labelMax: 60,
  noteMax: 500,
  /** Garages in one POST /admin/onboarding-marks/asked. */
  askedGaragesMax: 50,
} as const

/** A mark asked more than this many days ago turns amber: time to chase. */
export const MARK_CHASE_AFTER_DAYS = 2

/**
 * The "Add a mark" picks. Two are a missing key's own mark (one open per
 * garage, and Ask on WhatsApp moves the same one to Asked); the rest are
 * custom marks with this label.
 */
export const MARK_PRESETS: ReadonlyArray<{ label: string; kind: MarkKind }> = [
  { label: 'Ask for radius', kind: 'radius_default' },
  { label: 'Call back', kind: 'custom' },
  { label: 'Waiting on owner', kind: 'custom' },
  { label: 'Visit the shop', kind: 'custom' },
  { label: 'Send the agreement', kind: 'custom' },
  { label: 'Ask for payout details', kind: 'payout' },
]

/**
 * What a mark is called: its own label when it has one, else its missing
 * key's label. A custom mark always has a label (a CHECK); 'Mark' only
 * covers a bad row.
 */
export function markLabel(kind: MarkKind, label: string | null | undefined): string {
  const own = label?.trim()
  if (own) return own
  return kind === 'custom' ? 'Mark' : MISSING_LABELS[kind]
}

// ─── Collection lists ────────────────────────────────────────────────────────

export const COLLECTION_ITEM_STATUSES = ['to_collect', 'collected'] as const
export type CollectionItemStatus = (typeof COLLECTION_ITEM_STATUSES)[number]

export const COLLECTION_LIMITS = {
  labelMax: 80,
  noteMax: 500,
  /** Garages on one list. */
  garagesPerList: 50,
} as const

/**
 * Whether an item is done: collected by the teammate, or cleared (the
 * garage no longer misses that thing, whoever saved it). A custom item is
 * never cleared.
 */
export function collectionItemDone(item: { status: CollectionItemStatus; cleared: boolean }): boolean {
  return item.status === 'collected' || item.cleared
}

/** Progress = (collected or cleared) / total. */
export function collectionProgress(
  items: ReadonlyArray<{ status: CollectionItemStatus; cleared: boolean }>
): { done: number; total: number } {
  return { done: items.filter(collectionItemDone).length, total: items.length }
}
