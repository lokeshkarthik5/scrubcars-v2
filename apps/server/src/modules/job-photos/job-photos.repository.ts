import { and, asc, count, eq, sql } from 'drizzle-orm'
import { db } from '../../db/index.js'
import { bookings, jobPhotos } from '../../db/schema.js'
import type { JobPhotoStage } from '../../lib/job-records.js'

export type JobPhotoRecord = typeof jobPhotos.$inferSelect

export const jobPhotosRepository = {
  /** The facts the photo rules need about a job, and whose job it is. */
  async findJob(bookingId: string) {
    const [row] = await db
      .select({
        id: bookings.id,
        vendorId: bookings.vendorId,
        status: bookings.status,
        scheduledAt: bookings.scheduledAt,
        completedAt: bookings.completedAt,
      })
      .from(bookings)
      .where(eq(bookings.id, bookingId))
      .limit(1)
    return row ?? null
  },

  listPhotos(bookingId: string) {
    return db.query.jobPhotos.findMany({
      where: eq(jobPhotos.bookingId, bookingId),
      orderBy: [asc(jobPhotos.createdAt), asc(jobPhotos.id)],
    })
  },

  async countPhotos(bookingId: string, stage: JobPhotoStage) {
    const [row] = await db
      .select({ value: count() })
      .from(jobPhotos)
      .where(and(eq(jobPhotos.bookingId, bookingId), eq(jobPhotos.stage, stage)))
    return row?.value ?? 0
  },

  findPhoto(bookingId: string, photoId: string) {
    return db.query.jobPhotos.findFirst({
      where: and(eq(jobPhotos.bookingId, bookingId), eq(jobPhotos.id, photoId)),
    })
  },

  findPhotoByKey(bookingId: string, storageKey: string) {
    return db.query.jobPhotos.findFirst({
      where: and(eq(jobPhotos.bookingId, bookingId), eq(jobPhotos.storageKey, storageKey)),
    })
  },

  /**
   * Records a photo unless the stage already holds `max`. Counted and written
   * under a per-job lock, so two phones adding the sixth photo at the same
   * moment cannot both succeed. The lock is only ever taken on its own, never
   * alongside the booking-write locks, so it sits outside their order.
   * Null when the stage is full.
   */
  insertPhotoUnderCap(
    data: {
      bookingId: string
      stage: JobPhotoStage
      storageKey: string
      url: string
      uploadedBy: string
    },
    max: number
  ) {
    return db.transaction(async (tx) => {
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtext(${`job-photos:${data.bookingId}`})::bigint)`
      )

      const [{ value }] = await tx
        .select({ value: count() })
        .from(jobPhotos)
        .where(and(eq(jobPhotos.bookingId, data.bookingId), eq(jobPhotos.stage, data.stage)))

      if (value >= max) return null

      const [created] = await tx.insert(jobPhotos).values(data).returning()
      return created
    })
  },

  deletePhoto(bookingId: string, photoId: string) {
    return db
      .delete(jobPhotos)
      .where(and(eq(jobPhotos.bookingId, bookingId), eq(jobPhotos.id, photoId)))
      .returning()
  },
}
