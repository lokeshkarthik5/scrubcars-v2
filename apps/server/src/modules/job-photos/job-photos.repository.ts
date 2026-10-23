import { and, asc, count, eq, sql } from 'drizzle-orm'
import { db } from '../../db/index.js'
import { bookings, jobPhotos } from '../../db/schema.js'
import type { PhotoAngle, PhotoRole } from '../../lib/job-photo-standards.js'
import type { JobPhotoStage } from '../../lib/job-records.js'

export type JobPhotoRecord = typeof jobPhotos.$inferSelect

/** The per-job lock every count-then-write takes, on its own. */
function lockJob(tx: Pick<typeof db, 'execute'>, bookingId: string) {
  return tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`job-photos:${bookingId}`})::bigint)`)
}

export const jobPhotosRepository = {
  /** The facts the photo rules need about a job, and whose job it is. */
  async findJob(bookingId: string) {
    const [row] = await db
      .select({
        id: bookings.id,
        vendorId: bookings.vendorId,
        userId: bookings.userId,
        status: bookings.status,
        acceptedAt: bookings.acceptedAt,
        bookingType: bookings.bookingType,
        scheduledAt: bookings.scheduledAt,
        completedAt: bookings.completedAt,
        pickedUpAt: bookings.pickedUpAt,
        outForDeliveryAt: bookings.outForDeliveryAt,
        photosWaivedAt: bookings.photosWaivedAt,
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

  /** One side's photos of one stage. */
  async countPhotos(bookingId: string, stage: JobPhotoStage, role: PhotoRole) {
    const [row] = await db
      .select({ value: count() })
      .from(jobPhotos)
      .where(
        and(
          eq(jobPhotos.bookingId, bookingId),
          eq(jobPhotos.stage, stage),
          eq(jobPhotos.uploadedByRole, role)
        )
      )
    return row?.value ?? 0
  },

  /** One side's photo: the other side's is not found from here. */
  findPhoto(bookingId: string, photoId: string, role: PhotoRole) {
    return db.query.jobPhotos.findFirst({
      where: and(
        eq(jobPhotos.bookingId, bookingId),
        eq(jobPhotos.id, photoId),
        eq(jobPhotos.uploadedByRole, role)
      ),
    })
  },

  findPhotoByKey(bookingId: string, storageKey: string) {
    return db.query.jobPhotos.findFirst({
      where: and(eq(jobPhotos.bookingId, bookingId), eq(jobPhotos.storageKey, storageKey)),
    })
  },

  /**
   * Records a photo unless that side's stage already holds `max`. Counted
   * and written under a per-job lock, so two phones adding the last photo at
   * the same moment cannot both succeed. The lock is only ever taken on its
   * own, never alongside the booking-write locks, so it sits outside their
   * order. Null when the stage is full.
   */
  insertPhotoUnderCap(
    data: {
      bookingId: string
      stage: JobPhotoStage
      storageKey: string
      url: string
      uploadedBy: string
      uploadedByRole: PhotoRole
      angle: PhotoAngle | null
    },
    max: number
  ) {
    return db.transaction(async (tx) => {
      await lockJob(tx, data.bookingId)

      const [{ value }] = await tx
        .select({ value: count() })
        .from(jobPhotos)
        .where(
          and(
            eq(jobPhotos.bookingId, data.bookingId),
            eq(jobPhotos.stage, data.stage),
            eq(jobPhotos.uploadedByRole, data.uploadedByRole)
          )
        )

      if (value >= max) return null

      const [created] = await tx.insert(jobPhotos).values(data).returning()
      return created
    })
  },

  /**
   * Removes one side's photo. With `keepAtLeast`, only while that side's
   * stage would still hold that many afterwards, counted under the same
   * per-job lock as adding (0045: a gate the job has passed stays passed).
   * 'floor' when it would not; null when there is no such photo.
   */
  deletePhoto(
    bookingId: string,
    photoId: string,
    role: PhotoRole,
    keepAtLeast: number | null
  ): Promise<JobPhotoRecord | 'floor' | null> {
    return db.transaction(async (tx) => {
      await lockJob(tx, bookingId)

      const photo = await tx.query.jobPhotos.findFirst({
        where: and(
          eq(jobPhotos.bookingId, bookingId),
          eq(jobPhotos.id, photoId),
          eq(jobPhotos.uploadedByRole, role)
        ),
      })
      if (!photo) return null

      if (keepAtLeast !== null) {
        const [{ value }] = await tx
          .select({ value: count() })
          .from(jobPhotos)
          .where(
            and(
              eq(jobPhotos.bookingId, bookingId),
              eq(jobPhotos.stage, photo.stage),
              eq(jobPhotos.uploadedByRole, role)
            )
          )
        if (value - 1 < keepAtLeast) return 'floor'
      }

      const [deleted] = await tx
        .delete(jobPhotos)
        .where(and(eq(jobPhotos.bookingId, bookingId), eq(jobPhotos.id, photoId)))
        .returning()
      return deleted ?? null
    })
  },
}
