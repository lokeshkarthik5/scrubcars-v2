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

function toAdminReport(row: AdminReportRow, strikes: Map<string, number>) {
  const r = row.report
  return {
    id: r.id,
    status: r.status,
    kind: r.kind,
    kindLabel: BYPASS_KIND_LABELS[r.kind],
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
      // Null once the booking itself is gone (the reset, or Delete forever).
      id: r.bookingId,
      reference: r.bookingRef,
      status: row.bookingStatus,
      scheduledAt: row.bookingScheduledAt?.toISOString() ?? null,
      markedTest: row.bookingMarkedTest,
    },
    // Admin only: the garage never sees who reported. Null once the account
    // was deleted.
    customer: r.userId ? { id: r.userId, name: row.customerName, phone: row.customerPhone } : null,
    confirmedAt: r.confirmedAt?.toISOString() ?? null,
    confirmedBy: r.confirmedBy,
    dismissedAt: r.dismissedAt?.toISOString() ?? null,
    dismissedBy: r.dismissedBy,
    dismissedReason: r.dismissedReason,
    reward: { status: r.rewardStatus, grantedAt: r.rewardGrantedAt?.toISOString() ?? null },
  }
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

  async list(query: ListBypassReportsQuery, now = new Date()) {
    // One after the other: the API has a single connection (db/index.ts).
    const rows = await bypassReportsRepository.listForAdmin(query.show, ADMIN_LIST_LIMIT)
    const counts = await bypassReportsRepository.countByStatus()
    const strikes = await strikesFor(rows.map((row) => row.report.vendorId), now)
    return {
      reports: rows.map((row) => toAdminReport(row, strikes)),
      counts,
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
    return toAdminReport(row, await strikesFor([row.report.vendorId], now))
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
    const counts = await bypassReportsRepository.countForGarage(vendorId)
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
