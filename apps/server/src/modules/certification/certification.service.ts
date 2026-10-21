import {
  AUTOMATIC_ACTOR,
  CERTIFICATION_RULES,
  PHOTO_COMPLIANCE_NOT_MEASURED,
  QUALITY_CHECK_KIND_LABELS,
  addMonths,
  certifyRefusal,
  evaluateEligibility,
  evaluationRunStart,
  fromPhotoCompliance,
  graceEndsOn,
  isCertified,
  lapseReason,
  planEvaluation,
  qualityCheckDateRefusal,
  qualityCheckStanding,
  shortfallLine,
  toSnapshot,
  unmetLine,
  windowStart,
  type CertificationMetrics,
  type CertifyRefusal,
  type Eligibility,
  type PhotoCompliance,
  type QualityCheckRow,
  type QualityCheckStanding,
  type QualityCheckStatus,
  type RuleResult,
} from '../../lib/certification.js'
import { isDocumentStorageConfigured } from '../../lib/document-storage.js'
import { AppError } from '../../lib/errors.js'
import { istDateKey, istDayLabel, istMidnight } from '../../lib/ist.js'
import { logger } from '../../lib/logger.js'
import {
  photoComplianceByGarage as gradePhotoCompliance,
  photoComplianceSince,
  type PhotoCompliance as PhotoComplianceFigure,
} from '../../lib/photo-compliance.js'
import { alertOps } from '../../lib/ops-alerts.js'
import { summariesByVendor } from '../../lib/vendor-documents.js'
import {
  certificationRepository,
  type CertificationGarage,
  type CertificationRecord,
  type QualityCheckRecord,
} from './certification.repository.js'
import type { CertifyInput, RecordCheckInput, RevokeInput } from './certification.validation.js'

const log = logger.child({ module: 'certification' })

/** Garages evaluated a cron run, and the time a run may spend on them. */
export const CERTIFICATION_SWEEP_LIMIT = 20
const SWEEP_BUDGET_MS = 15_000

// ─── The photo standard's one hook ───────────────────────────────────────────

/** A garage with no completed job in the window: nothing to grade. */
const NO_PHOTO_JOBS: PhotoComplianceFigure = { jobs: 0, compliant: 0, waived: 0, percent: null }

/**
 * Before/after photo compliance per garage (0045): the ONE place this module
 * reads it. lib/photo-compliance.ts grades it, over its own window
 * (PHOTO_COMPLIANCE_DAYS, 90, ending now), so the checklist's figure is the
 * one admin's garage card shows: of the jobs completed in it, not
 * Test-marked and not waived, the share with 2 before and 2 after photos of
 * the garage's own. A garage with no such jobs reads "No jobs to measure
 * yet", which passes (and it cannot have the 20 completed jobs then anyway,
 * unless Detlio waived them all).
 */
async function photoComplianceByGarage(vendorIds: string[], now: Date): Promise<Map<string, PhotoCompliance>> {
  const figures = gradePhotoCompliance(
    await certificationRepository.photoComplianceJobs(vendorIds, photoComplianceSince(now)),
    now
  )
  return new Map(
    vendorIds.map((id) => [id, fromPhotoCompliance(figures.get(id) ?? NO_PHOTO_JOBS)])
  )
}

// ─── Measuring ───────────────────────────────────────────────────────────────

/**
 * The measured standards for a batch of garages, one grouped read each, one
 * after another (one DB connection). Documents read as null for everyone
 * while garage documents are off.
 */
async function measure(vendorIds: string[], now: Date): Promise<Map<string, CertificationMetrics>> {
  const since = windowStart(now)
  const documentsOn = isDocumentStorageConfigured()
  const documents = documentsOn
    ? summariesByVendor(await certificationRepository.listApprovedDocumentTypes(vendorIds))
    : null
  const ratings = new Map((await certificationRepository.ratings(vendorIds)).map((row) => [row.vendorId, row]))
  const completed = new Map(
    (await certificationRepository.completedCounts(vendorIds, since)).map((row) => [row.vendorId, row.count])
  )
  const responses = new Map(
    (await certificationRepository.responseCounts(vendorIds, since)).map((row) => [row.vendorId, row])
  )
  const complaints = new Map(
    (await certificationRepository.complaintCounts(vendorIds, since)).map((row) => [row.vendorId, row.count])
  )
  const noShows = new Map(
    (await certificationRepository.garageNoShowCounts(vendorIds, since)).map((row) => [row.vendorId, row.count])
  )
  const photos = await photoComplianceByGarage(vendorIds, now)

  return new Map(
    vendorIds.map((id): [string, CertificationMetrics] => {
      const rating = ratings.get(id)
      const response = responses.get(id)
      return [
        id,
        {
          documentsVerified: documents === null ? null : (documents.get(id)?.verified ?? false),
          rating: rating ? rating.average : null,
          reviewCount: rating?.count ?? 0,
          completed: completed.get(id) ?? 0,
          responses: { inTime: response?.inTime ?? 0, missed: response?.missed ?? 0 },
          complaints: complaints.get(id) ?? 0,
          garageNoShows: noShows.get(id) ?? 0,
          photoCompliance: photos.get(id) ?? PHOTO_COMPLIANCE_NOT_MEASURED,
        },
      ]
    })
  )
}

/** These garages' checks that can still count today (the last 6 months). */
async function recentChecksByGarage(vendorIds: string[], today: string) {
  const from = addMonths(today, -CERTIFICATION_RULES.qualityCheckMonths)
  const rows = await certificationRepository.listRecentChecks(vendorIds, from)
  const byGarage = new Map<string, QualityCheckRow[]>()
  for (const row of rows) {
    const list = byGarage.get(row.vendorId) ?? []
    list.push(row)
    byGarage.set(row.vendorId, list)
  }
  return byGarage
}

/** One garage, measured now. */
async function evaluateGarage(vendorId: string, now: Date) {
  const metrics = (await measure([vendorId], now)).get(vendorId)!
  return evaluateEligibility(metrics)
}

// ─── Views ───────────────────────────────────────────────────────────────────

function notFound() {
  return new AppError(404, 'Vendor not found', 'VENDOR_NOT_FOUND')
}

/** A garage admin can open: exists and was not deleted forever. */
async function findOpenGarage(vendorId: string): Promise<CertificationGarage> {
  const garage = await certificationRepository.findGarage(vendorId)
  if (!garage || garage.purgedAt) throw notFound()
  return garage
}

/** A refusal as the API answers it; a fresh error each time. */
function refusalError(refusal: CertifyRefusal, eligibility?: Eligibility): AppError {
  switch (refusal) {
    case 'in_bin':
      return new AppError(409, 'This garage is in the Bin. Restore it first.', 'VENDOR_IN_BIN')
    case 'already_certified':
      return new AppError(409, 'This garage is already Detlio Certified.', 'ALREADY_CERTIFIED')
    case 'not_eligible':
      return new AppError(
        409,
        eligibility
          ? `This garage does not meet every standard yet: ${unmetLine(eligibility)}.`
          : 'This garage does not meet every standard yet.',
        'CERTIFICATION_NOT_ELIGIBLE'
      )
    case 'no_passing_check':
      return new AppError(
        409,
        'Record a passing quality check from the last 6 months first.',
        'CERTIFICATION_NO_PASSING_CHECK'
      )
  }
}

function toCheckView(check: QualityCheckRecord) {
  return {
    id: check.id,
    checkedOn: check.checkedOn,
    kind: check.kind,
    kindLabel: QUALITY_CHECK_KIND_LABELS[check.kind],
    checkerName: check.checkerName,
    result: check.result,
    notes: check.notes,
    recordedBy: check.recordedBy,
    createdAt: check.createdAt.toISOString(),
  }
}

/** The lifecycle facts both views share. */
function lifecycle(state: CertificationRecord | undefined) {
  const certified = isCertified(state)
  return {
    certified,
    certifiedAt: certified ? (state!.certifiedAt?.toISOString() ?? null) : null,
    /** While certified and short: the first night it was, and its last day with the badge. */
    atRisk:
      certified && state?.ineligibleSince
        ? {
            since: state.ineligibleSince.toISOString(),
            keepsUntil: graceEndsOn(state.ineligibleSince),
          }
        : null,
    /** How the last certification ended, while not certified. */
    ended:
      !certified && state?.revokedAt
        ? { at: state.revokedAt.toISOString(), kind: state.revokeKind ?? 'revoked' }
        : null,
  }
}

export type AdminCertificationView = Awaited<ReturnType<typeof adminView>>

async function adminView(garage: CertificationGarage, now = new Date()) {
  const today = istDateKey(now)
  const eligibility = await evaluateGarage(garage.id, now)
  const state = await certificationRepository.findState(garage.id)
  const checks = await certificationRepository.listChecks(garage.id)
  const standing = qualityCheckStanding(checks, today)
  const life = lifecycle(state)
  const refusal = certifyRefusal({
    inBin: garage.deletedAt !== null,
    certified: life.certified,
    eligible: eligibility.eligible,
    checkValid: standing.valid,
  })
  return {
    garage: { id: garage.id, businessName: garage.businessName, inBin: garage.deletedAt !== null },
    ...life,
    certifiedBy: life.certified ? (state?.certifiedBy ?? null) : null,
    revoked:
      state?.revokedAt && !life.certified
        ? {
            at: state.revokedAt.toISOString(),
            by: state.revokedBy,
            reason: state.revokedReason,
            kind: state.revokeKind ?? 'revoked',
          }
        : null,
    /** Measured just now, not the nightly snapshot. */
    eligibility: { eligible: eligibility.eligible, rules: eligibility.rules, measuredAt: now.toISOString() },
    lastEvaluatedAt: state?.lastEvaluatedAt?.toISOString() ?? null,
    qualityCheck: {
      valid: standing.valid,
      status: standing.status,
      validUntil: standing.validUntil,
      latestId: standing.latest?.id ?? null,
    },
    checks: checks.map(toCheckView),
    /** Why Certify is off now, or null when it can be pressed. */
    certifyBlockedBy: refusal,
    rules: {
      windowDays: CERTIFICATION_RULES.windowDays,
      graceDays: CERTIFICATION_RULES.graceDays,
      qualityCheckMonths: CERTIFICATION_RULES.qualityCheckMonths,
    },
  }
}

/** What the garage reads about its own standing: its numbers, never a checker or a note. */
export interface GarageCertificationView {
  certified: boolean
  certifiedAt: string | null
  atRisk: { since: string; keepsUntil: string } | null
  ended: { at: string; kind: string } | null
  eligible: boolean
  rules: RuleResult[]
  qualityCheck: { status: QualityCheckStatus; passedOn: string | null; validUntil: string | null }
  windowDays: number
  graceDays: number
}

function garageCheckView(standing: QualityCheckStanding) {
  return {
    status: standing.status,
    passedOn: standing.valid ? (standing.latest?.checkedOn ?? null) : null,
    validUntil: standing.validUntil,
  }
}

// ─── The service ─────────────────────────────────────────────────────────────

export const certificationService = {
  /** GET /admin/certification/vendors/:vendorId. Works for a garage in the Bin (read-only). */
  async getForAdmin(vendorId: string) {
    return adminView(await findOpenGarage(vendorId))
  },

  /** Records a mystery visit or inspection. Not on a garage in the Bin. */
  async recordCheck(vendorId: string, actorSub: string, input: RecordCheckInput) {
    const garage = await findOpenGarage(vendorId)
    if (garage.deletedAt) throw refusalError('in_bin')
    const refusal = qualityCheckDateRefusal(input.checkedOn, istDateKey(new Date()))
    if (refusal === 'future') {
      throw new AppError(400, 'The check date is in the future.', 'CHECK_DATE_IN_FUTURE')
    }
    if (refusal === 'too_old') {
      throw new AppError(400, 'The check date is over a year ago.', 'CHECK_DATE_TOO_OLD')
    }
    await certificationRepository.transaction(vendorId, (repo) =>
      repo.insertCheck({
        vendorId,
        checkedOn: input.checkedOn,
        kind: input.kind,
        checkerName: input.checkerName,
        result: input.result,
        notes: input.notes ? input.notes : null,
        recordedBy: input.actorName,
        recordedBySub: actorSub,
      })
    )
    log.info({ vendorId, result: input.result, kind: input.kind }, 'certification:check_recorded')
    return adminView(garage)
  },

  /**
   * Certify: the garage is measured afresh, and must be eligible with a
   * passing check of the last 6 months; under the garage's lock, it must not
   * be certified already. Records the typed name and time, refreshes the
   * snapshot, and writes the audit row.
   */
  async certify(vendorId: string, actorSub: string, input: CertifyInput) {
    const garage = await findOpenGarage(vendorId)
    const now = new Date()
    const eligibility = await evaluateGarage(vendorId, now)
    const standing = qualityCheckStanding(await certificationRepository.listChecks(vendorId), istDateKey(now))

    await certificationRepository.transaction(vendorId, async (repo) => {
      const state = await repo.findState(vendorId)
      const refusal = certifyRefusal({
        inBin: garage.deletedAt !== null,
        certified: isCertified(state),
        eligible: eligibility.eligible,
        checkValid: standing.valid,
      })
      if (refusal) throw refusalError(refusal, eligibility)
      await repo.certify(vendorId, {
        certifiedBy: input.actorName,
        certifiedBySub: actorSub,
        eligibility: toSnapshot(eligibility, standing.valid, now),
        now,
      })
      await repo.insertAudit({
        action: 'garage_certified',
        actorSub,
        actorName: input.actorName,
        summary: { vendorId, garage: garage.businessName },
        detail: {
          qualityCheckId: standing.latest?.id ?? null,
          qualityCheckOn: standing.latest?.checkedOn ?? null,
          rules: eligibility.rules.map((rule) => ({ key: rule.key, value: rule.value })),
        },
      })
    })
    log.info({ vendorId }, 'certification:certified')
    return adminView(garage, now)
  },

  /** Revoke, any time, with a reason. Not on a garage in the Bin; 409 when not certified. */
  async revoke(vendorId: string, actorSub: string, input: RevokeInput) {
    const garage = await findOpenGarage(vendorId)
    if (garage.deletedAt) throw refusalError('in_bin')
    const now = new Date()
    await certificationRepository.transaction(vendorId, async (repo) => {
      const revoked = await repo.revoke(vendorId, {
        revokedBy: input.actorName,
        revokedBySub: actorSub,
        revokedReason: input.reason,
        revokeKind: 'revoked',
        now,
      })
      if (!revoked) throw new AppError(409, 'This garage is not Detlio Certified.', 'NOT_CERTIFIED')
      await repo.insertAudit({
        action: 'garage_certification_revoked',
        actorSub,
        actorName: input.actorName,
        summary: { vendorId, garage: garage.businessName },
        detail: { reason: input.reason, certifiedAt: revoked.certifiedAt?.toISOString() ?? null },
      })
    })
    log.info({ vendorId }, 'certification:revoked')
    alertOps({
      kind: 'certification_lost',
      vendorId,
      garage: garage.businessName,
      how: 'revoked',
      by: input.actorName,
      reason: input.reason,
    })
    return adminView(garage, now)
  },

  /** GET /vendors/me/certification: the garage's own standing, from its own numbers. */
  async getForGarage(vendorId: string): Promise<GarageCertificationView> {
    const now = new Date()
    const eligibility = await evaluateGarage(vendorId, now)
    const state = await certificationRepository.findState(vendorId)
    const checks = await certificationRepository.listRecentChecks(
      [vendorId],
      addMonths(istDateKey(now), -CERTIFICATION_RULES.qualityCheckMonths)
    )
    const standing = qualityCheckStanding(checks, istDateKey(now))
    return {
      ...lifecycle(state),
      eligible: eligibility.eligible,
      rules: eligibility.rules,
      qualityCheck: garageCheckView(standing),
      windowDays: CERTIFICATION_RULES.windowDays,
      graceDays: CERTIFICATION_RULES.graceDays,
    }
  },

  /** Of these garages, the ones customers see as Detlio Certified. */
  async certifiedIds(vendorIds: string[]): Promise<Set<string>> {
    return new Set(await certificationRepository.listCertifiedIds(vendorIds))
  },

  /**
   * The nightly evaluation, on the pending-digest cron (a bounded batch a
   * run). Each garage on the app, or certified, is evaluated once per daily
   * run from 05:00 IST (evaluationRunStart): its snapshot saved, the 14 days
   * started, cleared or run out (planEvaluation), and ops told. Nothing at
   * all while garage documents are off: nobody can meet that standard then,
   * and a bucket unset by mistake must not strip every badge.
   */
  async sweep(options: { dryRun: boolean; now?: Date }) {
    if (!isDocumentStorageConfigured()) return { enabled: false as const }
    const now = options.now ?? new Date()
    const started = Date.now()
    const due = await certificationRepository.listDueForEvaluation(
      evaluationRunStart(now),
      CERTIFICATION_SWEEP_LIMIT
    )
    const summary = { enabled: true as const, due: due.length, evaluated: 0, eligible: 0, atRisk: 0, lapsed: 0 }
    if (due.length === 0) return summary

    const ids = due.map((garage) => garage.id)
    const today = istDateKey(now)
    const metrics = await measure(ids, now)
    const checks = await recentChecksByGarage(ids, today)

    for (const garage of due) {
      if (Date.now() - started > SWEEP_BUDGET_MS) break
      const eligibility = evaluateEligibility(metrics.get(garage.id)!)
      const standing = qualityCheckStanding(checks.get(garage.id) ?? [], today)
      if (options.dryRun) {
        summary.evaluated += 1
        continue
      }
      try {
        const plan = await certificationRepository.transaction(garage.id, async (repo) => {
          const state = await repo.findState(garage.id)
          const plan = planEvaluation(
            {
              certified: isCertified(state),
              ineligibleSince: state?.ineligibleSince ?? null,
              lastEligible: state?.lastEvaluatedAt ? state.eligible : null,
              eligibleAlertedAt: state?.eligibleAlertedAt ?? null,
            },
            { eligible: eligibility.eligible, checkValid: standing.valid },
            now
          )
          await repo.saveEvaluation(garage.id, {
            eligible: eligibility.eligible,
            eligibility: toSnapshot(eligibility, standing.valid, now),
            lastEvaluatedAt: now,
            ineligibleSince: plan.lapse ? null : plan.ineligibleSince,
            eligibleAlertedAt: plan.eligibleAlertedAt,
          })
          if (plan.lapse) {
            const reason = lapseReason(shortfallLine(eligibility, standing)).slice(0, 300)
            await repo.revoke(garage.id, {
              revokedBy: AUTOMATIC_ACTOR,
              revokedBySub: 'cron',
              revokedReason: reason,
              revokeKind: 'lapsed',
              now,
            })
            await repo.insertAudit({
              action: 'garage_certification_lapsed',
              actorSub: 'cron',
              actorName: AUTOMATIC_ACTOR,
              summary: { vendorId: garage.id, garage: garage.businessName },
              detail: {
                reason,
                ineligibleSince: state?.ineligibleSince?.toISOString() ?? null,
                rules: eligibility.rules.map((rule) => ({ key: rule.key, met: rule.met, value: rule.value })),
              },
            })
            return { ...plan, reason }
          }
          return { ...plan, reason: null }
        })
        summary.evaluated += 1
        if (eligibility.eligible) summary.eligible += 1

        if (plan.alert === 'eligible') {
          alertOps({ kind: 'certification_eligible', vendorId: garage.id, garage: garage.businessName })
        } else if (plan.alert === 'at_risk' && plan.ineligibleSince) {
          summary.atRisk += 1
          alertOps({
            kind: 'certification_at_risk',
            vendorId: garage.id,
            garage: garage.businessName,
            shortfall: shortfallLine(eligibility, standing),
            keepsUntil: istDayLabel(istMidnight(graceEndsOn(plan.ineligibleSince))),
          })
        } else if (plan.alert === 'lapsed') {
          summary.lapsed += 1
          alertOps({
            kind: 'certification_lost',
            vendorId: garage.id,
            garage: garage.businessName,
            how: 'lapsed',
            by: null,
            reason: plan.reason ?? lapseReason(shortfallLine(eligibility, standing)),
          })
        }
      } catch (err) {
        // One garage's failure never stops the rest, or the digest.
        log.error({ err, vendorId: garage.id }, 'certification:evaluate_failed')
      }
    }
    if (summary.evaluated > 0) log.info(summary, 'certification:sweep')
    return summary
  },
}
