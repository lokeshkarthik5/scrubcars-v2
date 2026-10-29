import { lateGarageCancelSql } from '../../lib/garage-cancel.js'
import { and, desc, eq, gte, inArray, isNull, sql } from 'drizzle-orm'
import { db } from '../../db/index.js'
import {
  adminAuditLog,
  vendorCertifications,
  vendorDocuments,
  vendorQualityChecks,
  vendorTierStandings,
  vendors,
} from '../../db/schema.js'
import {
  CERTIFICATION_RULES,
  type EligibilitySnapshot,
  type QualityCheckKind,
  type QualityCheckResult,
  type RevokeKind,
} from '../../lib/certification.js'
import type { PhotoComplianceJob } from '../../lib/photo-compliance.js'
import type { TierSnapshot } from '../../lib/tiers.js'
import { strikeCountsByGarage } from '../bypass-reports/bypass-reports.repository.js'

export type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0]
type Conn = typeof db | Tx

export type CertificationRecord = typeof vendorCertifications.$inferSelect
export type QualityCheckRecord = typeof vendorQualityChecks.$inferSelect
export type TierStandingRecord = typeof vendorTierStandings.$inferSelect

/** One completed job and its garage photo counts (0045), as lib/photo-compliance.ts reads it. */
export type PhotoComplianceRow = PhotoComplianceJob & { vendorId: string }

export interface CertificationGarage {
  id: string
  businessName: string
  status: string
  isVerified: boolean
  deletedAt: Date | null
  purgedAt: Date | null
}

const inList = (ids: string[]) => sql.join(ids.map((id) => sql`${id}::uuid`), sql`, `)

const CATEGORIES = sql.join(
  CERTIFICATION_RULES.complaintCategories.map((category) => sql`${category}`),
  sql`, `
)

/** Reads, through the plain connection or the transaction. */
function reads(conn: Conn) {
  return {
    async findGarage(vendorId: string): Promise<CertificationGarage | undefined> {
      const [row] = await conn
        .select({
          id: vendors.id,
          businessName: vendors.businessName,
          status: vendors.status,
          isVerified: vendors.isVerified,
          deletedAt: vendors.deletedAt,
          purgedAt: vendors.purgedAt,
        })
        .from(vendors)
        .where(eq(vendors.id, vendorId))
      return row
    },

    async findState(vendorId: string): Promise<CertificationRecord | undefined> {
      const [row] = await conn
        .select()
        .from(vendorCertifications)
        .where(eq(vendorCertifications.vendorId, vendorId))
      return row
    },

    /** A garage's Silver (0063): held since, short since, the last evaluation. */
    async findTierStanding(vendorId: string): Promise<TierStandingRecord | undefined> {
      const [row] = await conn.select().from(vendorTierStandings).where(eq(vendorTierStandings.vendorId, vendorId))
      return row
    },

    /** Every certification row, for the admin garage list (no snapshot rules). */
    listStates() {
      return conn
        .select({
          vendorId: vendorCertifications.vendorId,
          certifiedAt: vendorCertifications.certifiedAt,
          revokedAt: vendorCertifications.revokedAt,
          revokeKind: vendorCertifications.revokeKind,
          eligible: vendorCertifications.eligible,
          lastEvaluatedAt: vendorCertifications.lastEvaluatedAt,
          ineligibleSince: vendorCertifications.ineligibleSince,
        })
        .from(vendorCertifications)
    },

    /** Of these garages, the ones certified now (CERTIFIED_GARAGE's columns). */
    async listCertifiedIds(vendorIds: string[]): Promise<string[]> {
      if (vendorIds.length === 0) return []
      const rows = await conn
        .select({ vendorId: vendorCertifications.vendorId })
        .from(vendorCertifications)
        .where(
          and(
            inArray(vendorCertifications.vendorId, vendorIds),
            sql`${vendorCertifications.certifiedAt} is not null`,
            isNull(vendorCertifications.revokedAt)
          )
        )
      return rows.map((row) => row.vendorId)
    },

    /** A garage's checks, newest visit first. */
    listChecks(vendorId: string) {
      return conn
        .select()
        .from(vendorQualityChecks)
        .where(eq(vendorQualityChecks.vendorId, vendorId))
        .orderBy(desc(vendorQualityChecks.checkedOn), desc(vendorQualityChecks.createdAt))
    },

    /** These garages' checks dated on or after `fromDate` (an IST date key). */
    listRecentChecks(vendorIds: string[], fromDate: string) {
      if (vendorIds.length === 0) return Promise.resolve([])
      return conn
        .select({
          vendorId: vendorQualityChecks.vendorId,
          checkedOn: vendorQualityChecks.checkedOn,
          result: vendorQualityChecks.result,
          createdAt: vendorQualityChecks.createdAt,
        })
        .from(vendorQualityChecks)
        .where(and(inArray(vendorQualityChecks.vendorId, vendorIds), gte(vendorQualityChecks.checkedOn, fromDate)))
    },

    // ─── The measured standards ──────────────────────────────────────────────
    // One grouped read per standard for a batch of garages. Test-marked
    // bookings (and their reviews and complaints) are left out everywhere,
    // as Statistics leaves them out.

    /** Required-document approvals, as type only (lib/vendor-documents.ts decides). */
    listApprovedDocumentTypes(vendorIds: string[]) {
      if (vendorIds.length === 0) return Promise.resolve([])
      return conn
        .select({ vendorId: vendorDocuments.vendorId, type: vendorDocuments.type, status: vendorDocuments.status })
        .from(vendorDocuments)
        .where(and(inArray(vendorDocuments.vendorId, vendorIds), eq(vendorDocuments.status, 'approved')))
    },

    /** All-time rating and review count. */
    async ratings(vendorIds: string[]) {
      if (vendorIds.length === 0) return []
      const rows = await conn.execute<{ vendor_id: string; average: number | string; count: number | string }>(sql`
        SELECT r.vendor_id, avg(r.rating)::float AS average, count(*)::int AS count
          FROM reviews r
          JOIN bookings b ON b.id = r.booking_id
         WHERE r.vendor_id IN (${inList(vendorIds)})
           AND b.marked_test_at IS NULL
         GROUP BY r.vendor_id
      `)
      return Array.from(rows).map((row) => ({
        vendorId: row.vendor_id,
        average: Number(row.average),
        count: Number(row.count),
      }))
    },

    /**
     * Completed bookings finished in the window. A completed booking is the
     * last row of its reschedule chain (a moved row is cancelled), so rows
     * are chains. Rows from before 0028 have no completed_at: their slot.
     */
    async completedCounts(vendorIds: string[], since: Date) {
      if (vendorIds.length === 0) return []
      const rows = await conn.execute<{ vendor_id: string; count: number | string }>(sql`
        SELECT b.vendor_id, count(*)::int AS count
          FROM bookings b
         WHERE b.vendor_id IN (${inList(vendorIds)})
           AND b.status = 'completed'
           AND b.marked_test_at IS NULL
           AND coalesce(b.completed_at, b.delivered_at, b.scheduled_at) >= ${since.toISOString()}::timestamptz
         GROUP BY b.vendor_id
      `)
      return Array.from(rows).map((row) => ({ vendorId: row.vendor_id, count: Number(row.count) }))
    },

    /**
     * Paid bookings with a deadline to answer (0042) in the window whose
     * answer is known: accepted, declined or cancelled by the garage's side,
     * or cancelled for not accepting in time. Missed = `response_missed_at`,
     * or accepted after the deadline (possible while AUTO_CANCEL_UNANSWERED
     * is off). A booking the customer cancelled before any answer is left
     * out: the garage had no say. Rows from before 0042 have no deadline.
     */
    async responseCounts(vendorIds: string[], since: Date) {
      if (vendorIds.length === 0) return []
      const rows = await conn.execute<{ vendor_id: string; in_time: number | string; missed: number | string }>(sql`
        SELECT b.vendor_id,
               count(*) FILTER (
                 WHERE b.response_missed_at IS NULL
                   AND (b.accepted_at IS NULL OR b.accepted_at <= b.respond_by)
               )::int AS in_time,
               count(*) FILTER (
                 WHERE b.response_missed_at IS NOT NULL
                    OR (b.accepted_at IS NOT NULL AND b.accepted_at > b.respond_by)
               )::int AS missed
          FROM bookings b
         WHERE b.vendor_id IN (${inList(vendorIds)})
           AND b.respond_by IS NOT NULL
           AND b.respond_by >= ${since.toISOString()}::timestamptz
           AND b.marked_test_at IS NULL
           AND (b.accepted_at IS NOT NULL OR b.response_missed_at IS NOT NULL OR b.cancelled_by = 'vendor')
         GROUP BY b.vendor_id
      `)
      return Array.from(rows).map((row) => ({
        vendorId: row.vendor_id,
        inTime: Number(row.in_time),
        missed: Number(row.missed),
      }))
    },

    /**
     * Complaints about damage, the work or the garage not turning up,
     * received in the window, one per booking (a complaint with no booking
     * counts on its own). Every status counts: complaints have no "upheld"
     * flag, and resolved only means the team answered.
     *
     * Detlio Guarantee (0051): a free redo claim that was approved (a redo or
     * a refund instead, by the garage, its silence, Detlio, or a job with no
     * photos) in the window is a service-quality issue too, on its booking:
     * one per booking with any complaint about it, so a customer who claimed
     * and also complained counts once. A claim not approved counts nothing.
     */
    async complaintCounts(vendorIds: string[], since: Date) {
      if (vendorIds.length === 0) return []
      const rows = await conn.execute<{ vendor_id: string; count: number | string }>(sql`
        SELECT q.vendor_id, count(DISTINCT q.issue_key)::int AS count
          FROM (
            SELECT c.vendor_id, coalesce(c.booking_id::text, c.id::text) AS issue_key
              FROM complaints c
              LEFT JOIN bookings b ON b.id = c.booking_id
             WHERE c.vendor_id IN (${inList(vendorIds)})
               AND c.category IN (${CATEGORIES})
               AND c.received_at >= ${since.toISOString()}::timestamptz
               -- Withdrawn by the customer before anyone answered (0066): left out.
               AND c.withdrawn_at IS NULL
               AND (b.id IS NULL OR b.marked_test_at IS NULL)
            UNION ALL
            SELECT g.vendor_id, g.booking_id::text AS issue_key
              FROM guarantee_claims g
              JOIN bookings b ON b.id = g.booking_id
             WHERE g.vendor_id IN (${inList(vendorIds)})
               AND g.approved_at IS NOT NULL
               AND g.approved_at >= ${since.toISOString()}::timestamptz
               AND b.marked_test_at IS NULL
          ) q
         GROUP BY q.vendor_id
      `)
      return Array.from(rows).map((row) => ({ vendorId: row.vendor_id, count: Number(row.count) }))
    },

    /**
     * Confirmed bypass reports in the last 180 IST days (0052): the
     * garage's strikes, read through the bypass-reports module's one SQL
     * definition (`strikeCountsByGarage`).
     */
    bypassStrikeCounts(vendorIds: string[], since: Date) {
      return strikeCountsByGarage(conn, { vendorIds, since })
    },

    /**
     * Missed bookings in the window: garage no-shows recorded, and accepted
     * bookings the garage cancelled within 24 hours of the slot (0066,
     * lib/garage-cancel.ts; one cancelled earlier counts like a decline,
     * which is never held against it).
     */
    async garageNoShowCounts(vendorIds: string[], since: Date) {
      if (vendorIds.length === 0) return []
      const rows = await conn.execute<{ vendor_id: string; count: number | string }>(sql`
        SELECT b.vendor_id, count(*)::int AS count
          FROM bookings b
         WHERE b.vendor_id IN (${inList(vendorIds)})
           AND b.marked_test_at IS NULL
           AND (
             (b.no_show = 'garage' AND coalesce(b.no_show_marked_at, b.scheduled_at) >= ${since.toISOString()}::timestamptz)
             OR (${lateGarageCancelSql('b')} AND b.garage_cancelled_at >= ${since.toISOString()}::timestamptz)
           )
         GROUP BY b.vendor_id
      `)
      return Array.from(rows).map((row) => ({ vendorId: row.vendor_id, count: Number(row.count) }))
    },

    /**
     * Completed jobs since `since` with the garage's own before and after
     * photo counts (0045), for lib/photo-compliance.ts to grade. The same
     * rows as adminRepository.listPhotoComplianceJobs (completed bookings,
     * finished at completed_at or else the slot, only `garage` photos,
     * waived and Test-marked flagged rather than dropped), for these garages
     * only. Every decision is the lib's.
     */
    async photoComplianceJobs(vendorIds: string[], since: Date): Promise<PhotoComplianceRow[]> {
      if (vendorIds.length === 0) return []
      const rows = await conn.execute<{
        vendor_id: string
        finished_at: string | Date
        garage_before: number | string
        garage_after: number | string
        waived: boolean
        marked_test: boolean
      }>(sql`
        SELECT b.vendor_id,
               coalesce(b.completed_at, b.scheduled_at) AS finished_at,
               count(jp.id) FILTER (WHERE jp.stage = 'before') AS garage_before,
               count(jp.id) FILTER (WHERE jp.stage = 'after') AS garage_after,
               b.photos_waived_at IS NOT NULL AS waived,
               b.marked_test_at IS NOT NULL AS marked_test
          FROM bookings b
          LEFT JOIN job_photos jp
            ON jp.booking_id = b.id AND jp.uploaded_by_role = 'garage'
         WHERE b.vendor_id IN (${inList(vendorIds)})
           AND b.status = 'completed'
           AND coalesce(b.completed_at, b.scheduled_at) >= ${since.toISOString()}::timestamptz
         GROUP BY b.id
      `)
      return Array.from(rows).map((row) => ({
        vendorId: row.vendor_id,
        finishedAt: new Date(row.finished_at),
        garageBefore: Number(row.garage_before),
        garageAfter: Number(row.garage_after),
        waived: Boolean(row.waived),
        markedTest: Boolean(row.marked_test),
      }))
    },

    /**
     * Garages due tonight: on the app (Active and shown to customers), Gold
     * or holding Silver, not in the Bin and not a tombstone, and not
     * evaluated since `runStart`. Never evaluated first, then the longest ago.
     */
    async listDueForEvaluation(runStart: Date, limit: number) {
      const rows = await conn.execute<{ id: string; business_name: string }>(sql`
        SELECT v.id, v.business_name
          FROM vendors v
          LEFT JOIN vendor_certifications vc ON vc.vendor_id = v.id
          LEFT JOIN vendor_tier_standings ts ON ts.vendor_id = v.id
         WHERE v.deleted_at IS NULL
           AND v.purged_at IS NULL
           AND (
             (v.status = 'active' AND v.is_verified = true)
             OR (vc.certified_at IS NOT NULL AND vc.revoked_at IS NULL)
             OR ts.silver_at IS NOT NULL
           )
           AND (vc.last_evaluated_at IS NULL OR vc.last_evaluated_at < ${runStart.toISOString()}::timestamptz)
         ORDER BY vc.last_evaluated_at ASC NULLS FIRST, v.id
         LIMIT ${limit}
      `)
      return Array.from(rows).map((row) => ({ id: row.id, businessName: row.business_name }))
    },
  }
}

/** The writes, inside the transaction that holds the garage's certification lock. */
function writes(tx: Tx) {
  return {
    /**
     * One garage's certification, one change at a time:
     * `pg_advisory_xact_lock('certification:<garage>')`, so Certify, Revoke
     * and the nightly run never write over each other. Taken on its own,
     * never alongside the booking-write locks (AGENTS.md).
     */
    async lockCertification(vendorId: string) {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`certification:${vendorId}`})::bigint)`)
    },

    /** The evaluation's outcome, on a new or existing row. */
    async saveEvaluation(
      vendorId: string,
      values: {
        eligible: boolean
        eligibility: EligibilitySnapshot
        lastEvaluatedAt: Date
        ineligibleSince: Date | null
        eligibleAlertedAt: Date | null
      }
    ) {
      await tx
        .insert(vendorCertifications)
        .values({ vendorId, ...values })
        .onConflictDoUpdate({
          target: vendorCertifications.vendorId,
          set: { ...values, updatedAt: sql`now()` },
        })
    },

    /** Silver's outcome tonight (0063), on a new or existing row. */
    async saveTierStanding(
      vendorId: string,
      values: {
        silverAt: Date | null
        silverShortSince: Date | null
        silverLostAt?: Date
        silverEligible: boolean
        evaluation: TierSnapshot
        lastEvaluatedAt: Date
      }
    ) {
      await tx
        .insert(vendorTierStandings)
        .values({ vendorId, ...values })
        .onConflictDoUpdate({
          target: vendorTierStandings.vendorId,
          set: { ...values, updatedAt: sql`now()` },
        })
    },

    /** Certify: certified now, any earlier revocation cleared. */
    async certify(
      vendorId: string,
      values: {
        certifiedBy: string
        certifiedBySub: string
        eligibility: EligibilitySnapshot
        now: Date
      }
    ): Promise<CertificationRecord> {
      const set = {
        certifiedAt: values.now,
        certifiedBy: values.certifiedBy,
        certifiedBySub: values.certifiedBySub,
        revokedAt: null,
        revokedBy: null,
        revokedBySub: null,
        revokedReason: null,
        revokeKind: null,
        eligible: true,
        eligibility: values.eligibility,
        lastEvaluatedAt: values.now,
        ineligibleSince: null,
      }
      const [row] = await tx
        .insert(vendorCertifications)
        .values({ vendorId, ...set })
        .onConflictDoUpdate({ target: vendorCertifications.vendorId, set: { ...set, updatedAt: sql`now()` } })
        .returning()
      return row
    },

    /** Ends a certification, only while there is one. Undefined when there was not. */
    async revoke(
      vendorId: string,
      values: { revokedBy: string; revokedBySub: string; revokedReason: string; revokeKind: RevokeKind; now: Date }
    ): Promise<CertificationRecord | undefined> {
      const [row] = await tx
        .update(vendorCertifications)
        .set({
          revokedAt: values.now,
          revokedBy: values.revokedBy,
          revokedBySub: values.revokedBySub,
          revokedReason: values.revokedReason,
          revokeKind: values.revokeKind,
          ineligibleSince: null,
          updatedAt: sql`now()`,
        })
        .where(
          and(
            eq(vendorCertifications.vendorId, vendorId),
            sql`${vendorCertifications.certifiedAt} is not null`,
            isNull(vendorCertifications.revokedAt)
          )
        )
        .returning()
      return row
    },

    async insertCheck(values: {
      vendorId: string
      checkedOn: string
      kind: QualityCheckKind
      checkerName: string
      result: QualityCheckResult
      notes: string | null
      recordedBy: string
      recordedBySub: string
    }): Promise<QualityCheckRecord> {
      const [row] = await tx.insert(vendorQualityChecks).values(values).returning()
      return row
    },

    async insertAudit(entry: {
      action:
        | 'garage_certified'
        | 'garage_certification_revoked'
        | 'garage_certification_lapsed'
        | 'garage_silver_gained'
        | 'garage_silver_lost'
      actorSub: string
      actorName: string
      summary: Record<string, unknown>
      detail: Record<string, unknown>
    }) {
      await tx.insert(adminAuditLog).values(entry)
    },
  }
}

export type CertificationReads = ReturnType<typeof reads>
export type CertificationWork = CertificationReads & ReturnType<typeof writes>

export const certificationRepository = {
  ...reads(db),

  /** One garage's change, under its certification lock. */
  transaction<T>(vendorId: string, work: (repo: CertificationWork) => Promise<T>): Promise<T> {
    return db.transaction(async (tx) => {
      await tx.execute(sql`set local statement_timeout = '10s'`)
      const repo = { ...reads(tx), ...writes(tx) }
      await repo.lockCertification(vendorId)
      return work(repo)
    })
  },
}
