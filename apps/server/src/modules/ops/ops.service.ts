import { AppError } from '../../lib/errors.js'
import { logger } from '../../lib/logger.js'
import { sendOpsAlertNow } from '../../lib/ops-alerts.js'
import { digestLookbacks, isMorningTick, planPendingDigest } from '../../lib/pending-digest.js'
import { createThrottle } from '../../lib/throttle.js'
import { analyticsService } from '../analytics/analytics.service.js'
import { carHistoryService } from '../car-history/car-history.service.js'
import { bypassReportsService } from '../bypass-reports/bypass-reports.service.js'
import { certificationService } from '../certification/certification.service.js'
import { garageResponseService } from '../garage-response/garage-response.service.js'
import { giftCreditService } from '../gift-credit/gift-credit.service.js'
import { giftsService } from '../gifts/gifts.service.js'
import { couponsService } from '../coupons/coupons.service.js'
import { guaranteeService } from '../guarantee/guarantee.service.js'
import { payoutsService } from '../payouts/payouts.service.js'
import { pushService } from '../push/push.service.js'
import { refundsService } from '../refunds/refunds.service.js'
import { rewardsService } from '../rewards/rewards.service.js'
import { rewardExtrasService } from '../reward-extras/reward-extras.service.js'
import { garageService } from '../garage/garage.service.js'
import { slotAlertsService } from '../slot-alerts/slot-alerts.service.js'
import { timeProposalsService } from '../time-proposals/time-proposals.service.js'
import { opsRepository } from './ops.repository.js'

const log = logger.child({ module: 'ops' })

// A sweep that fails tends to fail every run until someone fixes it; the
// first alert says it all, and one an hour keeps it from being forgotten.
const SWEEP_ALERT_QUIET_MINUTES = 60
const sweepAlertDue = createThrottle(SWEEP_ALERT_QUIET_MINUTES * 60_000)

export const opsService = {
  /**
   * The pending-booking nudge, run by an outside scheduler every
   * DIGEST_TICK_MINS: works out whether the team needs telling now (see
   * planPendingDigest) and, if so, posts one message listing every paid
   * booking still waiting for its garage.
   */
  async pendingDigest(options: { dryRun: boolean }) {
    // Garages' suggested times that ran out unanswered cancel their booking
    // (0041): first, so a refund that makes is in the sweep below's list, and
    // never allowed to fail the digest. A bounded batch a run.
    const timeProposals = await timeProposalsService
      .sweep({ dryRun: options.dryRun })
      .catch((err: unknown) => {
        log.error({ err }, 'ops:time_proposal_sweep_failed')
        return { error: true as const }
      })

    // Paid bookings their garage did not accept in time are cancelled with
    // a full refund (0042, AUTO_CANCEL_UNANSWERED; nothing happens while it
    // is off). After the suggestion sweep, whose open suggestions hold these
    // off, and before the refunds' retry, so a refund this makes is in its
    // list. Quiet hours don't stop it: cancelling is not a message. Never
    // allowed to fail the digest.
    const notAccepted = await garageResponseService
      .sweep({ dryRun: options.dryRun })
      .catch((err: unknown) => {
        log.error({ err }, 'ops:garage_response_sweep_failed')
        return { enabled: true as const, error: true as const }
      })

    // Free redo claims (Detlio Guarantee, 0051): a garage's 12 hours run out
    // (treated as accepted), a redo window run out (closed), a redo booking
    // finished one way or another. Nothing at all while GUARANTEE_ENABLED is
    // off. Quiet hours don't stop it. Never allowed to fail the digest.
    const guarantee = await guaranteeService
      .sweep({ dryRun: options.dryRun })
      .catch((err: unknown) => {
        log.error({ err }, 'ops:guarantee_sweep_failed')
        return { enabled: true as const, error: true as const }
      })

    // The automatic refunds' retry rides on this run (AUTO_REFUNDS; nothing
    // happens while it is off). First, and never allowed to fail the digest:
    // a refund problem is alerted on its own (one refund's failure by the
    // refunds service, the whole sweep's here), and the digest still posts.
    const autoRefunds = await refundsService
      .sweepAutoRefunds({ dryRun: options.dryRun })
      .catch((err: unknown) => {
        log.error({ err }, 'ops:auto_refund_sweep_failed')
        return { enabled: true as const, error: true as const }
      })
    if ('error' in autoRefunds && !options.dryRun && sweepAlertDue()) {
      // Awaited, like the digest: the cron's function may be frozen once it
      // answers. A failed send is logged and the digest still runs.
      await sendOpsAlertNow({ kind: 'auto_refund_sweep_failed', quietMinutes: SWEEP_ALERT_QUIET_MINUTES }).catch(
        (err: unknown) => log.error({ err }, 'ops:auto_refund_sweep_alert_failed')
      )
    }

    // Then the webhook's backstop: refunds still pending at Razorpay well
    // after they were sent are checked there (whatever AUTO_REFUNDS says, as
    // Refund now's are too). Never allowed to fail the digest either.
    const refundChecks = await refundsService
      .recheckPendingRefunds({ dryRun: options.dryRun })
      .catch((err: unknown) => {
        log.error({ err }, 'ops:refund_recheck_failed')
        return { error: true as const }
      })

    // Browser notifications on a schedule (0044): the customers' reminders
    // (the evening before, in the 18:00 IST runs, and about an hour before)
    // and the garages' "accept within 10 min". Each goes at most once per
    // booking (claimed first), in bounded batches; nothing at all while
    // VAPID is unset. Quiet hours don't stop it: a reminder before a 7 am
    // slot is wanted. Never allowed to fail the digest.
    const notifications = await pushService
      .sweepScheduled({ dryRun: options.dryRun })
      .catch((err: unknown) => {
        log.error({ err }, 'ops:push_sweep_failed')
        return { enabled: true as const, error: true as const }
      })

    // Detlio Certified's nightly evaluation (0048): each garage once per
    // daily run from 05:00 IST, a bounded batch a run, so its alerts land
    // before the 07:00 roll-up. Nothing while garage documents are off.
    // Never allowed to fail the digest.
    const certification = await certificationService
      .sweep({ dryRun: options.dryRun })
      .catch((err: unknown) => {
        log.error({ err }, 'ops:certification_sweep_failed')
        return { enabled: true as const, error: true as const }
      })

    // Coating and detailing follow-ups (0046): a catch-up for completions
    // whose reminders were never written, then, in the 09:00 IST runs, the
    // due date's notification, each claimed first so it goes once. Never
    // allowed to fail the digest.
    const serviceReminders = await carHistoryService
      .sweep({ dryRun: options.dryRun })
      .catch((err: unknown) => {
        log.error({ err }, 'ops:service_reminder_sweep_failed')
        return { error: true as const }
      })

    // "Notify me if a slot opens" (0047): every cancellation, decline,
    // auto-cancel or move re-checks its garage's waiting alerts as it
    // happens; this is the safety net for room freed some other way (a job
    // finished early, a re-check that failed). The garage-days unchecked
    // longest first, 20 a run within 10 seconds, then old rows deleted.
    // Quiet hours don't stop it: a time freed at night is still news in the
    // morning. Never allowed to fail the digest.
    const slotAlerts = await slotAlertsService
      .sweep({ dryRun: options.dryRun })
      .catch((err: unknown) => {
        log.error({ err }, 'ops:slot_alert_sweep_failed')
        return { error: true as const }
      })

    // Gift a wash (0049), whatever GIFTS_ENABLED says (credit already on
    // accounts must still come back and run out as promised): booking credit
    // a cancel missed giving back, credit past its expiry written off, and
    // wrong gift codes older than a day cleared. Bounded batches, never
    // allowed to fail the digest.
    const giftCredit = await giftCreditService
      .sweep({ dryRun: options.dryRun })
      .catch((err: unknown) => {
        log.error({ err }, 'ops:gift_credit_sweep_failed')
        return { error: true as const }
      })
    // Bypass reports (0052): rewards confirmed while Detlio credit was off
    // are granted once it is on. Nothing while off. Bounded, never allowed
    // to fail the digest.
    const bypassRewards = await bypassReportsService
      .sweepOwedRewards({ dryRun: options.dryRun })
      .catch((err: unknown) => {
        log.error({ err }, 'ops:bypass_reward_sweep_failed')
        return { error: true as const }
      })
    // Detlio Rewards (0050), only while live: completions and no-shows the
    // after-response hooks missed, stamps of bookings since marked Test or
    // refunded taken back, then (10:00–17:59 IST) level perks and the habit
    // nudges, each claimed once. Bounded, never allowed to fail the digest.
    const rewards = await rewardsService
      .sweep({ dryRun: options.dryRun })
      .catch((err: unknown) => {
        log.error({ err }, 'ops:rewards_sweep_failed')
        return { error: true as const }
      })
    // 0054: badges and challenges for stamps not yet counted, the nightly
    // badge pass, celebrations that waited for the morning, challenge
    // starts and "one more to go", and Wrapped's December push. Only while
    // rewards are live; bounded, never fails the digest.
    const rewardExtras = await rewardExtrasService
      .sweep({ dryRun: options.dryRun })
      .catch((err: unknown) => {
        log.error({ err }, 'ops:reward_extras_sweep_failed')
        return { error: true as const }
      })
    // 0057: the Detlio Garage's cards for stamp-earning bookings the hook
    // missed, then (08:00–20:59 IST) cars, rows and series not yet told.
    // Only while the Garage is live; bounded, never fails the digest.
    const garage = await garageService
      .sweep({ dryRun: options.dryRun })
      .catch((err: unknown) => {
        log.error({ err }, 'ops:garage_sweep_failed')
        return { error: true as const }
      })
    const giftCodeAttemptsPurged = options.dryRun
      ? 0
      : await giftsService.purgeAttempts().catch((err: unknown) => {
          log.error({ err }, 'ops:gift_attempts_purge_failed')
          return null
        })

    // Printed coupons (0056): wrong-code rows over a day old.
    const couponCodeAttemptsPurged = options.dryRun
      ? 0
      : await couponsService.purgeAttempts().catch((err: unknown) => {
          log.error({ err }, 'ops:coupon_attempts_purge_failed')
          return null
        })

    // The usage events' 180-day clean-up rides on it too: a bounded batch a
    // run, skipped on a dry run, and never allowed to fail the digest.
    const analyticsPurged = options.dryRun
      ? 0
      : await analyticsService.purgeExpired().catch((err: unknown) => {
          log.error({ err }, 'ops:analytics_purge_failed')
          return null
        })

    const now = Date.now()
    // Pending bookings drop off a day after their time; uncollected pickups
    // stay until collected or cancelled (lib/pending-digest.ts).
    const { bookingsSince, pickupsSince } = digestLookbacks(now)
    const [rows, pickups] = await Promise.all([
      opsRepository.listPaidPendingBookings(bookingsSince),
      opsRepository.listUncollectedPickups(pickupsSince, new Date(now)),
    ])
    // The morning roll-up also says what Detlio owes garages. Read only at
    // 07:00, and never allowed to fail the digest: without it the line is
    // left out.
    const payouts = isMorningTick(now)
      ? await payoutsService.dueSummary(new Date(now)).catch((err: unknown) => {
          log.error({ err }, 'ops:payouts_summary_failed')
          return null
        })
      : null
    // And how many bookings each garage did not accept in time yesterday
    // (0042): read only at 07:00, left out if it fails.
    const missedResponses = isMorningTick(now)
      ? await garageResponseService.missedYesterday(new Date(now)).catch((err: unknown) => {
          log.error({ err }, 'ops:missed_responses_summary_failed')
          return []
        })
      : []
    const plan = planPendingDigest(now, rows, pickups, {
      morningExtras: payouts !== null || missedResponses.length > 0,
    })
    const summary = {
      waiting: plan.waiting.length,
      missed: plan.missed.length,
      latePickups: plan.latePickups.length,
      reason: plan.reason as string,
      posted: false,
      payoutsDue: payouts ? payouts.garages : null,
      autoRefunds,
      refundChecks,
      analyticsPurged,
      timeProposals,
      notAccepted,
      notifications,
      certification,
      serviceReminders,
      slotAlerts,
      giftCredit,
      bypassRewards,
      guarantee,
      giftCodeAttemptsPurged,
      couponCodeAttemptsPurged,
      rewards,
      rewardExtras,
      garage,
      missedResponsesYesterday: missedResponses.reduce((sum, row) => sum + row.count, 0),
    }

    if (!plan.post || options.dryRun) return summary

    try {
      const outcome = await sendOpsAlertNow({
        kind: 'pending_digest',
        now: new Date(now),
        waiting: plan.waiting,
        missed: plan.missed,
        payouts: plan.reason === 'morning' ? payouts : null,
        latePickups: plan.latePickups,
        missedResponses: plan.reason === 'morning' ? missedResponses : [],
      })
      if (outcome === 'off') return { ...summary, reason: 'alerts_off' }
    } catch (err) {
      log.error(
        { err, waiting: summary.waiting, missed: summary.missed, latePickups: summary.latePickups },
        'ops:pending_digest_send_failed'
      )
      // A failed run must show as failed to the scheduler, which emails on it.
      throw new AppError(502, 'Could not post the pending-booking digest', 'OPS_ALERT_SEND_FAILED')
    }

    log.info(summary, 'ops:pending_digest_posted')
    return { ...summary, posted: true }
  },
}
