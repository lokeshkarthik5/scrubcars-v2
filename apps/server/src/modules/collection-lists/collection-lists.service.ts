import type { AdminActor } from '../../lib/admin-actor.js'
import { AppError } from '../../lib/errors.js'
import { logger } from '../../lib/logger.js'
import { garageAreaName } from '../../lib/localities.js'
import { sendOpsAlertNow } from '../../lib/ops-alerts.js'
import { outsideServiceCity } from '../../lib/service-city.js'
import {
  MISSING_KEYS,
  markLabel,
  type MarkKind,
  type MissingKey,
} from '../../lib/vendor-missing.js'
import { adminLoginsRepository } from '../admin-logins/admin-logins.repository.js'
import { onboardingMarksService } from '../onboarding-marks/onboarding-marks.service.js'
import {
  collectionListsRepository,
  type CollectionItemRecord,
  type CollectionListRecord,
  type NewCollectionList,
} from './collection-lists.repository.js'
import {
  COLLECTION_LIMITS,
  collectionListOpen,
  collectionMapsUrl,
  collectionProgress,
  dedupeGarages,
  itemCleared,
} from './collection-lists.rules.js'
import type {
  CreateCollectionListsInput,
  ListCollectionListsQuery,
  UpdateCollectionItemInput,
} from './collection-lists.validation.js'

const log = logger.child({ module: 'collection-lists' })

/** CollectionItem (packages/core/src/api/admin-collection.ts). */
function toItem(
  row: CollectionItemRecord,
  missing: readonly MissingKey[] | undefined
) {
  return {
    id: row.id,
    listId: row.listId,
    vendorId: row.vendorId,
    kind: row.kind as MarkKind,
    label: markLabel(row.kind, row.label),
    status: row.status,
    collectedAt: row.collectedAt?.toISOString() ?? null,
    collectedByName: row.collectedByName,
    note: row.note,
    cleared: itemCleared(row.kind, missing),
  }
}

type CollectionItemResponse = ReturnType<typeof toItem>

/** Missing keys in their own order, custom last. */
const kindOrder = (kind: string) => {
  const at = (MISSING_KEYS as readonly string[]).indexOf(kind)
  return at === -1 ? MISSING_KEYS.length : at
}

function listNotFound() {
  return new AppError(
    404,
    'That collection list does not exist',
    'COLLECTION_LIST_NOT_FOUND'
  )
}

/**
 * Stamps `closed_at` on lists found finished (every item collected or
 * cleared), so they leave the unclosed reads for good. Lazy: done when a
 * read or a tick finds them so. Never fails the read that found them.
 */
async function closeFinished(ids: string[], now: Date): Promise<boolean> {
  if (ids.length === 0) return true
  try {
    await collectionListsRepository.closeFinished(ids, now)
    log.info({ lists: ids.length }, 'collection-lists:finished')
    return true
  } catch (error) {
    log.warn(
      { err: error, lists: ids },
      'collection-lists:close_finished_failed'
    )
    return false
  }
}

/**
 * Lists as the panel reads them: items with "cleared" worked out from the
 * garages' live missing keys, a brief per garage, progress and open. A
 * handful of grouped reads for any number of lists. A list found finished
 * but not closed is closed now (closeFinished).
 */
async function assemble(
  lists: readonly CollectionListRecord[],
  now = new Date()
) {
  const items = await collectionListsRepository.listItems(
    lists.map((l) => l.id)
  )
  const vendorIds = [...new Set(items.map((item) => item.vendorId))]
  const [briefs, missing] = await Promise.all([
    collectionListsRepository.listGarageBriefs(vendorIds),
    onboardingMarksService.missingFor(vendorIds),
  ])
  const briefById = new Map(briefs.map((b) => [b.id, b]))
  const itemsByList = new Map<string, CollectionItemRecord[]>()
  for (const item of items) {
    const list = itemsByList.get(item.listId) ?? []
    list.push(item)
    itemsByList.set(item.listId, list)
  }

  const assembled = lists.map((list) => {
    const own = itemsByList.get(list.id) ?? []
    // The garages by name, each one's things in MISSING_KEYS order: the
    // items carry no order of their own.
    const garageIds = [...new Set(own.map((item) => item.vendorId))].sort(
      (a, b) =>
        (briefById.get(a)?.businessName ?? '').localeCompare(
          briefById.get(b)?.businessName ?? ''
        )
    )
    const position = new Map(garageIds.map((id, index) => [id, index]))
    const sorted = [...own].sort(
      (a, b) =>
        position.get(a.vendorId)! - position.get(b.vendorId)! ||
        kindOrder(a.kind) - kindOrder(b.kind) ||
        markLabel(a.kind, a.label).localeCompare(markLabel(b.kind, b.label))
    )
    const listItems = sorted.map((item) =>
      toItem(item, missing.get(item.vendorId))
    )
    return {
      id: list.id,
      assigneeLoginId: list.assigneeLoginId,
      assigneeName: list.assigneeName,
      dueOn: list.dueOn,
      note: list.note,
      createdByName: list.createdByName,
      createdAt: list.createdAt.toISOString(),
      telegramSentAt: list.telegramSentAt?.toISOString() ?? null,
      closedAt: list.closedAt?.toISOString() ?? null,
      open: collectionListOpen(list.closedAt, listItems),
      progress: collectionProgress(listItems),
      garages: garageIds.flatMap((id) => {
        const brief = briefById.get(id)
        if (!brief) return []
        return [
          {
            id: brief.id,
            businessName: brief.businessName,
            address: brief.address,
            city: brief.city,
            // The neighbourhood ("Adyar"), else the city: the Garages
            // list's own area (lib/localities.ts, a twin of core's).
            area: garageAreaName({
              ...brief,
              outsideServiceCity: outsideServiceCity(brief),
            }),
            ownerName: brief.ownerName ?? null,
            ownerPhone: brief.ownerPhone ?? null,
            mapsUrl: collectionMapsUrl(brief),
          },
        ]
      }),
      items: listItems,
    }
  })

  const finished = assembled.filter((list) => !list.closedAt && !list.open)
  if (
    finished.length > 0 &&
    (await closeFinished(
      finished.map((l) => l.id),
      now
    ))
  ) {
    const at = now.toISOString()
    for (const list of finished) list.closedAt = at
  }
  return assembled
}

export type CollectionListResponse = Awaited<
  ReturnType<typeof assemble>
>[number]

/**
 * Posts a list to the team's Telegram group, where alerts are on
 * (production). True only when every part went out. Never throws: a failed
 * post leaves `telegram_sent_at` empty and the list as made.
 */
async function postToTelegram(list: CollectionListResponse): Promise<boolean> {
  try {
    const outcome = await sendOpsAlertNow({
      kind: 'collection_list',
      list: {
        id: list.id,
        assigneeName: list.assigneeName,
        createdByName: list.createdByName,
        dueOn: list.dueOn,
        note: list.note,
        garages: list.garages.map((garage) => ({
          businessName: garage.businessName,
          area: garage.area,
          ownerName: garage.ownerName,
          ownerPhone: garage.ownerPhone,
          mapsUrl: garage.mapsUrl,
          items: list.items
            .filter((item) => item.vendorId === garage.id)
            .map((item) => item.label),
        })),
      },
    })
    return outcome === 'sent'
  } catch (error) {
    log.warn(
      { err: error, listId: list.id },
      'collection-lists:telegram_failed'
    )
    return false
  }
}

export const collectionListsService = {
  /**
   * Send to team: every list and its items in one transaction, then each
   * posted to Telegram when asked (a failed post never fails this).
   */
  async create(input: CreateCollectionListsInput, now = new Date()) {
    const lists = input.lists.map((list) => ({
      ...list,
      garages: dedupeGarages(list.garages),
    }))
    for (const list of lists) {
      if (list.garages.length === 0) {
        throw new AppError(
          400,
          'Pick at least one thing to collect',
          'COLLECTION_LIST_EMPTY'
        )
      }
      if (list.garages.length > COLLECTION_LIMITS.garagesPerList) {
        throw new AppError(
          400,
          `A list holds at most ${COLLECTION_LIMITS.garagesPerList} garages`,
          'COLLECTION_LIST_TOO_LONG'
        )
      }
    }

    const vendorIds = [
      ...new Set(lists.flatMap((l) => l.garages.map((g) => g.vendorId))),
    ]
    const garages = new Map(
      (await collectionListsRepository.findGarages(vendorIds)).map((g) => [
        g.id,
        g,
      ])
    )
    for (const id of vendorIds) {
      const garage = garages.get(id)
      if (!garage || garage.purgedAt)
        throw new AppError(404, 'Vendor not found', 'VENDOR_NOT_FOUND')
      if (garage.deletedAt) {
        throw new AppError(
          409,
          'This garage is in the Bin. Restore it to change it.',
          'VENDOR_IN_BIN'
        )
      }
    }

    // The assignee's name as it is now: the list keeps saying who if the
    // login is renamed or removed.
    const rows: NewCollectionList[] = []
    for (const list of lists) {
      let assigneeName = list.assigneeName
      if (list.assigneeLoginId) {
        const login = await adminLoginsRepository.findSession(
          list.assigneeLoginId
        )
        if (!login) {
          throw new AppError(
            404,
            'That login does not exist',
            'ADMIN_LOGIN_NOT_FOUND'
          )
        }
        // A login that is turned off can't sign in to see its list.
        if (login.status === 'off') {
          throw new AppError(
            409,
            `${login.name}'s login is turned off. Turn it on in Settings → Team logins, or pick someone else.`,
            'ADMIN_LOGIN_OFF'
          )
        }
        assigneeName = login.name
      }
      rows.push({
        list: {
          assigneeLoginId: list.assigneeLoginId ?? null,
          assigneeName,
          dueOn: list.dueOn ?? null,
          note: list.note ?? null,
          createdByName: input.actorName,
          createdAt: now,
        },
        items: list.garages.flatMap((garage) =>
          garage.kinds.map((kind) => ({
            vendorId: garage.vendorId,
            kind,
            label: null,
          }))
        ),
      })
    }

    const ids = await collectionListsRepository.createLists(rows)
    const made = await collectionListsService.byIds(ids)
    log.info(
      { lists: ids.length, garages: vendorIds.length },
      'collection-lists:created'
    )

    if (!input.sendTelegram) return { lists: made }
    const out: CollectionListResponse[] = []
    for (const list of made) {
      if (await postToTelegram(list)) {
        const at = new Date()
        await collectionListsRepository.setTelegramSent(list.id, at)
        out.push({ ...list, telegramSentAt: at.toISOString() })
      } else {
        out.push(list)
      }
    }
    return { lists: out }
  },

  /** Lists by id, in the order given. */
  async byIds(ids: string[]) {
    const rows = await collectionListsRepository.listByIds(ids)
    const byId = new Map(rows.map((row) => [row.id, row]))
    return assemble(ids.flatMap((id) => (byId.has(id) ? [byId.get(id)!] : [])))
  },

  /**
   * `mine`: the signed-in login's lists; none for the shared env login or a
   * member admin, who have no login row. `open`: lists not closed with
   * something left to do; otherwise the closed or finished ones (the latest
   * 50). Newest first. Reading the unclosed lists closes the finished ones
   * (assemble), so they are read again among the closed.
   */
  async list(actor: AdminActor, query: ListCollectionListsQuery) {
    if (query.scope === 'mine' && !actor.loginId) return { lists: [] }
    const loginId = query.scope === 'mine' ? actor.loginId! : undefined
    const unclosed = await assemble(
      await collectionListsRepository.listUnclosed(loginId)
    )
    if (query.open) return { lists: unclosed.filter((list) => list.open) }
    const closed = await assemble(
      await collectionListsRepository.listClosed(
        COLLECTION_LIMITS.closedListed,
        loginId
      )
    )
    // A finished list whose closing failed is still listed, once.
    const closedIds = new Set(closed.map((list) => list.id))
    const finished = unclosed.filter(
      (list) => !list.open && !closedIds.has(list.id)
    )
    const lists = [...finished, ...closed].sort((a, b) =>
      b.createdAt.localeCompare(a.createdAt)
    )
    return { lists }
  },

  /**
   * Tick or untick, with an optional note. Not on a closed list. A tick that
   * leaves nothing to do on its list closes the list.
   */
  async updateItem(
    id: string,
    input: UpdateCollectionItemInput,
    now = new Date()
  ): Promise<CollectionItemResponse> {
    const found = await collectionListsRepository.findItem(id)
    if (!found) {
      throw new AppError(
        404,
        'That item does not exist',
        'COLLECTION_ITEM_NOT_FOUND'
      )
    }
    if (found.closedAt) {
      throw new AppError(409, 'This list is closed.', 'COLLECTION_LIST_CLOSED')
    }
    const statusChanged = input.status !== found.item.status
    const row = await collectionListsRepository.updateItem(id, {
      ...(statusChanged &&
        (input.status === 'collected'
          ? {
              status: 'collected' as const,
              collectedAt: now,
              collectedByName: input.actorName,
            }
          : {
              status: 'to_collect' as const,
              collectedAt: null,
              collectedByName: null,
            })),
      ...(input.note !== undefined && { note: input.note }),
    })
    if (!row)
      throw new AppError(
        404,
        'That item does not exist',
        'COLLECTION_ITEM_NOT_FOUND'
      )
    if (input.status === 'collected') {
      const items = await collectionListsRepository.listItems([row.listId])
      const missing = await onboardingMarksService.missingFor([
        ...new Set(items.map((item) => item.vendorId)),
      ])
      const done = items.map((item) => ({
        status: item.status,
        cleared: itemCleared(item.kind, missing.get(item.vendorId)),
      }))
      if (!collectionListOpen(null, done)) {
        await closeFinished([row.listId], now)
      }
      return toItem(row, missing.get(row.vendorId))
    }
    const missing = await onboardingMarksService.missingFor([row.vendorId])
    return toItem(row, missing.get(row.vendorId))
  },

  async close(id: string, now = new Date()) {
    const [list] = await collectionListsRepository.listByIds([id])
    if (!list) throw listNotFound()
    await collectionListsRepository.close(id, now)
    const [closed] = await collectionListsService.byIds([id])
    if (!closed) throw listNotFound()
    log.info({ listId: id }, 'collection-lists:closed')
    return closed
  },

  /**
   * Each garage's place on an open list, for the Garages list: among the
   * open lists where the garage still has something to collect, the one due
   * first (no due date last; the newest on a tie). done and total are that
   * list's items for the garage only, done = collected or cleared. A garage
   * with nothing left on any list has no entry. `missing` is the list's own
   * missing keys per garage, so nothing is read twice. Lists found finished
   * are closed here too (closeFinished), so this read stops growing.
   */
  async openCollectionByVendor(
    missing: ReadonlyMap<string, readonly MissingKey[]>,
    now = new Date()
  ) {
    const rows = await collectionListsRepository.listUnclosedItems()
    const withDone = rows.map((row) => ({
      ...row,
      done:
        row.status === 'collected' ||
        itemCleared(row.kind, missing.get(row.vendorId)),
    }))

    const finished = new Map<string, boolean>()
    for (const row of withDone) {
      finished.set(row.listId, (finished.get(row.listId) ?? true) && row.done)
    }
    await closeFinished(
      [...finished.entries()].filter(([, done]) => done).map(([id]) => id),
      now
    )

    type Entry = {
      listId: string
      assigneeName: string
      dueOn: string | null
      createdAt: Date
      done: number
      total: number
    }
    // Per garage, its items on each list.
    const byVendor = new Map<string, Map<string, Entry>>()
    for (const row of withDone) {
      const lists = byVendor.get(row.vendorId) ?? new Map<string, Entry>()
      const entry = lists.get(row.listId) ?? {
        listId: row.listId,
        assigneeName: row.assigneeName,
        dueOn: row.dueOn,
        createdAt: row.createdAt,
        done: 0,
        total: 0,
      }
      entry.total += 1
      if (row.done) entry.done += 1
      lists.set(row.listId, entry)
      byVendor.set(row.vendorId, lists)
    }

    const dueFirst = (a: Entry, b: Entry) =>
      (a.dueOn === null ? 1 : 0) - (b.dueOn === null ? 1 : 0) ||
      (a.dueOn ?? '').localeCompare(b.dueOn ?? '') ||
      b.createdAt.getTime() - a.createdAt.getTime() ||
      b.listId.localeCompare(a.listId)

    const out = new Map<
      string,
      {
        listId: string
        assigneeName: string
        dueOn: string | null
        done: number
        total: number
      }
    >()
    for (const [vendorId, lists] of byVendor) {
      const [first] = [...lists.values()]
        .filter((entry) => entry.done < entry.total)
        .sort(dueFirst)
      if (!first) continue
      out.set(vendorId, {
        listId: first.listId,
        assigneeName: first.assigneeName,
        dueOn: first.dueOn,
        done: first.done,
        total: first.total,
      })
    }
    return out
  },
}
