import { AiUnavailableError, documentClientFor, type DocumentClient, type DocumentFile } from '../../lib/ai.js'
import { runInBackground } from '../../lib/background.js'
import { env } from '../../lib/env.js'
import { AppError } from '../../lib/errors.js'
import { istDateKey } from '../../lib/ist.js'
import { jobPhotoLink, readJobPhoto } from '../../lib/job-photo-storage.js'
import { logger } from '../../lib/logger.js'
import {
  FAKE_JOB_READING,
  FAKE_SCAN_READING,
  JOB_INSTRUCTIONS,
  JOB_JSON_SCHEMA,
  SCAN_INSTRUCTIONS,
  SCAN_JSON_SCHEMA,
  SCAN_PHOTO_TEXT,
  SHINE_AREAS,
  SHINE_AREA_LABELS,
  SHINE_JOB_MAX_ATTEMPTS,
  SHINE_JOB_SWEEP_BATCH,
  SHINE_JOB_SWEEP_DAYS,
  SHINE_MAX_PHOTO_BYTES,
  SHINE_RULES,
  biggestChange,
  fromPrice,
  jobPhotoText,
  lowestArea,
  matchJobPhotos,
  needOf,
  needsReview,
  overallOf,
  parseJobReading,
  parseScanReading,
  pickService,
  scanRefusal,
  scansLeft,
  summaryOf,
  type ShineArea,
  type ShineAreaScores,
  type ShineJobPhoto,
  type ShineNeed,
} from '../../lib/shine-score.js'
import { putShineScanPhotos, removeShineScanPhotos, shineScanKey } from '../../lib/shine-scan-storage.js'
import { vendorsService } from '../vendors/vendors.service.js'
import { shineScoreRepository as repo, type ShineScanRow } from './shine-score.repository.js'
import type { CreateScanInput, ListChecksQuery, ReviewCheckInput, SuggestionsQuery } from './shine-score.validation.js'

const log = logger.child({ module: 'shine-score' })

/** Enough for the JSON answer plus a reasoning model's thinking. */
const MAX_OUTPUT_TOKENS = 4_000
/** A job's scoring that has said nothing for this long is taken as dead and may be tried again. */
const STALE_SCORING_MS = 3 * 60_000
/** Expired scans deleted per cron run. */
const PURGE_BATCH = 200
/** Admin's list is the newest this many of a kind. */
const CHECKS_LIMIT = 100
/** Garages looked at for suggestions, nearest first. */
const SUGGESTION_GARAGES = 12
const SUGGESTION_RADIUS_KM = 15
/** Suggestions shown. */
const SUGGESTIONS_SHOWN = 2

let reader: { scan: DocumentClient | null; job: DocumentClient | null } | undefined

/** The AI readers the config allows, or null when AI is off (no key, not faked). */
function readers() {
  if (reader === undefined) {
    const base = { apiKey: env.openaiApiKey, model: env.aiVisionModel, fake: env.aiFake }
    reader = {
      scan: documentClientFor({ ...base, fakeAnswer: JSON.stringify(FAKE_SCAN_READING) }),
      job: documentClientFor({ ...base, fakeAnswer: JSON.stringify(FAKE_JOB_READING) }),
    }
  }
  return reader
}

/** Tests only: stand in for OpenAI (or put the real config back with undefined). */
export function setShineReadersForTest(next: { scan: DocumentClient | null; job: DocumentClient | null } | undefined) {
  reader = next
}

const MAGIC: Record<string, (b: Uint8Array) => boolean> = {
  'image/jpeg': (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  'image/png': (b) => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47,
  'image/webp': (b) => b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50,
}

function imageTypeOf(contentType: string | null, key: string): DocumentFile['mimeType'] | null {
  const type = (contentType ?? '').split(';')[0]!.trim().toLowerCase()
  if (type === 'image/jpeg' || type === 'image/png' || type === 'image/webp') return type
  if (/\.png$/i.test(key)) return 'image/png'
  if (/\.webp$/i.test(key)) return 'image/webp'
  if (/\.jpe?g$/i.test(key)) return 'image/jpeg'
  return null
}

const unavailable = () =>
  new AppError(503, "Couldn't get your score just now. Try again; it didn't use a free scan.", 'AI_UNAVAILABLE')

function scoresOf(value: Record<string, number> | null): Partial<ShineAreaScores> {
  const out: Partial<ShineAreaScores> = {}
  for (const area of SHINE_AREAS) {
    const v = value?.[area]
    if (typeof v === 'number') out[area] = v
  }
  return out
}

function areasOf(value: readonly string[]): ShineArea[] {
  return SHINE_AREAS.filter((area) => value.includes(area))
}

/** A scan as its customer sees it: the scores and words, never the photos. */
function toScanView(scan: ShineScanRow) {
  const scores = scoresOf(scan.scores) as ShineAreaScores
  return {
    id: scan.id,
    overall: scan.overall ?? 0,
    scores,
    findings: (scan.findings ?? []).filter((f): f is { text: string; area: ShineArea } =>
      (SHINE_AREAS as readonly string[]).includes(f.area)
    ),
    summary: scan.summary ?? '',
    suggestion: scan.suggestion ?? '',
    need: needOf(scores) as ShineNeed,
    scoredAt: (scan.scoredAt ?? scan.createdAt).toISOString(),
  }
}

export type ShineScanView = ReturnType<typeof toScanView>

export const shineScoreService = {
  /** Public: whether it is on, and the numbers the screens say. */
  config() {
    return {
      enabled: env.shineScoreEnabled,
      scansPerDay: SHINE_RULES.scansPerDay,
      keepDays: SHINE_RULES.keepDays,
    }
  },

  /** The customer's free scans left today (IST). */
  async status(userId: string, now = new Date()) {
    const today = await repo.listScansOfDay(userId, istDateKey(now))
    return { scansLeft: scansLeft(today, now), scansPerDay: SHINE_RULES.scansPerDay }
  },

  /**
   * Scores four photos. Only the pictures go to the AI, never who took them
   * or anything else. A failed or unreadable scan does not use up a free
   * scan. The photos are kept privately once scored (deleted after
   * keepDays), and never shown again.
   */
  async createScan(userId: string, input: CreateScanInput, now = new Date()) {
    const client = readers().scan
    if (!client) throw unavailable()

    // In area order, checked to be the pictures they say they are.
    const photos = SHINE_AREAS.map((area) => {
      const photo = input.photos.find((p) => p.area === area)!
      const bytes = Uint8Array.from(Buffer.from(photo.dataBase64, 'base64'))
      if (bytes.length === 0 || bytes.length > SHINE_MAX_PHOTO_BYTES || !MAGIC[photo.mimeType]!(bytes)) {
        throw new AppError(400, `The ${SHINE_AREA_LABELS[area].toLowerCase()} photo could not be read. Take it again.`, 'SHINE_PHOTO_INVALID')
      }
      return { area, mimeType: photo.mimeType, bytes, dataBase64: photo.dataBase64 }
    })

    const istDay = istDateKey(now)
    const reserved = await repo.reserveScan({ userId, istDay, decide: (today) => scanRefusal(today, now) })
    if ('refusal' in reserved) {
      throw reserved.refusal === 'limit'
        ? new AppError(429, `You've used today's ${SHINE_RULES.scansPerDay} free scans. Come back tomorrow.`, 'SHINE_SCAN_LIMIT')
        : new AppError(429, "That's a lot of tries today. Come back tomorrow.", 'SHINE_TOO_MANY_TRIES')
    }
    const { scanId } = reserved

    let answer: string
    const started = Date.now()
    try {
      answer = await client.read({
        instructions: SCAN_INSTRUCTIONS,
        userText: SCAN_PHOTO_TEXT,
        imageDetail: 'auto',
        files: photos.map((p) => ({ name: `${p.area}.jpg`, mimeType: p.mimeType, dataBase64: p.dataBase64 })),
        schemaName: 'shine_scan',
        schema: SCAN_JSON_SCHEMA,
        maxOutputTokens: MAX_OUTPUT_TOKENS,
      })
    } catch (err) {
      await repo.failScan(scanId)
      if (err instanceof AiUnavailableError) {
        log.warn({ ms: Date.now() - started, reason: err.message }, 'shine:scan_ai_unavailable')
        throw unavailable()
      }
      throw err
    }

    const reading = parseScanReading(answer)
    if (!reading) {
      await repo.failScan(scanId)
      log.info({ ms: Date.now() - started }, 'shine:scan_unreadable')
      throw new AppError(
        422,
        "We couldn't see your car clearly in these photos. Retake them in daylight; this didn't use a free scan.",
        'SHINE_UNREADABLE'
      )
    }

    const overall = overallOf(reading.scores)
    const { summary, suggestion } = summaryOf(reading.scores)
    await repo.finishScan(scanId, {
      overall,
      scores: reading.scores,
      findings: reading.findings,
      summary,
      suggestion,
      scoredAt: now,
    })
    log.info({ ms: Date.now() - started, overall, photos: photos.length }, 'shine:scan_scored')

    // Kept privately for keepDays; a storage failure never fails the score.
    const keys = await putShineScanPhotos(
      photos.map((p) => ({ key: shineScanKey(scanId, p.area, p.mimeType), body: p.bytes, mimeType: p.mimeType }))
    ).catch(() => [] as string[])
    if (keys.length > 0) await repo.setScanPhotos(scanId, keys)

    const scan = await repo.findOwnScan(userId, scanId)
    const left = await repo.listScansOfDay(userId, istDay)
    return { scan: toScanView(scan!), scansLeft: scansLeft(left, now), scansPerDay: SHINE_RULES.scansPerDay }
  },

  async getScan(userId: string, scanId: string) {
    const scan = await repo.findOwnScan(userId, scanId)
    if (!scan || scan.status !== 'scored') throw new AppError(404, 'Not found', 'NOT_FOUND')
    return toScanView(scan)
  },

  /**
   * Real services at nearby garages for what the scan found: the garage
   * list's own nearest-first read (drop-in, within 15 km when the phone
   * says where it is; with nothing there, the nearest anywhere), then each
   * garage's best fitting wash. The location is used for this read only and
   * never stored.
   */
  async suggestions(query: SuggestionsQuery) {
    const located = query.lat !== undefined && query.lng !== undefined
    const near = located ? await shineScoreService.suggestionsFrom(query, SUGGESTION_RADIUS_KM) : []
    // Nothing within 15 km (or no location): the nearest garages anywhere, as the list shows them.
    const suggestions = near.length > 0 ? near : await shineScoreService.suggestionsFrom(query, null)
    return { suggestions }
  },

  async suggestionsFrom(query: SuggestionsQuery, radiusKm: number | null) {
    const located = query.lat !== undefined && query.lng !== undefined
    const list = await vendorsService.listPublicVendors({
      bookingType: 'dropin',
      limit: SUGGESTION_GARAGES,
      ...(located ? { lat: query.lat, lng: query.lng, includeUnlocated: false } : {}),
      ...(located && radiusKm !== null ? { radiusKm } : {}),
    })
    const garages = list.items.filter((g) => g.dropinEnabled)
    const rows = await repo.listServicesOf(garages.map((g) => g.id))
    const out = []
    for (const garage of garages) {
      const service = pickService(
        rows.filter((row) => row.vendorId === garage.id),
        query.need
      )
      if (!service) continue
      out.push({
        vendorId: garage.id,
        vendorName: garage.businessName,
        rating: garage.rating,
        reviewCount: garage.reviewCount,
        distanceKm: garage.distanceKm,
        service: {
          id: service.id,
          name: service.name,
          fromPrice: fromPrice(service).toFixed(2),
          perVehicle: service.pricingType === 'per_vehicle',
          durationMins: service.durationMins,
        },
      })
      if (out.length >= SUGGESTIONS_SHOWN) break
    }
    return out
  },

  // ─── Finished jobs ─────────────────────────────────────────────────────────

  /**
   * The booking page's "Your Shine went 46 → 92": only for the customer's
   * own finished booking, and only when the garage's before and after
   * photos show the same areas. A booking with no score yet is scored now,
   * after the response, and says `pending` (the page asks again).
   */
  async forBooking(userId: string, bookingId: string, now = new Date()) {
    const booking = await repo.findBooking(bookingId)
    if (!booking || booking.userId !== userId) throw new AppError(404, 'Not found', 'NOT_FOUND')
    if (booking.status !== 'completed') return { state: 'none' as const }
    const row = await repo.findJobScore(bookingId)
    if (row?.status === 'scored') {
      const areas = areasOf(row.areas)
      const before = scoresOf(row.beforeScores)
      const after = scoresOf(row.afterScores)
      return {
        state: 'scored' as const,
        before: row.beforeOverall ?? 0,
        after: row.afterOverall ?? 0,
        areas: areas.map((area) => ({ area, before: before[area] ?? 0, after: after[area] ?? 0 })),
        biggestChange: biggestChange(before, after, areas),
      }
    }
    if (row?.status === 'no_match') return { state: 'none' as const }
    const stale = row?.status === 'scoring' && now.getTime() - row.updatedAt.getTime() > STALE_SCORING_MS
    if (row && row.status !== 'failed' && !stale) return { state: 'pending' as const }
    if (row && row.attempts >= SHINE_JOB_MAX_ATTEMPTS) return { state: 'none' as const }
    // A try that just failed waits a minute before the next (claimJobScore says the same).
    if (row?.status === 'failed' && now.getTime() - row.updatedAt.getTime() < 60_000) return { state: 'pending' as const }
    shineScoreService.scheduleScore(bookingId)
    return { state: 'pending' as const }
  },

  /** After Mark completed / Delivered: never slows or fails it. Nothing while off. */
  scheduleAfterCompletion(bookingId: string): void {
    if (!env.shineScoreEnabled) return
    shineScoreService.scheduleScore(bookingId)
  },

  scheduleScore(bookingId: string): void {
    runInBackground('shine_job_score', () => shineScoreService.scoreJob(bookingId))
  },

  /**
   * Scores a finished job from the garage's before and after photos of the
   * matching areas. Claimed first, so it runs once at a time; an AI or
   * storage failure leaves it to be tried again (at most
   * SHINE_JOB_MAX_ATTEMPTS). An after-score under 60 goes to Shine checks
   * for a person to look at; nothing else happens to anyone.
   */
  async scoreJob(bookingId: string, now = new Date()): Promise<'scored' | 'no_match' | 'failed' | 'skipped'> {
    if (!env.shineScoreEnabled) return 'skipped'
    const client = readers().job
    if (!client) return 'skipped'
    const booking = await repo.findBooking(bookingId)
    if (!booking || booking.status !== 'completed') return 'skipped'
    const claimed = await repo.claimJobScore({
      bookingId,
      vendorId: booking.vendorId,
      maxAttempts: SHINE_JOB_MAX_ATTEMPTS,
      retryBefore: new Date(now.getTime() - 60_000),
      staleBefore: new Date(now.getTime() - STALE_SCORING_MS),
    })
    if (!claimed) return 'skipped'

    const photos: ShineJobPhoto[] = await repo.listGaragePhotos(bookingId)
    const matched = matchJobPhotos(photos)
    if (!matched) {
      await repo.endJobScore(bookingId, 'no_match')
      return 'no_match'
    }

    const files: DocumentFile[] = []
    for (const row of [...matched.before, ...matched.after]) {
      const object = await readJobPhoto(row.photo)
      const mimeType = object ? imageTypeOf(object.contentType, row.photo.storageKey) : null
      if (!object || !mimeType) {
        await repo.endJobScore(bookingId, 'failed')
        log.warn({ bookingId }, 'shine:job_photo_unreadable')
        return 'failed'
      }
      files.push({ name: `${row.photo.stage}.jpg`, mimeType, dataBase64: Buffer.from(object.body).toString('base64') })
    }

    const started = Date.now()
    let answer: string
    try {
      answer = await client.read({
        instructions: JOB_INSTRUCTIONS,
        userText: jobPhotoText(matched),
        imageDetail: 'auto',
        files,
        schemaName: 'shine_job',
        schema: JOB_JSON_SCHEMA,
        maxOutputTokens: MAX_OUTPUT_TOKENS,
      })
    } catch (err) {
      await repo.endJobScore(bookingId, 'failed')
      if (err instanceof AiUnavailableError) {
        log.warn({ bookingId, reason: err.message }, 'shine:job_ai_unavailable')
        return 'failed'
      }
      throw err
    }
    const reading = parseJobReading(answer, matched.areas)
    if (!reading) {
      await repo.endJobScore(bookingId, 'failed')
      log.info({ bookingId }, 'shine:job_unreadable')
      return 'failed'
    }
    const beforeOverall = overallOf(reading.before, matched.areas)
    const afterOverall = overallOf(reading.after, matched.areas)
    await repo.saveJobScore(bookingId, {
      areas: matched.areas,
      beforeOverall,
      afterOverall,
      beforeScores: reading.before as Record<string, number>,
      afterScores: reading.after as Record<string, number>,
      findings: reading.findings,
      reviewStatus: needsReview(afterOverall) ? 'new' : null,
      scoredAt: now,
    })
    log.info({ bookingId, beforeOverall, afterOverall, areas: matched.areas.length, ms: Date.now() - started }, 'shine:job_scored')
    return 'scored'
  },

  /**
   * The pending-digest cron's part: scans past keepDays are deleted with
   * their photos (whatever the switch says: a promise about deletion holds
   * when the feature is off), then, while on, one finished job of the last
   * two days with no score yet is scored (the completion hook's catch-up).
   */
  async sweep(options: { dryRun: boolean }, now = new Date()) {
    const expired = await repo.listExpiredScans(new Date(now.getTime() - SHINE_RULES.keepDays * 86_400_000), PURGE_BATCH)
    let purged = 0
    if (!options.dryRun && expired.length > 0) {
      await removeShineScanPhotos(expired.flatMap((scan) => scan.photoKeys))
      purged = await repo.deleteScans(expired.map((scan) => scan.id))
    }
    if (!env.shineScoreEnabled) return { enabled: false as const, expired: expired.length, purged }
    const due = await repo.listFinishedWithoutScore(
      new Date(now.getTime() - SHINE_JOB_SWEEP_DAYS * 86_400_000),
      SHINE_JOB_SWEEP_BATCH
    )
    let scored = 0
    if (!options.dryRun) {
      for (const job of due) {
        if ((await shineScoreService.scoreJob(job.id, now)) === 'scored') scored += 1
      }
    }
    return { enabled: true as const, expired: expired.length, purged, jobsDue: due.length, scored }
  },

  // ─── Admin: Shine checks ───────────────────────────────────────────────────

  async listChecks(query: ListChecksQuery) {
    const counted = await repo.countReviews()
    const rows = await repo.listReviews(query.show, CHECKS_LIMIT)
    const photos = await repo.listGaragePhotosOf(rows.map((row) => row.score.bookingId))
    const counts = { new: 0, looks_fine: 0, followed_up: 0 }
    for (const row of counted) if (row.status) counts[row.status] = Number(row.count)

    const checks = rows.map((row) => {
      const s = row.score
      const areas = areasOf(s.areas)
      const after = scoresOf(s.afterScores)
      const matched = matchJobPhotos(photos.filter((p) => p.bookingId === s.bookingId))
      const lowest = lowestArea(after, areas)
      return {
        id: s.id,
        status: s.reviewStatus!,
        scoredAt: (s.scoredAt ?? s.createdAt).toISOString(),
        beforeScore: s.beforeOverall ?? 0,
        afterScore: s.afterOverall ?? 0,
        lowestArea: lowest ? SHINE_AREA_LABELS[lowest] : null,
        findings: (s.findings ?? []).map((f) => f.text),
        garage: { id: s.vendorId, name: row.garageName ?? 'Garage deleted' },
        booking: {
          id: s.bookingId,
          reference: s.bookingId.slice(0, 8).toUpperCase(),
          scheduledAt: row.bookingScheduledAt.toISOString(),
          markedTest: row.bookingMarkedTest !== null,
        },
        customer: row.customerId ? { id: row.customerId, name: row.customerName, phone: row.customerPhone } : null,
        // The after photos the score was made from: short-lived links for super-admin only.
        photos: (matched?.after ?? []).map((p) => ({ id: p.photo.id, url: jobPhotoLink(p.photo.url) })),
        reviewedAt: s.reviewedAt?.toISOString() ?? null,
        reviewedBy: s.reviewedBy,
      }
    })
    return { checks, counts, rules: { lowAfterScore: SHINE_RULES.lowAfterScore } }
  },

  async reviewCheck(id: string, input: ReviewCheckInput, now = new Date()) {
    const row = await repo.findReview(id)
    if (!row || row.reviewStatus === null) throw new AppError(404, 'Not found', 'NOT_FOUND')
    const done = await repo.markReviewed(id, input.outcome, input.actorName, now)
    if (!done) throw new AppError(409, 'Someone already marked this one.', 'SHINE_CHECK_REVIEWED')
    log.info({ id, outcome: input.outcome }, 'shine:check_reviewed')
    return { id, status: input.outcome }
  },
}
