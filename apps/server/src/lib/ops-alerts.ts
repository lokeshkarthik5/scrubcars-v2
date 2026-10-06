import { env } from './env.js'
import { logger } from './logger.js'
import { runInBackground } from './background.js'
import { opsAlertChat } from './ops-alert-gate.js'
import { formatOpsAlert, type OpsAlert } from './ops-alert-messages.js'
import { sendTelegramMessage } from './telegram.js'

export type { AlertBooking, OpsAlert } from './ops-alert-messages.js'

const log = logger.child({ module: 'ops-alerts' })

/**
 * Tells the Detlio team, in their Telegram group, that something happened to
 * a booking that a person may need to act on.
 *
 * Fire and forget: it returns at once, never throws, and a failed send is
 * logged and dropped — an alert must never slow down or fail the booking it
 * is about. Off, and free of any DB read, everywhere but Production (see
 * ops-alert-gate.ts), so development, E2E and previews never message the
 * real team.
 *
 * Pass a loader instead of an alert when the facts still need reading: it
 * runs after the response, and only when alerts are on.
 */
export function alertOps(alert: OpsAlert | (() => Promise<OpsAlert | null>)): void {
  const chatId = opsAlertChat({
    token: env.telegramBotToken,
    chatId: env.telegramOpsChatId,
    vercelEnv: env.vercelEnv,
    forced: env.opsAlertsForced,
    fakePayments: env.e2eFakePayments,
  })
  if (!chatId) {
    log.debug({ kind: typeof alert === 'function' ? 'deferred' : alert.kind }, 'ops_alert:off')
    return
  }

  runInBackground('ops_alert', async () => {
    const resolved = typeof alert === 'function' ? await alert() : alert
    if (!resolved) return
    await sendTelegramMessage(chatId, formatOpsAlert(resolved))
    log.info({ kind: resolved.kind }, 'ops_alert:sent')
  })
}

/**
 * The awaited sibling of alertOps, for a scheduled job: same Production-only
 * gate, but the outcome is returned and a failed send throws, so the job can
 * report it (and its scheduler can email someone) instead of losing it.
 */
export async function sendOpsAlertNow(alert: OpsAlert): Promise<'sent' | 'off'> {
  const chatId = opsAlertChat({
    token: env.telegramBotToken,
    chatId: env.telegramOpsChatId,
    vercelEnv: env.vercelEnv,
    forced: env.opsAlertsForced,
    fakePayments: env.e2eFakePayments,
  })
  if (!chatId) return 'off'
  await sendTelegramMessage(chatId, formatOpsAlert(alert))
  log.info({ kind: alert.kind }, 'ops_alert:sent')
  return 'sent'
}
