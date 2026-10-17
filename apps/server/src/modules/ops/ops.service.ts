import { AppError } from '../../lib/errors.js'
import { logger } from '../../lib/logger.js'
import { sendOpsAlertNow } from '../../lib/ops-alerts.js'
import { planPendingDigest } from '../../lib/pending-digest.js'
import { refundsService } from '../refunds/refunds.service.js'
import { opsRepository } from './ops.repository.js'

const log = logger.child({ module: 'ops' })

/** How long after its start time a still-pending booking keeps being listed. */
const MISSED_LOOKBACK_MS = 24 * 60 * 60 * 1000

export const opsService = {
  /**
   * The pending-booking nudge, run by an outside scheduler every
   * DIGEST_TICK_MINS: works out whether the team needs telling now (see
   * planPendingDigest) and, if so, posts one message listing every paid
   * booking still waiting for its garage.
   */
  async pendingDigest(options: { dryRun: boolean }) {
    // The automatic refunds' retry rides on this run (AUTO_REFUNDS; nothing
    // happens while it is off). First, and never allowed to fail the digest:
    // a refund problem is alerted on its own, and the digest still posts.
    const autoRefunds = await refundsService
      .sweepAutoRefunds({ dryRun: options.dryRun })
      .catch((err: unknown) => {
        log.error({ err }, 'ops:auto_refund_sweep_failed')
        return { enabled: true as const, error: true as const }
      })

    const now = Date.now()
    const since = new Date(now - MISSED_LOOKBACK_MS)
    const [rows, pickups] = await Promise.all([
      opsRepository.listPaidPendingBookings(since),
      opsRepository.listUncollectedPickups(since, new Date(now)),
    ])
    const plan = planPendingDigest(now, rows, pickups)
    const summary = {
      waiting: plan.waiting.length,
      missed: plan.missed.length,
      latePickups: plan.latePickups.length,
      reason: plan.reason as string,
      posted: false,
      autoRefunds,
    }

    if (!plan.post || options.dryRun) return summary

    try {
      const outcome = await sendOpsAlertNow({
        kind: 'pending_digest',
        now: new Date(now),
        waiting: plan.waiting,
        missed: plan.missed,
        latePickups: plan.latePickups,
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
