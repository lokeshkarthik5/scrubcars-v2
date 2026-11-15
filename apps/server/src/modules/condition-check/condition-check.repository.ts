import { and, asc, eq, isNull, sql } from 'drizzle-orm'
import { db } from '../../db/index.js'
import { bookings, conditionChecks, conditionMarks, jobPhotos } from '../../db/schema.js'
import type { ConditionAnswer, ConditionRead, DamageKind, MarkBox, MarkSource } from '../../lib/condition-check.js'
import type { JobPhotoStage } from '../../lib/job-records.js'

export type ConditionMarkRecord = typeof conditionMarks.$inferSelect
export type ConditionCheckRecord = typeof conditionChecks.$inferSelect

/**
 * The per-job lock the job photos take for every count-then-write
 * (job-photos.repository), so sending the check and removing a photo can
 * never cross. Only ever taken on its own, never alongside the
 * booking-write locks.
 */
function lockJob(tx: Pick<typeof db, 'execute'>, bookingId: string) {
  return tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`job-photos:${bookingId}`})::bigint)`)
}

/** The check has not been sent: before marks can still change. */
function notSent(bookingId: string) {
  return sql`not exists (select 1 from ${conditionChecks} where ${conditionChecks.bookingId} = ${bookingId})`
}

export interface NewMark {
  kind: DamageKind
  part: string
  box: MarkBox | null
  unsure: boolean
}

export const conditionCheckRepository = {
  /** The facts the check's rules need about a job, and whose job it is. */
  async findJob(bookingId: string) {
    const [row] = await db
      .select({
        id: bookings.id,
        vendorId: bookings.vendorId,
        userId: bookings.userId,
        status: bookings.status,
        bookingType: bookings.bookingType,
        photosWaivedAt: bookings.photosWaivedAt,
      })
      .from(bookings)
      .where(eq(bookings.id, bookingId))
      .limit(1)
    return row ?? null
  },

  /** The job's photos, oldest first: both sides', as the views read them. */
  listPhotos(bookingId: string) {
    return db
      .select({
        id: jobPhotos.id,
        stage: jobPhotos.stage,
        angle: jobPhotos.angle,
        uploadedByRole: jobPhotos.uploadedByRole,
        url: jobPhotos.url,
        storageKey: jobPhotos.storageKey,
        conditionRead: jobPhotos.conditionRead,
        createdAt: jobPhotos.createdAt,
      })
      .from(jobPhotos)
      .where(eq(jobPhotos.bookingId, bookingId))
      .orderBy(asc(jobPhotos.createdAt), asc(jobPhotos.id))
  },

  async findCheck(bookingId: string) {
    const [row] = await db.select().from(conditionChecks).where(eq(conditionChecks.bookingId, bookingId)).limit(1)
    return row ?? null
  },

  listMarks(bookingId: string) {
    return db
      .select()
      .from(conditionMarks)
      .where(eq(conditionMarks.bookingId, bookingId))
      .orderBy(asc(conditionMarks.createdAt), asc(conditionMarks.id))
  },

  async findMark(bookingId: string, markId: string) {
    const [row] = await db
      .select()
      .from(conditionMarks)
      .where(and(eq(conditionMarks.bookingId, bookingId), eq(conditionMarks.id, markId)))
      .limit(1)
    return row ?? null
  },

  /**
   * Detlio's reading of one photo: the photo is marked read and its marks
   * written together, only if nobody read it first (a second phone, a
   * retried request). A before photo's marks only while the check is not
   * sent. False when it was not written.
   */
  saveReading(input: {
    bookingId: string
    photoId: string
    stage: JobPhotoStage
    comparedPhotoId: string | null
    marks: readonly NewMark[]
    at: Date
  }): Promise<boolean> {
    return db.transaction(async (tx) => {
      const [read] = await tx
        .update(jobPhotos)
        .set({ conditionRead: 'done' satisfies ConditionRead, conditionReadAt: input.at })
        .where(
          and(
            eq(jobPhotos.id, input.photoId),
            eq(jobPhotos.bookingId, input.bookingId),
            isNull(jobPhotos.conditionRead),
            input.stage === 'before' ? notSent(input.bookingId) : sql`true`
          )
        )
        .returning({ id: jobPhotos.id })
      if (!read) return false
      if (input.marks.length > 0) {
        await tx.insert(conditionMarks).values(
          input.marks.map((mark) => ({
            bookingId: input.bookingId,
            photoId: input.photoId,
            comparedPhotoId: input.comparedPhotoId,
            stage: input.stage,
            kind: mark.kind,
            part: mark.part,
            boxX: mark.box?.x ?? null,
            boxY: mark.box?.y ?? null,
            boxW: mark.box?.w ?? null,
            boxH: mark.box?.h ?? null,
            source: 'ai' as MarkSource,
            unsure: mark.unsure,
          }))
        )
      }
      return true
    })
  },

  /** Detlio could not read the photo: it stands without marks. */
  async markReadFailed(bookingId: string, photoId: string, at: Date) {
    await db
      .update(jobPhotos)
      .set({ conditionRead: 'failed' satisfies ConditionRead, conditionReadAt: at })
      .where(and(eq(jobPhotos.id, photoId), eq(jobPhotos.bookingId, bookingId), isNull(jobPhotos.conditionRead)))
  },

  /**
   * A mark the garage adds to a before photo, while the check is not sent
   * (checked under the per-job lock Send takes). Null once it is sent.
   */
  insertGarageMark(input: { bookingId: string; photoId: string; kind: DamageKind; part: string }) {
    return db.transaction(async (tx) => {
      await lockJob(tx, input.bookingId)
      const [sent] = await tx
        .select({ bookingId: conditionChecks.bookingId })
        .from(conditionChecks)
        .where(eq(conditionChecks.bookingId, input.bookingId))
        .limit(1)
      if (sent) return null
      const [row] = await tx
        .insert(conditionMarks)
        .values({
          bookingId: input.bookingId,
          photoId: input.photoId,
          stage: 'before',
          kind: input.kind,
          part: input.part,
          source: 'garage' as MarkSource,
        })
        .returning()
      return row ?? null
    })
  },

  /**
   * Removes a before mark as wrong, or puts it back (Undo), only while the
   * check is not sent. Null when nothing changed.
   */
  async setRemoved(bookingId: string, markId: string, removedAt: Date | null) {
    const [row] = await db
      .update(conditionMarks)
      .set({ removedAt })
      .where(
        and(
          eq(conditionMarks.bookingId, bookingId),
          eq(conditionMarks.id, markId),
          eq(conditionMarks.stage, 'before'),
          notSent(bookingId)
        )
      )
      .returning()
    return row ?? null
  },

  /**
   * Sends the before check: one row, once. Counted under the per-job photo
   * lock, so a photo removed at the same moment cannot slip under the
   * angles `enough` asks for. 'short' when it no longer has them; null when
   * it was already sent.
   */
  send(
    bookingId: string,
    sentBy: string,
    at: Date,
    enough: (photos: Array<{ id: string; stage: JobPhotoStage; angle: string | null; uploadedByRole: string; createdAt: Date }>) => boolean
  ): Promise<ConditionCheckRecord | 'short' | null> {
    return db.transaction(async (tx) => {
      await lockJob(tx, bookingId)
      const photos = await tx
        .select({
          id: jobPhotos.id,
          stage: jobPhotos.stage,
          angle: jobPhotos.angle,
          uploadedByRole: jobPhotos.uploadedByRole,
          createdAt: jobPhotos.createdAt,
        })
        .from(jobPhotos)
        .where(eq(jobPhotos.bookingId, bookingId))
      if (!enough(photos)) return 'short'
      const [row] = await tx
        .insert(conditionChecks)
        .values({ bookingId, sentAt: at, sentBy })
        .onConflictDoNothing({ target: conditionChecks.bookingId })
        .returning()
      return row ?? null
    })
  },

  /** The customer's answer, once. Null when it was already answered. */
  async answer(input: {
    bookingId: string
    userId: string
    answer: ConditionAnswer
    note: string | null
    at: Date
  }) {
    const [row] = await db
      .update(conditionChecks)
      .set({
        customerAnswer: input.answer,
        customerAnsweredAt: input.at,
        customerAnsweredBy: input.userId,
        customerNote: input.answer === 'something_wrong' ? input.note : null,
      })
      .where(and(eq(conditionChecks.bookingId, input.bookingId), isNull(conditionChecks.customerAnswer)))
      .returning()
    return row ?? null
  },

  /** The garage's "It was there" on a possible new mark, once. */
  async garageWasThere(bookingId: string, markId: string, at: Date) {
    const [row] = await db
      .update(conditionMarks)
      .set({ garageAnswer: 'was_there', garageAnsweredAt: at })
      .where(
        and(
          eq(conditionMarks.bookingId, bookingId),
          eq(conditionMarks.id, markId),
          eq(conditionMarks.stage, 'after'),
          isNull(conditionMarks.garageAnswer)
        )
      )
      .returning()
    return row ?? null
  },

  /** The customer's "It was already there" on a possible new mark, once. */
  async customerAlreadyThere(bookingId: string, markId: string, at: Date) {
    const [row] = await db
      .update(conditionMarks)
      .set({ customerAnswer: 'already_there', customerAnsweredAt: at })
      .where(
        and(
          eq(conditionMarks.bookingId, bookingId),
          eq(conditionMarks.id, markId),
          eq(conditionMarks.stage, 'after'),
          isNull(conditionMarks.customerAnswer)
        )
      )
      .returning()
    return row ?? null
  },
}
