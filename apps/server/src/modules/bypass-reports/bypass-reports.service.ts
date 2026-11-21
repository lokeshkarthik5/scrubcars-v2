import { bookingReference } from '../../lib/booking-ops.js'
import {
  BYPASS_KIND_LABELS,
  BYPASS_RULES,
  REWARD_PAISE,
  rewardDecision,
  rewardReason,
  reachedStrikeAlert,
  reportWindowRefusal,
  reportsLeft,
  strikeWindowStart,
  strikesHighlighted,
  submitRefusal,
  yearStart,
  type SubmitRefusal,
  type WindowRefusal,
} from '../../lib/bypass-reports.js'
import { DROP_OFF_RULES, dropOff, windowStartDays } from '../../lib/drop-off.js'
import { textClientFor, type TextClient } from '../../lib/ai.js'
import {
  AI_NOTE_INSTRUCTIONS,
  FLAG_KIND,
  FLAG_SIGNAL_LABELS,
  NOTE_SOURCE_LABELS,
  OFF_APP_FLAG_RULES,
  aiSaysYes,
  inspectionCancelRuns,
  inspectionEvidenceKey,
  maskForAi,
  noteEvidenceKey,
  noteExcerpt,
  regularsEvidenceKey,
  regularsWentQuiet,
  runDays,
  scanNote,
  type BypassSource,
  type FlagEvidence,
} from '../../lib/off-app-flags.js'
import { env } from '../../lib/env.js'
import { AppError, hasPgCode } from '../../lib/errors.js'
import { rupees } from '../../lib/gift-credit.js'
import { logger } from '../../lib/logger.js'
import { alertOps } from '../../lib/ops-alerts.js'
import { customerReportReward } from '../../lib/push-messages.js'
import { certificationRepository } from '../certification/certification.repository.js'
import { pushService } from '../push/push.service.js'
import {
  bypassReportsRepository,
  type AdminReportRow,
  type BypassReportRecord,
} from './bypass-reports.repository.js'
import type {
  ConfirmBypassReportInput,
  CreateBypassReportInput,
  DismissBypassReportInput,
  ListBypassReportsQuery,
} from './bypass-reports.validation.js'

const log = logger.child({ module: 'bypass-reports' })

/** My reports: a customer makes at most 5 a year. */
const CUSTOMER_LIST_LIMIT = 50
/** The admin list per status: pilot-sized; the counts are exact. */
const ADMIN_LIST_LIMIT = 200
/** Owed rewards the cron grants a run, once Detlio credit is on. */
const OWED_SWEEP_LIMIT = 20
/** The most chains drop-off reads in one go (pilot scale is far below). */
const DROP_OFF_ROW_LIMIT = 20_000
/** Postgres's query_canceled: the read ran past its statement timeout. */
const TIMED_OUT = '57014'

/** Whether Detlio credit is on: a reward is granted now, or owed until it is. */
const creditOn = () => env.giftsEnabled

function notFound() {
  return new AppError(404, 'Report not found', 'BYPASS_REPORT_NOT_FOUND')
}

function bookingNotFound() {
  return new AppError(404, 'Booking not found', 'BOOKING_NOT_FOUND')
}

/** What the customer reads about a refusal, with its code. */
function refusalError(refusal: SubmitRefusal): AppError {
  switch (refusal) {
    case 'not_accepted':
      return new AppError(409, 'You can tell us about this once the garage has accepted the booking.', 'BYPASS_NOT_YET')
    case 'window_closed':
      return new AppError(
        409,
        `This booking ended more than ${BYPASS_RULES.reportWindowDays} days ago. If something happened, use Help to contact us.`,
        'BYPASS_WINDOW_CLOSED'
      )
    case 'already_reported':
      return new AppError(409, 'You have already told us about this booking. Thank you.', 'BYPASS_ALREADY_REPORTED')
    case 'limit_reached':
      return new AppError(
        409,
        `You can make up to ${BYPASS_RULES.maxReportsPerYear} reports a year. For anything else, use Help to contact us.`,
        'BYPASS_REPORT_LIMIT'
      )
  }
}

/**
 * What the customer sees of their own report: what they said and where it
 * stands. Never who on the team handled it, why it was dismissed, or the
 * garage's strikes.
 */
function toCustomerReport(row: BypassReportRecord) {
  return {
    id: row.id,
    bookingId: row.bookingId,
    bookingRef: row.bookingRef,
    garageName: row.garageName,
    kind: row.kind,
    note: row.note,
    status: row.status,
    reward: row.rewardStatus,
    rewardAmount: rupees(REWARD_PAISE),
    createdAt: row.createdAt.toISOString(),
    rewardGrantedAt: row.rewardGrantedAt?.toISOString() ?? null,
  }
}

type People = Map<string, { name: string | null; phone: string | null }>

/** Whether Detlio's own checks are on (OFF_APP_FLAGS_ENABLED, 0077). */
const flagsOn = () => env.offAppFlagsEnabled

/** The customer a flag is about, if any: its booking's (a note) or the run's (inspection). */
function flagCustomerId(row: AdminReportRow): string | null {
  const evidence = row.report.evidence
  if (!evidence) return null
  if (evidence.signal === 'cancelled_after_inspection') return evidence.userId
  if (evidence.signal === 'contact_in_note') return row.bookingUserId
  return null
}

/** Everyone a page of flags names, for one read of their names. */
function peopleIn(rows: AdminReportRow[]): string[] {
  const ids = new Set<string>()
  for (const row of rows) {
    const customer = flagCustomerId(row)
    if (customer) ids.add(customer)
    const evidence = row.report.evidence
    if (evidence?.signal === 'regulars_went_quiet') for (const c of evidence.customers) ids.add(c.userId)
  }
  return [...ids]
}

/**
 * A flag's evidence as admin reads it: what was found, masked (a full phone
 * number was never stored), with the bookings to open and the customers'
 * names. Nothing here ever reaches a garage or a customer.
 */
function toEvidenceView(evidence: FlagEvidence, people: People) {
  switch (evidence.signal) {
    case 'contact_in_note':
      return {
        signal: evidence.signal,
        where: NOTE_SOURCE_LABELS[evidence.where],
        writtenAt: evidence.writtenAt,
        excerpt: evidence.excerpt,
        found: evidence.found,
        confirmedByAi: evidence.confirmedByAi,
      }
    case 'regulars_went_quiet':
      return {
        signal: evidence.signal,
        regulars: evidence.regulars,
        stopped: evidence.stopped,
        bookingElsewhere: evidence.bookingElsewhere,
        stoppedDays: evidence.stoppedDays,
        customers: evidence.customers.map((c) => ({
          id: c.userId,
          name: people.get(c.userId)?.name ?? null,
          lastBookingId: c.lastBookingId,
          lastBookingRef: c.lastBookingRef,
          lastAt: c.lastAt,
        })),
      }
    case 'cancelled_after_inspection':
      return { signal: evidence.signal, days: evidence.days, bookings: evidence.bookings }
  }
}

function toAdminReport(row: AdminReportRow, strikes: Map<string, number>, people: People = new Map()) {
  const r = row.report
  const flag = r.source === 'detlio' && r.signal && r.evidence
  const flagCustomer = flag ? flagCustomerId(row) : null
  return {
    id: r.id,
    status: r.status,
    // 'customer' for a customer's report, 'detlio' for Detlio's own flag (0077).
    source: r.source,
    signal: r.signal,
    kind: r.kind,
    kindLabel: flag && r.signal ? FLAG_SIGNAL_LABELS[r.signal] : BYPASS_KIND_LABELS[r.kind],
    note: r.note,
    createdAt: r.createdAt.toISOString(),
    garage: {
      // Null once the garage was deleted forever; the name stays.
      id: r.vendorId,
      name: r.garageName,
      strikes: r.vendorId ? (strikes.get(r.vendorId) ?? 0) : 0,
      highlighted: r.vendorId ? strikesHighlighted(strikes.get(r.vendorId) ?? 0) : false,
    },
    booking: {
      // Null once the booking itself is gone (the reset, or Delete forever),
      // and on a flag about a garage rather than one booking.
      id: r.bookingId,
      reference: r.bookingRef,
      status: row.bookingStatus,
      scheduledAt: row.bookingScheduledAt?.toISOString() ?? null,
      markedTest: row.bookingMarkedTest,
      // The pickup fee paid in the app (0079), beside "Asked for extra pickup money".
      pickupFee: row.bookingPickupFee == null ? null : Number(row.bookingPickupFee),
    },
    // Admin only: the garage never sees who reported. Null once the account
    // was deleted, and on a flag about no one customer.
    customer: flag
      ? flagCustomer
        ? { id: flagCustomer, name: people.get(flagCustomer)?.name ?? null, phone: people.get(flagCustomer)?.phone ?? null }
        : null
      : r.userId
        ? { id: r.userId, name: row.customerName, phone: row.customerPhone }
        : null,
    evidence: flag && r.evidence ? toEvidenceView(r.evidence, people) : null,
    confirmedAt: r.confirmedAt?.toISOString() ?? null,
    confirmedBy: r.confirmedBy,
    dismissedAt: r.dismissedAt?.toISOString() ?? null,
    dismissedBy: r.dismissedBy,
    dismissedReason: r.dismissedReason,
    reward: { status: r.rewardStatus, grantedAt: r.rewardGrantedAt?.toISOString() ?? null },
  }
}

/** The names a page of flags needs, in one read (none for customers' reports). */
async function peopleFor(rows: AdminReportRow[]): Promise<People> {
  const ids = peopleIn(rows)
  if (ids.length === 0) return new Map()
  const found = await bypassReportsRepository.customerNames(ids)
  return new Map(found.map((row) => [row.id, { name: row.name, phone: row.phone }]))
}

/** Strikes now, for the garages a page of reports names. */
async function strikesFor(vendorIds: Array<string | null>, now: Date): Promise<Map<string, number>> {
  const ids = [...new Set(vendorIds.filter((id): id is string => id !== null))]
  const rows = await bypassReportsRepository.strikeCounts({ vendorIds: ids, since: strikeWindowStart(now) })
  return new Map(rows.map((row) => [row.vendorId, row.count]))
}

/** After a reward was added: the push (Updates derives its row from the report). */
function tellRewarded(report: BypassReportRecord) {
  if (report.userId && report.rewardStatus === 'granted') {
    pushService.notifyCustomer(report.userId, customerReportReward(report, rupees(REWARD_PAISE)))
  }
}

export const bypassReportsService = {
  // ─── The customer's ────────────────────────────────────────────────────────

  /**
   * Whether the customer can report this booking now, and their report if
   * they made one. Anyone else's booking is a 404.
   */
  async statusForBooking(userId: string, bookingId: string, now = new Date()) {
    const chain = await bypassReportsRepository.findOwnChain(userId, bookingId)
    if (!chain) throw bookingNotFound()
    const report = await bypassReportsRepository.findOwnByRoot(userId, chain.rootBookingId)
    const inLastYear = await bypassReportsRepository.countSince(userId, yearStart(now))
    const window: WindowRefusal | null = reportWindowRefusal(chain.latest, now)
    const refusal = report ? null : submitRefusal({ window, alreadyReported: false, inLastYear })
    return {
      canReport: !report && refusal === null,
      refusal: report ? null : refusal,
      report: report ? toCustomerReport(report) : null,
      reportsLeft: reportsLeft(inLastYear),
      // The reward line shows only while Detlio credit is on.
      rewardOffered: creditOn(),
      rewardAmount: rupees(REWARD_PAISE),
    }
  },

  /**
   * A customer reports their booking's garage. Their own booking only; the
   * window, one per booking and five a year are checked under their lock.
   * Nothing reaches the garage; the team is told on Telegram.
   */
  async submit(userId: string, input: CreateBypassReportInput, now = new Date()) {
    const chain = await bypassReportsRepository.findOwnChain(userId, input.bookingId)
    if (!chain) throw bookingNotFound()
    const window = reportWindowRefusal(chain.latest, now)

    const outcome = await bypassReportsRepository.insertUnderLimits({
      userId,
      since: yearStart(now),
      values: {
        bookingId: chain.latest.id,
        rootBookingId: chain.rootBookingId,
        bookingRef: bookingReference(chain.latest.id),
        vendorId: chain.latest.vendorId,
        garageName: chain.latest.garageName.slice(0, 255),
        kind: input.kind,
        note: input.note ?? null,
      },
      decide: (counts) => submitRefusal({ window, ...counts }),
    })
    if (!outcome.created) {
      log.warn({ refusal: outcome.refusal }, 'bypass_report:refused')
      throw refusalError(outcome.refusal)
    }

    const created = outcome.created
    log.info({ reportId: created.id, vendorId: created.vendorId, kind: created.kind }, 'bypass_report:created')
    // Read after the response: the garage's strikes so far, for the alert.
    alertOps(async () => {
      const strikes = created.vendorId ? (await strikesFor([created.vendorId], new Date())).get(created.vendorId) ?? 0 : 0
      return {
        kind: 'bypass_report_received',
        garage: created.garageName,
        bookingId: created.bookingId,
        what: BYPASS_KIND_LABELS[created.kind],
        note: created.note,
        strikes,
      }
    })
    return toCustomerReport(created)
  },

  /** The customer's own reports, newest first. */
  async listMine(userId: string) {
    const rows = await bypassReportsRepository.listForCustomer(userId, CUSTOMER_LIST_LIMIT)
    return rows.map(toCustomerReport)
  },

  /** Rewards added to the customer's credit since `since`, for Updates. */
  async rewardsForHub(userId: string, since: Date) {
    const rows = await bypassReportsRepository.listRewardsGrantedSince(userId, since)
    return rows.flatMap((row) =>
      row.grantedAt ? [{ id: row.id, grantedAt: row.grantedAt, amount: rupees(REWARD_PAISE) }] : []
    )
  },

  // ─── Admin ─────────────────────────────────────────────────────────────────

  /**
   * Admin's list: one status, and which kind of entry (`from`: all,
   * customers' reports, or Detlio's flags). While OFF_APP_FLAGS_ENABLED is
   * off, flags are left out of the list and every count, and `flags` says
   * so: the screen is as it was.
   */
  async list(query: { show: ListBypassReportsQuery['show']; from?: ListBypassReportsQuery['from'] }, now = new Date()) {
    const on = flagsOn()
    const from = on ? (query.from ?? 'all') : 'customer'
    const sources: BypassSource[] = from === 'all' ? ['customer', 'detlio'] : [from]
    // One after the other: the API has a single connection (db/index.ts).
    const rows = await bypassReportsRepository.listForAdmin(query.show, sources, ADMIN_LIST_LIMIT)
    const counts = await bypassReportsRepository.countByStatus(on ? ['customer', 'detlio'] : ['customer'])
    const bySource = on ? await bypassReportsRepository.countBySource(query.show) : null
    const strikes = await strikesFor(rows.map((row) => row.report.vendorId), now)
    const people = on ? await peopleFor(rows) : new Map()
    return {
      reports: rows.map((row) => toAdminReport(row, strikes, people)),
      counts,
      flags: bySource
        ? {
            enabled: true as const,
            from,
            counts: { all: bySource.customer + bySource.detlio, customer: bySource.customer, detlio: bySource.detlio },
          }
        : { enabled: false as const },
      rules: {
        rewardAmount: rupees(REWARD_PAISE),
        strikeWindowDays: BYPASS_RULES.strikeWindowDays,
        strikeAlertAt: BYPASS_RULES.strikeAlertAt,
        creditOn: creditOn(),
      },
    }
  },

  async get(id: string, now = new Date()) {
    const row = await bypassReportsRepository.findForAdmin(id)
    if (!row) throw notFound()
    const strikes = await strikesFor([row.report.vendorId], now)
    return toAdminReport(row, strikes, await peopleFor([row]))
  },

  /**
   * Detlio confirms a report: a strike against the garage, and the reward
   * (₹100 of Detlio credit, once per customer per garage; owed while credit
   * is off). Only from New; a second press is 409.
   */
  async confirm(sub: string, id: string, input: ConfirmBypassReportInput, now = new Date()) {
    const outcome = await bypassReportsRepository.confirm({
      id,
      actorName: input.actorName,
      actorSub: sub,
      now,
      strikesSince: strikeWindowStart(now),
      rewardAmountPaise: REWARD_PAISE,
      rewardReason: (ref) => rewardReason(ref),
      decide: (facts) => rewardDecision({ ...facts, creditOn: creditOn() }),
    })
    if (outcome.kind === 'not_found') throw notFound()
    if (outcome.kind === 'moved_on') throw alreadyAnswered()

    const { report, strikesBefore, strikesAfter, reward } = outcome
    log.info(
      { reportId: report.id, vendorId: report.vendorId, strikes: strikesAfter, reward: reward.kind },
      'bypass_report:confirmed'
    )
    tellRewarded(report)

    if (report.vendorId && reachedStrikeAlert(strikesBefore, strikesAfter)) {
      const vendorId = report.vendorId
      alertOps(async () => ({
        kind: 'bypass_strikes_reached',
        vendorId,
        garage: report.garageName,
        strikes: strikesAfter,
        windowDays: BYPASS_RULES.strikeWindowDays,
        certified: (await certificationRepository.listCertifiedIds([vendorId])).includes(vendorId),
      }))
    }
    return bypassReportsService.get(report.id, now)
  },

  async dismiss(sub: string, id: string, input: DismissBypassReportInput, now = new Date()) {
    const moved = await bypassReportsRepository.dismiss({
      id,
      actorName: input.actorName,
      actorSub: sub,
      reason: input.reason,
      now,
    })
    if (!moved) {
      if (!(await bypassReportsRepository.exists(id))) throw notFound()
      throw alreadyAnswered()
    }
    log.info({ reportId: id }, 'bypass_report:dismissed')
    return bypassReportsService.get(id, now)
  },

  /** A garage's strikes and its reports, for its admin page. */
  async forGarage(vendorId: string, now = new Date()) {
    if (!(await bypassReportsRepository.garageExists(vendorId))) {
      throw new AppError(404, 'Garage not found', 'VENDOR_NOT_FOUND')
    }
    const strikes = (await strikesFor([vendorId], now)).get(vendorId) ?? 0
    // Detlio's flags count only while they are on, as in the list (0077).
    const counts = await bypassReportsRepository.countForGarage(vendorId, flagsOn() ? ['customer', 'detlio'] : ['customer'])
    return {
      strikes,
      highlighted: strikesHighlighted(strikes),
      windowDays: BYPASS_RULES.strikeWindowDays,
      newReports: counts.new,
      confirmed: counts.confirmed,
      dismissed: counts.dismissed,
    }
  },

  /** Every garage's strikes now, for admin's garage list (one grouped read). */
  async strikesByGarage(now = new Date()): Promise<Map<string, number>> {
    const rows = await bypassReportsRepository.strikeCounts({ vendorIds: null, since: strikeWindowStart(now) })
    return new Map(rows.map((row) => [row.vendorId, row.count]))
  },

  /**
   * The pending-digest cron's part: rewards owed while Detlio credit was off
   * are granted once it is on (bounded, oldest first). Nothing while off.
   */
  async sweepOwedRewards(options: { dryRun: boolean }, now = new Date()) {
    if (!creditOn()) return { enabled: false as const }
    const ids = await bypassReportsRepository.listOwed(OWED_SWEEP_LIMIT)
    if (options.dryRun) return { enabled: true as const, owed: ids.length, granted: 0 }
    let granted = 0
    for (const id of ids) {
      try {
        const report = await bypassReportsRepository.grantOwed({
          id,
          now,
          rewardAmountPaise: REWARD_PAISE,
          rewardReason: (ref) => rewardReason(ref),
        })
        if (report) {
          granted += 1
          tellRewarded(report)
        }
      } catch (err) {
        log.error({ err, reportId: id }, 'bypass_report:reward_grant_failed')
      }
    }
    if (granted > 0) log.info({ granted }, 'bypass_report:owed_rewards_granted')
    return { enabled: true as const, owed: ids.length, granted }
  },

  // ─── Detlio's flags (0077) ──────────────────────────────────────────────────

  /**
   * Detlio's own checks (lib/off-app-flags.ts): new "Flagged by Detlio"
   * entries, once each (the evidence key), never a strike or a reward on
   * their own. Run by the pending-digest cron's 07:00 IST tick and admin's
   * Check now. Nothing at all while OFF_APP_FLAGS_ENABLED is off. Each check
   * is on its own: one failing leaves the others to run. Never reads Garage
   * Book (garage_*).
   */
  async runFlagChecks(
    options: {
      dryRun: boolean
      /** Tests only: the AI client (else the one the config allows) and the clock for its time budget. */
      ai?: TextClient | null
      clock?: () => number
    },
    now = new Date()
  ) {
    if (!flagsOn()) return { enabled: false as const }
    const summary = { enabled: true as const, created: 0, notes: 0, aiAsked: 0, regulars: 0, inspection: 0, failed: 0 }
    const clock = options.clock ?? Date.now
    const started = clock()

    // 1. A phone number, UPI ID or "pay directly" in a garage's note.
    try {
      const since = new Date(now.getTime() - OFF_APP_FLAG_RULES.noteLookbackDays * 24 * 60 * 60 * 1000)
      const notes = await bypassReportsRepository.garageNotesSince(since, OFF_APP_FLAG_RULES.noteLimit)
      summary.notes = notes.length
      const ai =
        options.ai !== undefined
          ? options.ai
          : textClientFor({ apiKey: env.openaiApiKey, model: env.aiTextModel, fake: env.aiFake })
      // Set when AI fails once: no more questions this run (it is down or slow).
      let aiDown = false
      for (const note of notes) {
        const scan = scanNote(note.text)
        if (!scan.strength) continue
        const key = noteEvidenceKey({ rootBookingId: note.rootBookingId, where: note.where, noteId: note.noteId })
        let confirmedByAi = false
        if (scan.strength === 'weak') {
          // Softer wording: only when AI is on, a few a run, and never twice for one note.
          if (!ai || aiDown || summary.aiAsked >= OFF_APP_FLAG_RULES.aiChecksPerRun) continue
          // Within the run's AI time budget (the digest shares the API's 60 s).
          if (clock() - started > OFF_APP_FLAG_RULES.aiBudgetMs) continue
          if (await bypassReportsRepository.flagExists(key)) continue
          summary.aiAsked += 1
          try {
            // The note alone, numbers and UPI IDs masked: never a name, a phone or the booking.
            const answer = await ai.complete({
              instructions: AI_NOTE_INSTRUCTIONS,
              input: maskForAi(note.text),
              maxOutputTokens: 400,
            })
            if (!aiSaysYes(answer)) continue
            confirmedByAi = true
          } catch (err) {
            log.warn({ err, where: note.where }, 'off_app_flags:ai_unavailable')
            aiDown = true
            continue
          }
        }
        if (options.dryRun) {
          summary.created += 1
          continue
        }
        const created = await bypassReportsRepository.insertFlag({
          vendorId: note.vendorId,
          garageName: note.garageName,
          bookingId: note.bookingId,
          bookingRef: bookingReference(note.bookingId),
          signal: 'contact_in_note',
          kind: FLAG_KIND.contact_in_note,
          evidenceKey: key,
          evidence: {
            signal: 'contact_in_note',
            bookingId: note.bookingId,
            bookingRef: bookingReference(note.bookingId),
            where: note.where,
            writtenAt: note.writtenAt.toISOString(),
            excerpt: noteExcerpt(note.text),
            found: scan.found.length > 0 ? scan.found : ['wording'],
            confirmedByAi,
          },
        })
        if (created) summary.created += 1
      }
    } catch (err) {
      summary.failed += 1
      log.error({ err }, 'off_app_flags:notes_failed')
    }

    // 2. Repeat customers who stopped booking a garage.
    try {
      const chains = await bypassReportsRepository.dropOffChains({
        regularFrom: windowStartDays(now, OFF_APP_FLAG_RULES.regularWindowDays),
        historyFrom: windowStartDays(now, OFF_APP_FLAG_RULES.regularWindowDays),
        minCompleted: OFF_APP_FLAG_RULES.regularMinCompleted,
        limit: DROP_OFF_ROW_LIMIT,
      })
      const garages = regularsWentQuiet(chains, now)
      summary.regulars = garages.length
      const names = new Map(
        (await bypassReportsRepository.garageNames(garages.map((g) => g.vendorId))).map((row) => [row.id, row])
      )
      for (const garage of garages) {
        const named = names.get(garage.vendorId)
        // A garage in the Bin has no customers to lose.
        if (!named || named.deletedAt) continue
        // Once per garage per 30 days. The key's 30-day period alone would
        // let a flag on a period's last day be followed by another the next
        // morning, in the new period.
        const repeatSince = new Date(now.getTime() - OFF_APP_FLAG_RULES.regularsRepeatDays * 24 * 60 * 60 * 1000)
        if (await bypassReportsRepository.recentFlagExists(garage.vendorId, 'regulars_went_quiet', repeatSince)) continue
        if (options.dryRun) {
          summary.created += 1
          continue
        }
        const created = await bypassReportsRepository.insertFlag({
          vendorId: garage.vendorId,
          garageName: named.name,
          bookingId: null,
          bookingRef: null,
          signal: 'regulars_went_quiet',
          kind: FLAG_KIND.regulars_went_quiet,
          evidenceKey: regularsEvidenceKey(garage.vendorId, now),
          evidence: {
            signal: 'regulars_went_quiet',
            regulars: garage.regulars,
            stopped: garage.stopped,
            bookingElsewhere: garage.bookingElsewhere,
            stoppedDays: OFF_APP_FLAG_RULES.stoppedDays,
            customers: garage.customers.slice(0, OFF_APP_FLAG_RULES.regularsListed).map((c) => ({
              userId: c.userId,
              lastBookingId: c.lastBookingId,
              lastBookingRef: bookingReference(c.lastBookingId),
              lastAt: c.lastAt.toISOString(),
            })),
          },
        })
        if (created) summary.created += 1
      }
    } catch (err) {
      summary.failed += 1
      log.error({ err }, 'off_app_flags:regulars_failed')
    }

    // 3. The same customer and garage cancelling after inspection, again.
    try {
      const since = new Date(now.getTime() - OFF_APP_FLAG_RULES.inspectionWindowDays * 24 * 60 * 60 * 1000)
      const rows = await bypassReportsRepository.inspectionCancelsSince(since, DROP_OFF_ROW_LIMIT)
      const runs = inspectionCancelRuns(rows, now)
      summary.inspection = runs.length
      const names = new Map(
        (await bypassReportsRepository.garageNames([...new Set(runs.map((r) => r.vendorId))])).map((row) => [row.id, row])
      )
      for (const run of runs) {
        const named = names.get(run.vendorId)
        const latest = run.bookings[run.bookings.length - 1]
        if (!named || !latest) continue
        if (options.dryRun) {
          summary.created += 1
          continue
        }
        const created = await bypassReportsRepository.insertFlag({
          vendorId: run.vendorId,
          garageName: named.name,
          bookingId: latest.bookingId,
          bookingRef: bookingReference(latest.bookingId),
          signal: 'cancelled_after_inspection',
          kind: FLAG_KIND.cancelled_after_inspection,
          evidenceKey: inspectionEvidenceKey(run),
          evidence: {
            signal: 'cancelled_after_inspection',
            userId: run.userId,
            days: runDays(run),
            bookings: run.bookings.map((b) => ({
              id: b.bookingId,
              ref: bookingReference(b.bookingId),
              cancelledAt: b.cancelledAt.toISOString(),
              reason: b.reason ? noteExcerpt(b.reason) : null,
            })),
          },
        })
        if (created) summary.created += 1
      }
    } catch (err) {
      summary.failed += 1
      log.error({ err }, 'off_app_flags:inspection_failed')
    }

    if (summary.created > 0 || summary.failed > 0) log.info(summary, 'off_app_flags:checked')
    return summary
  },

  /** Admin's Check now: the same checks at once. A 404 while the switch is off. */
  async checkFlagsNow(now = new Date()) {
    if (!flagsOn()) throw new AppError(404, 'Detlio flags are off', 'OFF_APP_FLAGS_OFF')
    const summary = await bypassReportsService.runFlagChecks({ dryRun: false }, now)
    return summary.enabled ? { created: summary.created, failed: summary.failed } : { created: 0, failed: 0 }
  },

  /**
   * Customer drop-off: regulars of a garage who went quiet on Detlio
   * (lib/drop-off.ts). Computed on read, on request, from one bounded
   * read-only query (pilot scale: a few thousand chains); nothing is stored
   * and nothing customer- or garage-facing reads it.
   */
  async dropOff(now = new Date()) {
    let chains
    try {
      chains = await bypassReportsRepository.dropOffChains({
        regularFrom: windowStartDays(now, DROP_OFF_RULES.regularWindowDays),
        historyFrom: windowStartDays(now, DROP_OFF_RULES.historyDays),
        minCompleted: DROP_OFF_RULES.regularMinCompleted,
        limit: DROP_OFF_ROW_LIMIT,
      })
    } catch (error) {
      if (hasPgCode(error, TIMED_OUT)) {
        log.warn({ err: error }, 'drop_off:timed_out')
        throw new AppError(503, 'Drop-off took too long to work out. Try again in a minute.', 'DROP_OFF_TIMEOUT')
      }
      throw error
    }
    const { pairs, garages } = dropOff(chains, now)
    const vendorNames = new Map(
      (await bypassReportsRepository.garageNames(garages.map((g) => g.vendorId))).map((row) => [row.id, row])
    )
    const quietPairs = pairs.filter((pair) => pair.wentQuiet)
    const customers = new Map(
      (await bypassReportsRepository.customerNames(quietPairs.map((pair) => pair.userId))).map((row) => [row.id, row])
    )
    const strikes = await strikesFor(garages.map((g) => g.vendorId), now)
    return {
      rules: DROP_OFF_RULES,
      truncated: chains.length >= DROP_OFF_ROW_LIMIT,
      garages: garages.map((garage) => ({
        vendorId: garage.vendorId,
        name: vendorNames.get(garage.vendorId)?.name ?? 'Garage',
        inBin: vendorNames.get(garage.vendorId)?.deletedAt != null,
        regulars: garage.regulars,
        wentQuiet: garage.wentQuiet,
        rate: Math.round(garage.rate * 1000) / 1000,
        flagged: garage.flagged,
        strikes: strikes.get(garage.vendorId) ?? 0,
      })),
      quiet: quietPairs.map((pair) => ({
        vendorId: pair.vendorId,
        garageName: vendorNames.get(pair.vendorId)?.name ?? 'Garage',
        customer: {
          id: pair.userId,
          name: customers.get(pair.userId)?.name ?? null,
          phone: customers.get(pair.userId)?.phone ?? null,
        },
        completedHere: pair.completedHere,
        usualGapDays: pair.usualGapDays,
        thresholdDays: pair.thresholdDays,
        quietDays: pair.quietDays,
        lastBookingId: pair.lastBookingId,
        lastBookingRef: bookingReference(pair.lastBookingId),
        lastServiceAt: pair.lastServiceAt.toISOString(),
      })),
      now: now.toISOString(),
    }
  },
}

/** A press on a report that has been answered since the page loaded. */
function alreadyAnswered() {
  return new AppError(
    409,
    'This report has already been confirmed or dismissed. Reload to see it as it is now.',
    'BYPASS_REPORT_ANSWERED'
  )
}
