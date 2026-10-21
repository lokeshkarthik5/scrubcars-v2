import { logger } from '../../lib/logger.js'
import { alertOps } from '../../lib/ops-alerts.js'
import { customerRewardVoucher } from '../../lib/push-messages.js'
import { rupees, type RewardsSettings } from '../../lib/rewards.js'
import { pushService } from '../push/push.service.js'
import type { IssuedVoucher } from './rewards.repository.js'

const log = logger.child({ module: 'rewards' })

/**
 * After a rewards write commits: phones hear about new vouchers, ops about
 * the cap. A scratch prize is news the customer just saw on screen, and a
 * challenge's prize is told by its "You won" push (0054), so neither is
 * pushed again here.
 */
export function announceRewards(
  vouchers: IssuedVoucher[],
  capAlert: { month: string; issuedPaise: number } | null,
  settings: RewardsSettings
) {
  for (const voucher of vouchers) {
    if (voucher.kind === 'scratch' || voucher.kind === 'free_wash' || voucher.kind === 'challenge') continue
    pushService.notifyCustomer(voucher.userId, customerRewardVoucher(voucher))
  }
  if (capAlert) {
    log.warn({ month: capAlert.month, issued: rupees(capAlert.issuedPaise) }, 'rewards:cap_reached')
    alertOps({
      kind: 'rewards_cap_reached',
      month: capAlert.month,
      cap: rupees(settings.monthlyCap * 100),
      issued: rupees(capAlert.issuedPaise),
    })
  }
}
