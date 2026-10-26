import type { AdminActor } from '../../lib/admin-actor.js'
import { AppError } from '../../lib/errors.js'
import { logger } from '../../lib/logger.js'
import { sendOpsAlertNow } from '../../lib/ops-alerts.js'
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
 * Lists as the panel reads them: items with "cleared" worked out from the
 * garages' live missing keys, a brief per garage, progress and open. A
 * handful of grouped reads for any number of lists.
 */
async function assemble(lists: readonly CollectionListRecord[]) {
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

  return lists.map((list) => {
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
            ownerName: brief.ownerName ?? null,
            ownerPhone: brief.ownerPhone ?? null,
            mapsUrl: collectionMapsUrl(brief),
          },
        ]
      }),
      items: listItems,
    }
  })
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
          area: garage.city,
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
   * 50 closed). Newest first.
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
    const finished = unclosed.filter((list) => !list.open)
    const lists = [...finished, ...closed].sort((a, b) =>
      b.createdAt.localeCompare(a.createdAt)
    )
    return { lists }
  },

  /** Tick or untick, with an optional note. Not on a closed list. */
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
   * Each garage's place on an open list, for the Garages list: that list's
   * items for the garage only, done = collected or cleared. On two open
   * lists, the newest. `missing` is the list's own missing keys per garage,
   * so nothing is read twice.
   */
  async openCollectionByVendor(
    missing: ReadonlyMap<string, readonly MissingKey[]>
  ) {
    const rows = await collectionListsRepository.listUnclosedItems()
    const withDone = rows.map((row) => ({
      ...row,
      cleared: itemCleared(row.kind, missing.get(row.vendorId)),
    }))
    const byList = new Map<string, typeof withDone>()
    for (const row of withDone) {
      const list = byList.get(row.listId) ?? []
      list.push(row)
      byList.set(row.listId, list)
    }
    const open = new Set(
      [...byList.entries()]
        .filter(([, items]) => collectionListOpen(null, items))
        .map(([listId]) => listId)
    )
    const newestFirst = withDone
      .filter((row) => open.has(row.listId))
      .sort(
        (a, b) =>
          b.createdAt.getTime() - a.createdAt.getTime() ||
          b.listId.localeCompare(a.listId)
      )
    const byVendor = new Map<
      string,
      {
        listId: string
        assigneeName: string
        dueOn: string | null
        done: number
        total: number
      }
    >()
    for (const row of newestFirst) {
      const current = byVendor.get(row.vendorId)
      if (current && current.listId !== row.listId) continue
      const entry = current ?? {
        listId: row.listId,
        assigneeName: row.assigneeName,
        dueOn: row.dueOn,
        done: 0,
        total: 0,
      }
      entry.total += 1
      if (row.status === 'collected' || row.cleared) entry.done += 1
      byVendor.set(row.vendorId, entry)
    }
    return byVendor
  },
}
