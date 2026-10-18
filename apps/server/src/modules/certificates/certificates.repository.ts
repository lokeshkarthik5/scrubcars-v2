import { and, eq, isNull, sql } from 'drizzle-orm'
import { db } from '../../db/index.js'
import { userVehicles, vehicleCertificateLinks } from '../../db/schema.js'
import type { CertificateCar, CertificatePhoto, CertificateRow } from '../../lib/service-history-certificate.js'

/** A car's bookings are read up to this many rows, as the car's history reads them. */
const HISTORY_ROW_CAP = 1000

const toDate = (value: Date | string): Date => (value instanceof Date ? value : new Date(value))
const toDateOrNull = (value: Date | string | null): Date | null => (value === null ? null : toDate(value))

/** A share link as the service reads it. Never the token: only its hash is stored. */
export interface CertificateLinkRow {
  id: string
  userId: string
  vehicleId: string
  tokenHash: string
  includePhotos: boolean
  createdAt: Date
  expiresAt: Date | null
  revokedAt: Date | null
  lastViewedAt: Date | null
  viewCount: number
}

const LINK_COLUMNS = {
  id: vehicleCertificateLinks.id,
  userId: vehicleCertificateLinks.userId,
  vehicleId: vehicleCertificateLinks.vehicleId,
  tokenHash: vehicleCertificateLinks.tokenHash,
  includePhotos: vehicleCertificateLinks.includePhotos,
  createdAt: vehicleCertificateLinks.createdAt,
  expiresAt: vehicleCertificateLinks.expiresAt,
  revokedAt: vehicleCertificateLinks.revokedAt,
  lastViewedAt: vehicleCertificateLinks.lastViewedAt,
  viewCount: vehicleCertificateLinks.viewCount,
}

/** A photo the public page asked for, with what decides whether it may be shown. */
export interface SharedPhotoRow {
  photoId: string
  storageKey: string
  uploadedByRole: string
  bookingStatus: string
  bookingMarkedTest: boolean
  /** The car's live link (not revoked), if any, and only while the car and its owner stand. */
  link: { id: string; includePhotos: boolean; expiresAt: Date | null; revokedAt: Date | null } | null
}

export const certificatesRepository = {
  /** The customer's own car, if it is theirs and not removed (archived). */
  async findOwnCar(userId: string, vehicleId: string): Promise<CertificateCar | undefined> {
    const [car] = await db
      .select({
        id: userVehicles.id,
        make: userVehicles.make,
        model: userVehicles.model,
        color: userVehicles.color,
        licensePlate: userVehicles.licensePlate,
        vehicleType: userVehicles.vehicleType,
      })
      .from(userVehicles)
      .where(and(eq(userVehicles.id, vehicleId), eq(userVehicles.userId, userId), isNull(userVehicles.archivedAt)))
      .limit(1)
    return car
  },

  /**
   * Every booking row of the customer's car, newest slot first, at most
   * HISTORY_ROW_CAP: lib/service-history-certificate.ts keeps each chain's
   * latest completed row. Only what the certificate prints is read: no
   * money, no addresses, no notes.
   */
  async listCertificateRows(userId: string, vehicleId: string): Promise<CertificateRow[]> {
    const rows = await db.execute<{
      id: string
      chain_id: string
      reschedule_count: number
      created_at: Date | string
      status: string
      scheduled_at: Date | string
      completed_at: Date | string | null
      marked_test: boolean
      vendor_id: string
      vendor_name: string
      vendor_in_bin: boolean
      services: string[] | null
    }>(sql`
      SELECT b.id,
             coalesce(b.original_booking_id, b.id) AS chain_id,
             b.reschedule_count,
             b.created_at,
             b.status::text AS status,
             b.scheduled_at,
             b.completed_at,
             (b.marked_test_at IS NOT NULL) AS marked_test,
             b.vendor_id,
             v.business_name AS vendor_name,
             (v.deleted_at IS NOT NULL) AS vendor_in_bin,
             coalesce(
               (SELECT array_agg(bi.name ORDER BY bi.sort_order, bi.created_at)
                  FROM booking_items bi WHERE bi.booking_id = b.id),
               (SELECT array_agg(s.name) FROM services s WHERE s.id = b.service_id)
             ) AS services
        FROM bookings b
        JOIN vendors v ON v.id = b.vendor_id
       WHERE b.user_id = ${userId}
         AND b.vehicle_id = ${vehicleId}
       ORDER BY b.scheduled_at DESC, b.id DESC
       LIMIT ${HISTORY_ROW_CAP}
    `)
    return Array.from(rows).map((row) => ({
      id: row.id,
      chainId: row.chain_id,
      rescheduleCount: row.reschedule_count,
      createdAt: toDate(row.created_at),
      status: row.status,
      scheduledAt: toDate(row.scheduled_at),
      completedAt: toDateOrNull(row.completed_at),
      markedTest: row.marked_test,
      vendorId: row.vendor_id,
      vendorName: row.vendor_name,
      vendorInBin: row.vendor_in_bin,
      services: row.services ?? [],
    }))
  },

  /** The garage's own photos of these bookings (never the customer's), oldest first. */
  async listGaragePhotos(bookingIds: string[]): Promise<CertificatePhoto[]> {
    if (bookingIds.length === 0) return []
    const rows = await db.execute<{
      id: string
      booking_id: string
      stage: 'before' | 'after'
      angle: string | null
      created_at: Date | string
      url: string
    }>(sql`
      SELECT jp.id, jp.booking_id, jp.stage::text AS stage, jp.angle, jp.created_at, jp.url
        FROM job_photos jp
       WHERE jp.booking_id IN (${sql.join(
         bookingIds.map((id) => sql`${id}`),
         sql`, `
       )})
         AND jp.uploaded_by_role = 'garage'
       ORDER BY jp.created_at, jp.id
    `)
    return Array.from(rows).map((row) => ({
      id: row.id,
      bookingId: row.booking_id,
      stage: row.stage,
      angle: row.angle,
      createdAt: toDate(row.created_at),
      url: row.url,
    }))
  },

  /** The car's link that is not revoked (live or run out), if any. */
  async findLiveLink(vehicleId: string): Promise<CertificateLinkRow | undefined> {
    const [link] = await db
      .select(LINK_COLUMNS)
      .from(vehicleCertificateLinks)
      .where(and(eq(vehicleCertificateLinks.vehicleId, vehicleId), isNull(vehicleCertificateLinks.revokedAt)))
      .limit(1)
    return link
  },

  /**
   * A new link for the car, ending the one before it (if any) in the same
   * transaction, under a per-car advisory lock taken on its own (never
   * alongside the booking-write locks), so two taps make one live link.
   * The id is chosen by the caller, because the token is made from it and
   * only its hash is written.
   */
  async replaceLink(input: {
    id: string
    userId: string
    vehicleId: string
    tokenHash: string
    includePhotos: boolean
    expiresAt: Date | null
    now: Date
  }): Promise<CertificateLinkRow> {
    return db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`certificate-links:${input.vehicleId}`})::bigint)`)
      await tx
        .update(vehicleCertificateLinks)
        .set({ revokedAt: input.now })
        .where(and(eq(vehicleCertificateLinks.vehicleId, input.vehicleId), isNull(vehicleCertificateLinks.revokedAt)))
      const [link] = await tx
        .insert(vehicleCertificateLinks)
        .values({
          id: input.id,
          userId: input.userId,
          vehicleId: input.vehicleId,
          tokenHash: input.tokenHash,
          includePhotos: input.includePhotos,
          createdAt: input.now,
          expiresAt: input.expiresAt,
        })
        .returning(LINK_COLUMNS)
      return link
    })
  },

  /** Photos on or off for the car's link that is not revoked. Undefined when there is none. */
  async setIncludePhotos(userId: string, vehicleId: string, includePhotos: boolean) {
    const [link] = await db
      .update(vehicleCertificateLinks)
      .set({ includePhotos })
      .where(
        and(
          eq(vehicleCertificateLinks.userId, userId),
          eq(vehicleCertificateLinks.vehicleId, vehicleId),
          isNull(vehicleCertificateLinks.revokedAt)
        )
      )
      .returning(LINK_COLUMNS)
    return link
  },

  /** "Stop sharing": ends the car's link. How many were ended (0 or 1). */
  async revoke(userId: string, vehicleId: string, now: Date): Promise<number> {
    const ended = await db
      .update(vehicleCertificateLinks)
      .set({ revokedAt: now })
      .where(
        and(
          eq(vehicleCertificateLinks.userId, userId),
          eq(vehicleCertificateLinks.vehicleId, vehicleId),
          isNull(vehicleCertificateLinks.revokedAt)
        )
      )
      .returning({ id: vehicleCertificateLinks.id })
    return ended.length
  },

  /**
   * The link a token's hash names, with its car, only while the car is still
   * the customer's (not removed) and the account is active. Revoked and run
   * out links are returned too: the service decides, in one place.
   */
  async findByTokenHash(hash: string): Promise<{ link: CertificateLinkRow; car: CertificateCar } | undefined> {
    const rows = await db.execute<{
      id: string
      user_id: string
      vehicle_id: string
      token_hash: string
      include_photos: boolean
      created_at: Date | string
      expires_at: Date | string | null
      revoked_at: Date | string | null
      last_viewed_at: Date | string | null
      view_count: number
      make: string
      model: string
      color: string | null
      license_plate: string | null
      vehicle_type: string
    }>(sql`
      SELECT l.id, l.user_id, l.vehicle_id, l.token_hash, l.include_photos, l.created_at, l.expires_at,
             l.revoked_at, l.last_viewed_at, l.view_count,
             uv.make, uv.model, uv.color, uv.license_plate, uv.vehicle_type::text AS vehicle_type
        FROM vehicle_certificate_links l
        JOIN user_vehicles uv ON uv.id = l.vehicle_id AND uv.user_id = l.user_id AND uv.archived_at IS NULL
        JOIN users u ON u.id = l.user_id AND u.status = 'active'
       WHERE l.token_hash = ${hash}
       LIMIT 1
    `)
    const row = Array.from(rows)[0]
    if (!row) return undefined
    return {
      link: {
        id: row.id,
        userId: row.user_id,
        vehicleId: row.vehicle_id,
        tokenHash: row.token_hash,
        includePhotos: row.include_photos,
        createdAt: toDate(row.created_at),
        expiresAt: toDateOrNull(row.expires_at),
        revokedAt: toDateOrNull(row.revoked_at),
        lastViewedAt: toDateOrNull(row.last_viewed_at),
        viewCount: row.view_count,
      },
      car: {
        id: row.vehicle_id,
        make: row.make,
        model: row.model,
        color: row.color,
        licensePlate: row.license_plate,
        vehicleType: row.vehicle_type,
      },
    }
  },

  /** One more view of a live link. */
  async recordView(linkId: string, now: Date) {
    await db
      .update(vehicleCertificateLinks)
      .set({ viewCount: sql`${vehicleCertificateLinks.viewCount} + 1`, lastViewedAt: now })
      .where(and(eq(vehicleCertificateLinks.id, linkId), isNull(vehicleCertificateLinks.revokedAt)))
  },

  /**
   * A job photo the public page asked for, with its booking's standing and
   * the live link of the booking's car (the booking's own customer's, while
   * the car and the account stand). The service decides from these.
   */
  async findSharedPhoto(photoId: string): Promise<SharedPhotoRow | undefined> {
    const rows = await db.execute<{
      photo_id: string
      storage_key: string
      uploaded_by_role: string
      booking_status: string
      booking_marked_test: boolean
      link_id: string | null
      include_photos: boolean | null
      expires_at: Date | string | null
      revoked_at: Date | string | null
    }>(sql`
      SELECT jp.id AS photo_id, jp.storage_key, jp.uploaded_by_role,
             b.status::text AS booking_status, (b.marked_test_at IS NOT NULL) AS booking_marked_test,
             l.id AS link_id, l.include_photos, l.expires_at, l.revoked_at
        FROM job_photos jp
        JOIN bookings b ON b.id = jp.booking_id
        LEFT JOIN vehicle_certificate_links l
               ON l.vehicle_id = b.vehicle_id
              AND l.user_id = b.user_id
              AND l.revoked_at IS NULL
              AND EXISTS (SELECT 1 FROM user_vehicles uv
                           WHERE uv.id = l.vehicle_id AND uv.user_id = l.user_id AND uv.archived_at IS NULL)
              AND EXISTS (SELECT 1 FROM users u WHERE u.id = l.user_id AND u.status = 'active')
       WHERE jp.id = ${photoId}
       LIMIT 1
    `)
    const row = Array.from(rows)[0]
    if (!row) return undefined
    return {
      photoId: row.photo_id,
      storageKey: row.storage_key,
      uploadedByRole: row.uploaded_by_role,
      bookingStatus: row.booking_status,
      bookingMarkedTest: row.booking_marked_test,
      link: row.link_id
        ? {
            id: row.link_id,
            includePhotos: Boolean(row.include_photos),
            expiresAt: toDateOrNull(row.expires_at),
            revokedAt: toDateOrNull(row.revoked_at),
          }
        : null,
    }
  },

  /** Admin's totals: links made, live now, cars ever shared, views. Counts only. */
  async shareTotals(now: Date) {
    const rows = await db.execute<{
      links: number
      live: number
      cars: number
      views: number
      with_photos: number
    }>(sql`
      WITH at AS (SELECT ${now.toISOString()}::timestamptz AS now)
      SELECT count(*)::int AS links,
             count(*) FILTER (WHERE revoked_at IS NULL AND (expires_at IS NULL OR expires_at > at.now))::int AS live,
             count(DISTINCT vehicle_id)::int AS cars,
             coalesce(sum(view_count), 0)::int AS views,
             count(*) FILTER (WHERE revoked_at IS NULL AND include_photos
                                AND (expires_at IS NULL OR expires_at > at.now))::int AS with_photos
        FROM vehicle_certificate_links, at
    `)
    const row = Array.from(rows)[0]
    return {
      linksMade: row?.links ?? 0,
      liveNow: row?.live ?? 0,
      carsShared: row?.cars ?? 0,
      views: row?.views ?? 0,
      liveWithPhotos: row?.with_photos ?? 0,
    }
  },
}
