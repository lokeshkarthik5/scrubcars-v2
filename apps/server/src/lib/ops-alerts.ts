import { env } from './env.js'
import { logger } from './logger.js'
import { runInBackground } from './background.js'
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
 * is about. Off (and free of any DB read) unless both Telegram variables are
 * set, so development, E2E and previews never message the real team.
 *
 * Pass a loader instead of an alert when the facts still need reading: it
 * runs after the response, and only when alerts are on.
 */
export function alertOps(alert: OpsAlert | (() => Promise<OpsAlert | null>)): void {
  const chatId = env.telegramOpsChatId
  if (!env.telegramBotToken || !chatId) {
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
