import { apiClient } from '@repo/core/api/client'
import type { CollectionItemStatus, MarkKind, MissingKey } from '@repo/core/onboarding-marks'
import { signedBody } from './admin-signer'

/**
 * Collection lists (0059, "Send to team"): things one teammate is to collect
 * from a few garages, by a due date. Super-admin only. The routes are new
 * with this release, so the panel treats a 404 as "not there yet".
 */

/** The garage as a collector needs it: who to call and where to go. */
export interface CollectionGarageBrief {
  id: string
  businessName: string
  address: string
  city: string
  ownerName: string | null
  ownerPhone: string | null
  /** The garage's saved Google Maps link, or one built from its pin; null with neither. */
  mapsUrl: string | null
  /** The neighbourhood ("Adyar"), else the city (garageAreaName). Absent from an older API. */
  area?: string
}

export interface CollectionItem {
  id: string
  listId: string
  vendorId: string
  kind: MarkKind
  /** Never empty: its own label, or its missing key's (markLabel). */
  label: string
  status: CollectionItemStatus
  collectedAt: string | null
  collectedByName: string | null
  note: string | null
  /**
   * Worked out, never stored: the garage's live missing keys no longer hold
   * this kind ("saved on the garage"). Always false for 'custom'.
   */
  cleared: boolean
}

export interface CollectionList {
  id: string
  /** Null for a name typed by hand, or after the login was removed. */
  assigneeLoginId: string | null
  assigneeName: string
  /** IST calendar date, YYYY-MM-DD. */
  dueOn: string | null
  note: string | null
  createdByName: string
  createdAt: string
  /** Set when the Telegram post went out; null when off, failed or not production. */
  telegramSentAt: string | null
  /**
   * Set by Close, or by the server once it finds every item collected or
   * cleared (the tick that finishes it, or the next read).
   */
  closedAt: string | null
  /** Until closed, or until every item is collected or cleared. */
  open: boolean
  /** (collected or cleared) / total (collectionProgress). */
  progress: { done: number; total: number }
  /** The list's garages, in the order they were sent. */
  garages: CollectionGarageBrief[]
  /** Every item, grouped by garage in the same order. */
  items: CollectionItem[]
}

export interface CreateCollectionListsInput {
  lists: Array<{
    /** A turned-off login is refused: 409 ADMIN_LOGIN_OFF. */
    assigneeLoginId?: string | null
    assigneeName: string
    /** YYYY-MM-DD. */
    dueOn?: string | null
    /** At most 500 characters. */
    note?: string | null
    /** At most 50 garages per list; each kind once per garage. */
    garages: Array<{ vendorId: string; kinds: MissingKey[] }>
  }>
  /** Post each list to the ops Telegram group (production only). */
  sendTelegram: boolean
}

export interface UpdateCollectionItemInput {
  status: CollectionItemStatus
  note?: string | null
}

/**
 * `mine`: lists assigned to the signed-in login (none for the shared env
 * login, which has no login row). `all`: everyone's.
 */
export type CollectionScope = 'mine' | 'all'

/**
 * POST /admin/collection-lists — the lists as made. A failed Telegram post
 * never fails the request: that list's `telegramSentAt` stays null.
 */
export async function createCollectionLists(input: CreateCollectionListsInput) {
  return apiClient<{ lists: CollectionList[] }>('/admin/collection-lists', {
    method: 'POST',
    body: signedBody(input),
  })
}

/**
 * GET /admin/collection-lists?scope=&open= — `open` true for the open
 * lists, false for the closed or finished ones. Newest first.
 */
export async function listCollectionLists(scope: CollectionScope, open = true) {
  return apiClient<{ lists: CollectionList[] }>('/admin/collection-lists', {
    params: { scope, open },
  })
}

/**
 * PATCH /admin/collection-items/:id — tick or untick, with an optional note.
 * The tick that finishes a list closes it; a closed list's items are 409
 * COLLECTION_LIST_CLOSED.
 */
export async function updateCollectionItem(id: string, input: UpdateCollectionItemInput) {
  return apiClient<CollectionItem>(`/admin/collection-items/${id}`, {
    method: 'PATCH',
    body: signedBody(input),
  })
}

/** POST /admin/collection-lists/:id/close — the list, now closed. */
export async function closeCollectionList(id: string) {
  return apiClient<CollectionList>(`/admin/collection-lists/${id}/close`, {
    method: 'POST',
    body: signedBody({}),
  })
}
