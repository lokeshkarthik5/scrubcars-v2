import { runInBackground } from '../../lib/background.js'
import { logger } from '../../lib/logger.js'
import { customerSlotOpened } from '../../lib/push-messages.js'
import { datesHeld, SLOT_ALERT_KEEP_DAYS } from '../../lib/slot-alerts.js'
import { pushService } from '../push/push.service.js'
import { slotAlertsRepository } from './slot-alerts.repository.js'
import { slotAlertsWith } from './slot-alerts.rules.js'
import type { CreateSlotAlertInput } from './slot-alerts.validation.js'

export type { SlotAlertResponse } from './slot-alerts.rules.js'

const log = logger.child({ module: 'slot-alerts' })

/** The cron's sweep: at most this many garage-days a run, within this long. */
const SWEEP_GARAGE_DAYS = 20
const SWEEP_BUDGET_MS = 10_000
/** A garage that reopens re-checks at most this many of its dates. */
const GARAGE_DATES_LIMIT = 30
/** Old rows deleted per cron run. */
const PURGE_BATCH = 1000

const DAY_MS = 24 * 60 * 60 * 1000

const rules = slotAlertsWith({
  store: {
    findUser: (userId) => slotAlertsRepository.findUser(userId),
    findGarage: (vendorId) => slotAlertsRepository.findGarage(vendorId),
    findServices: (vendorId, serviceIds) => slotAlertsRepository.findServices(vendorId, serviceIds),
    readDay: (vendorId, date) => slotAlertsRepository.readDay(vendorId, date),
    setUnderLimit: (input) => slotAlertsRepository.setUnderLimit(input),
    listWaiting: (userId, now) => slotAlertsRepository.listWaiting(userId, now),
    removeWaiting: (userId, id) => slotAlertsRepository.removeWaiting(userId, id),
    listWaitingForGarageDay: (vendorId, date, now, limit) =>
      slotAlertsRepository.listWaitingForGarageDay(vendorId, date, now, limit),
    claim: (id, slotAt, now) => slotAlertsRepository.claim(id, slotAt, now),
    markChecked: (ids, now) => slotAlertsRepository.markChecked(ids, now),
  },
  // The Updates row is the claim itself; the push goes to the customer's
  // devices under their Booking updates switch, after this, never failing it.
  onOpened: ({ alert, garageName, slotAt }, now) => {
    log.info({ alertId: alert.id, userId: alert.userId, vendorId: alert.vendorId, date: alert.date }, 'slot_alerts:opened')
    pushService.notifyCustomer(alert.userId, customerSlotOpened(alert, garageName, slotAt, now))
  },
  onSet: (row, replaced) =>
    log.info(
      { alertId: row.id, userId: row.userId, vendorId: row.vendorId, date: row.date, window: row.window, replaced },
      'slot_alerts:set'
    ),
})

/** Re-checks these dates at a garage, one after another (runInBackground logs a failure). */
async function recheckDates(vendorId: string, dates: string[], reason: string) {
  const now = new Date()
  for (const date of dates) {
    const summary = await rules.recheck(vendorId, date, now)
    if (summary.waiting > 0) log.info({ vendorId, date, reason, ...summary }, 'slot_alerts:rechecked')
  }
}

export const slotAlertsService = {
  create(userId: string, input: CreateSlotAlertInput, now = new Date()) {
    return rules.create(userId, input, now)
  },

  list(userId: string, now = new Date()) {
    return rules.list(userId, now)
  },

  remove(userId: string, id: string) {
    return rules.remove(userId, id)
  },

  /**
   * A booking stopped holding capacity (cancelled by anyone, declined,
   * auto-cancelled, moved to another time, a no-show recorded): re-check the
   * waiting alerts for the dates it held, after the response, so the action
   * that freed it has committed and is never slowed or failed by this. With
   * no alert waiting it costs one indexed read.
   */
  capacityFreed(booking: { vendorId: string; scheduledAt: Date; durationMins?: number | null }, reason: string) {
    const dates = datesHeld(booking.scheduledAt, booking.durationMins)
    runInBackground('slot_alerts_recheck', () => recheckDates(booking.vendorId, dates, reason))
  },

  /** One date at a garage changed (a holiday removed). */
  dayChanged(vendorId: string, date: string, reason: string) {
    runInBackground('slot_alerts_recheck', () => recheckDates(vendorId, [date], reason))
  },

  /**
   * Something that can open any day changed at a garage (a pause lifted,
   * hours, slot length, bays or the day's cap): re-check every date it has
   * alerts waiting on, after the response.
   */
  garageChanged(vendorId: string, reason: string) {
    runInBackground('slot_alerts_recheck', async () => {
      const dates = await slotAlertsRepository.listWaitingDatesForGarage(vendorId, new Date(), GARAGE_DATES_LIMIT)
      await recheckDates(vendorId, dates, reason)
    })
  },

  /**
   * The pending-digest cron's safety net, for capacity freed some way the
   * calls above did not see (a job finished early, a write that failed to
   * start its re-check): the garage-days with waiting alerts, the longest
   * unchecked first, bounded per run and in time. Then deletes alerts whose
   * day ended over SLOT_ALERT_KEEP_DAYS ago. A dry run only counts.
   */
  async sweep(options: { dryRun: boolean }, now = new Date()) {
    const started = Date.now()
    const garageDays = await slotAlertsRepository.listGarageDaysForSweep(now, SWEEP_GARAGE_DAYS)
    const summary = { garageDays: garageDays.length, checked: 0, opened: 0, failed: 0, purged: 0, outOfTime: false }
    for (const { vendorId, date } of garageDays) {
      if (Date.now() - started > SWEEP_BUDGET_MS) {
        summary.outOfTime = true
        break
      }
      try {
        const result = await rules.recheck(vendorId, date, now, { dryRun: options.dryRun })
        summary.checked += 1
        summary.opened += result.opened
      } catch (err) {
        summary.failed += 1
        log.error({ err, vendorId, date }, 'slot_alerts:sweep_item_failed')
      }
    }
    if (!options.dryRun) {
      summary.purged = await slotAlertsRepository.purgeEndedBefore(
        new Date(now.getTime() - SLOT_ALERT_KEEP_DAYS * DAY_MS),
        PURGE_BATCH
      )
    }
    if (summary.opened + summary.failed + summary.purged > 0) log.info(summary, 'slot_alerts:sweep')
    return summary
  },
}
