import { and, asc, eq, inArray, sql } from 'drizzle-orm'
import { db } from '../../db/index.js'
import { serviceImages, services, users } from '../../db/schema.js'

export type ServiceMediaRecord = typeof serviceImages.$inferSelect
type ServiceMediaInsert = typeof serviceImages.$inferInsert

/** Why a guarded insert wrote nothing. */
export type MediaInsertRefusal = 'limit' | 'has_real_media'

export const serviceMediaRepository = {
  /** A service (or package) by id, with the fields media rules need. */
  findService(serviceId: string) {
    return db.query.services.findFirst({
      where: eq(services.id, serviceId),
      columns: { id: true, vendorId: true, name: true, category: true },
    })
  },

  listMedia(serviceId: string) {
    return db.query.serviceImages.findMany({
      where: eq(serviceImages.serviceId, serviceId),
      orderBy: [asc(serviceImages.sortOrder), asc(serviceImages.createdAt)],
    })
  },

  findMedia(serviceId: string, mediaId: string) {
    return db.query.serviceImages.findFirst({
      where: and(eq(serviceImages.id, mediaId), eq(serviceImages.serviceId, serviceId)),
    })
  },

  findMediaByVideoUid(uid: string) {
    return db.query.serviceImages.findFirst({
      where: eq(serviceImages.videoUid, uid),
    })
  },

  /**
   * Insert one photo or video if the service has room for it, under a lock
   * on the service's media so two uploads at the same moment cannot both
   * take the last place.
   *
   * `countIds` are the rows that count against `max`, worked out by the
   * caller from the same rows; they are re-read here under the lock, so a row
   * added in between is counted. In the same transaction, `removeIds` are
   * deleted first (a failed video being replaced, AI samples a real photo
   * supersedes) and returned, so the caller can remove their files after the
   * commit.
   *
   * The lock is a transaction-scoped advisory lock keyed on the service,
   * taken on its own and never alongside the booking-write locks, so it sits
   * outside their order (like job-photos').
   */
  insertMediaUnderLimit(input: {
    serviceId: string
    values: Omit<ServiceMediaInsert, 'serviceId' | 'sortOrder'>
    /** Whether a row counts against the limit. */
    counts: (row: ServiceMediaRecord) => boolean
    max: number
    /** Rows to delete in the same transaction, if the insert goes ahead. */
    remove: (row: ServiceMediaRecord) => boolean
    /** Refuse if any row matches (an AI sample once a real photo exists). */
    refuseIf?: (row: ServiceMediaRecord) => boolean
  }): Promise<
    | { created: ServiceMediaRecord; removed: ServiceMediaRecord[] }
    | { created: null; refusal: MediaInsertRefusal }
  > {
    return db.transaction(async (tx) => {
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtext(${`service-media:${input.serviceId}`})::bigint)`
      )

      const rows = await tx
        .select()
        .from(serviceImages)
        .where(eq(serviceImages.serviceId, input.serviceId))

      if (input.refuseIf && rows.some(input.refuseIf)) {
        return { created: null, refusal: 'has_real_media' as const }
      }
      if (rows.filter(input.counts).length >= input.max) {
        return { created: null, refusal: 'limit' as const }
      }

      const removeIds = rows.filter(input.remove).map((row) => row.id)
      const removed =
        removeIds.length > 0
          ? await tx
              .delete(serviceImages)
              .where(
                and(
                  eq(serviceImages.serviceId, input.serviceId),
                  inArray(serviceImages.id, removeIds)
                )
              )
              .returning()
          : []

      const nextOrder =
        rows
          .filter((row) => !removeIds.includes(row.id))
          .reduce((max, row) => Math.max(max, row.sortOrder), -1) + 1

      const [created] = await tx
        .insert(serviceImages)
        .values({ ...input.values, serviceId: input.serviceId, sortOrder: nextOrder })
        .returning()

      return { created, removed }
    })
  },

  /**
   * Record what Stream said about a video, only while it is still
   * processing: the webhook and the status poll can both arrive, and a
   * video already ready or failed is not moved again by a late answer.
   *
   * If it moved, `remove` rows of the same service are deleted in the same
   * transaction and returned (a ready video takes the place of the one it
   * replaced), under the same per-service lock as insertMediaUnderLimit, so
   * an upload starting at that moment sees either the old video or the new
   * one, never both or neither.
   */
  settleVideo(input: {
    serviceId: string
    id: string
    patch: Pick<ServiceMediaInsert, 'videoStatus' | 'videoError' | 'durationSecs' | 'posterUrl'>
    /** Other rows to delete once this one has moved. */
    remove: (row: ServiceMediaRecord) => boolean
  }): Promise<{ settled: ServiceMediaRecord | null; removed: ServiceMediaRecord[] }> {
    return db.transaction(async (tx) => {
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtext(${`service-media:${input.serviceId}`})::bigint)`
      )

      const [settled] = await tx
        .update(serviceImages)
        .set(input.patch)
        .where(
          and(
            eq(serviceImages.id, input.id),
            eq(serviceImages.serviceId, input.serviceId),
            eq(serviceImages.videoStatus, 'processing')
          )
        )
        .returning()
      if (!settled) return { settled: null, removed: [] }

      const rows = await tx
        .select()
        .from(serviceImages)
        .where(eq(serviceImages.serviceId, input.serviceId))
      const removeIds = rows.filter(input.remove).map((row) => row.id)
      const removed =
        removeIds.length > 0
          ? await tx
              .delete(serviceImages)
              .where(
                and(
                  eq(serviceImages.serviceId, input.serviceId),
                  inArray(serviceImages.id, removeIds)
                )
              )
              .returning()
          : []

      return { settled, removed }
    })
  },

  deleteMedia(serviceId: string, mediaId: string) {
    return db
      .delete(serviceImages)
      .where(and(eq(serviceImages.id, mediaId), eq(serviceImages.serviceId, serviceId)))
      .returning()
  },

  /** An admin's display name, for `uploaded_by`. */
  findUserName(userId: string) {
    return db.query.users.findFirst({
      where: eq(users.id, userId),
      columns: { name: true },
    })
  },
}
