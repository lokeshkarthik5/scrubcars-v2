import { and, desc, eq, inArray, isNotNull, isNull } from 'drizzle-orm'
import { db } from '../../db/index.js'
import {
  adminAuditLog,
  collectionItems,
  collectionLists,
  users,
  vendors,
} from '../../db/schema.js'

export type CollectionListRecord = typeof collectionLists.$inferSelect
export type CollectionItemRecord = typeof collectionItems.$inferSelect

type ItemPatch = Partial<
  Pick<
    typeof collectionItems.$inferInsert,
    'status' | 'collectedAt' | 'collectedByName' | 'note'
  >
>

export interface NewCollectionList {
  list: Pick<
    typeof collectionLists.$inferInsert,
    | 'assigneeLoginId'
    | 'assigneeName'
    | 'dueOn'
    | 'note'
    | 'createdByName'
    | 'createdAt'
  >
  items: Array<{ vendorId: string; kind: string; label: string | null }>
}

export const collectionListsRepository = {
  findGarages(vendorIds: string[]) {
    if (vendorIds.length === 0) return Promise.resolve([])
    return db
      .select({
        id: vendors.id,
        deletedAt: vendors.deletedAt,
        purgedAt: vendors.purgedAt,
      })
      .from(vendors)
      .where(inArray(vendors.id, vendorIds))
  },

  /** Every list and its items in one transaction; the new lists' ids, in order. */
  async createLists(lists: readonly NewCollectionList[]): Promise<string[]> {
    return db.transaction(async (tx) => {
      const ids: string[] = []
      for (const { list, items } of lists) {
        const [row] = await tx
          .insert(collectionLists)
          .values(list)
          .returning({ id: collectionLists.id })
        await tx
          .insert(collectionItems)
          .values(items.map((item) => ({ ...item, listId: row!.id })))
        ids.push(row!.id)
      }
      return ids
    })
  },

  async setTelegramSent(listId: string, at: Date) {
    await db
      .update(collectionLists)
      .set({ telegramSentAt: at })
      .where(eq(collectionLists.id, listId))
  },

  /** Lists not closed, newest first; only one login's with `assigneeLoginId`. */
  listUnclosed(assigneeLoginId?: string): Promise<CollectionListRecord[]> {
    return db
      .select()
      .from(collectionLists)
      .where(
        and(
          isNull(collectionLists.closedAt),
          assigneeLoginId
            ? eq(collectionLists.assigneeLoginId, assigneeLoginId)
            : undefined
        )
      )
      .orderBy(desc(collectionLists.createdAt), desc(collectionLists.id))
  },

  /** The latest closed lists, newest first. */
  listClosed(
    limit: number,
    assigneeLoginId?: string
  ): Promise<CollectionListRecord[]> {
    return db
      .select()
      .from(collectionLists)
      .where(
        and(
          isNotNull(collectionLists.closedAt),
          assigneeLoginId
            ? eq(collectionLists.assigneeLoginId, assigneeLoginId)
            : undefined
        )
      )
      .orderBy(desc(collectionLists.closedAt), desc(collectionLists.id))
      .limit(limit)
  },

  listByIds(ids: string[]): Promise<CollectionListRecord[]> {
    if (ids.length === 0) return Promise.resolve([])
    return db
      .select()
      .from(collectionLists)
      .where(inArray(collectionLists.id, ids))
  },

  listItems(listIds: string[]): Promise<CollectionItemRecord[]> {
    if (listIds.length === 0) return Promise.resolve([])
    return db
      .select()
      .from(collectionItems)
      .where(inArray(collectionItems.listId, listIds))
  },

  /** Who to call and where to go, for the garages on some lists. */
  listGarageBriefs(vendorIds: string[]) {
    if (vendorIds.length === 0) return Promise.resolve([])
    return db
      .select({
        id: vendors.id,
        businessName: vendors.businessName,
        address: vendors.address,
        city: vendors.city,
        pincode: vendors.pincode,
        mapsUrl: vendors.mapsUrl,
        lat: vendors.lat,
        lng: vendors.lng,
        ownerName: users.name,
        ownerPhone: users.phone,
      })
      .from(vendors)
      .leftJoin(users, eq(users.id, vendors.ownerId))
      .where(inArray(vendors.id, vendorIds))
  },

  /** An item with whether its list is closed. */
  async findItem(id: string) {
    const [row] = await db
      .select({
        item: collectionItems,
        closedAt: collectionLists.closedAt,
      })
      .from(collectionItems)
      .innerJoin(
        collectionLists,
        eq(collectionLists.id, collectionItems.listId)
      )
      .where(eq(collectionItems.id, id))
      .limit(1)
    return row
  },

  async updateItem(
    id: string,
    patch: ItemPatch
  ): Promise<CollectionItemRecord | undefined> {
    const [row] = await db
      .update(collectionItems)
      .set(patch)
      .where(eq(collectionItems.id, id))
      .returning()
    return row
  },

  /** Closes it once; a list already closed keeps when it was. */
  async close(id: string, at: Date) {
    await db
      .update(collectionLists)
      .set({ closedAt: at })
      .where(and(eq(collectionLists.id, id), isNull(collectionLists.closedAt)))
  },

  /**
   * Opens a closed list again (0065), with its audit row; null when it was
   * not closed by then.
   */
  reopen(id: string, actor: { sub: string; name: string }) {
    return db.transaction(async (tx) => {
      const [row] = await tx
        .update(collectionLists)
        .set({ closedAt: null })
        .where(
          and(eq(collectionLists.id, id), isNotNull(collectionLists.closedAt))
        )
        .returning({ id: collectionLists.id })
      if (!row) return null
      await tx.insert(adminAuditLog).values({
        action: 'collection_list_reopened',
        actorSub: actor.sub,
        actorName: actor.name,
        summary: { listId: id },
        detail: {},
      })
      return row
    })
  },

  /**
   * Deletes a list with its items (ON DELETE CASCADE) and an audit row
   * naming who it was for and how many items it held (0065). Null when it
   * was gone already.
   */
  deleteList(id: string, actor: { sub: string; name: string }) {
    return db.transaction(async (tx) => {
      const items = await tx
        .select({ id: collectionItems.id })
        .from(collectionItems)
        .where(eq(collectionItems.listId, id))
      const [row] = await tx
        .delete(collectionLists)
        .where(eq(collectionLists.id, id))
        .returning({
          id: collectionLists.id,
          assigneeName: collectionLists.assigneeName,
          createdAt: collectionLists.createdAt,
        })
      if (!row) return null
      await tx.insert(adminAuditLog).values({
        action: 'collection_list_deleted',
        actorSub: actor.sub,
        actorName: actor.name,
        summary: { listId: id, assignee: row.assigneeName },
        detail: { items: items.length, createdAt: row.createdAt.toISOString() },
      })
      return row
    })
  },

  /**
   * Closes the finished lists among these (every item collected or
   * cleared), when found so; one already closed keeps when it was.
   */
  async closeFinished(ids: string[], at: Date) {
    if (ids.length === 0) return
    await db
      .update(collectionLists)
      .set({ closedAt: at })
      .where(
        and(inArray(collectionLists.id, ids), isNull(collectionLists.closedAt))
      )
  },

  /**
   * Every item on a list not closed, with its list's assignee, due date and
   * age: the Garages list's "With Raga · due 29 Oct · 3/11". One read.
   */
  listUnclosedItems() {
    return db
      .select({
        listId: collectionItems.listId,
        vendorId: collectionItems.vendorId,
        kind: collectionItems.kind,
        status: collectionItems.status,
        assigneeName: collectionLists.assigneeName,
        dueOn: collectionLists.dueOn,
        createdAt: collectionLists.createdAt,
      })
      .from(collectionItems)
      .innerJoin(
        collectionLists,
        eq(collectionLists.id, collectionItems.listId)
      )
      .where(isNull(collectionLists.closedAt))
  },
}
