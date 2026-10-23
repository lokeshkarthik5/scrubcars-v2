import { env } from '../../lib/env.js'
import { AppError } from '../../lib/errors.js'
import { logger } from '../../lib/logger.js'
import { opsAlertChat } from '../../lib/ops-alert-gate.js'
import { sendTelegramMessage } from '../../lib/telegram.js'
import type { TelegramTestInput } from './alerts.validation.js'

const log = logger.child({ module: 'alerts' })

/** The words of a test alert: plain text, the admin's typed name in it. */
export function telegramTestText(actorName: string): string {
  return `✅ Detlio test alert from ${actorName}`
}

export const alertsService = {
  /**
   * Whether the team's Telegram alerts are set up, never the token or the
   * chat id themselves: `configured` is both present; `liveHere` is whether
   * booking alerts actually go out from this deployment (Production only,
   * or OPS_ALERTS=on; never with fake payments).
   */
  telegramStatus() {
    const configured = Boolean(env.telegramBotToken && env.telegramOpsChatId)
    const liveHere =
      opsAlertChat({
        token: env.telegramBotToken,
        chatId: env.telegramOpsChatId,
        vercelEnv: env.vercelEnv,
        forced: env.opsAlertsForced,
        fakePayments: env.e2eFakePayments,
      }) !== null
    return { configured, liveHere }
  },

  /**
   * Posts "✅ Detlio test alert from <name>" to the ops chat, now and
   * awaited, so the admin sees what happened. An explicit test, so the
   * Production-only gate does not apply: only the token and chat id must be
   * set. Telegram's own words come back on a failure ("chat not found"),
   * never the token.
   */
  async sendTelegramTest(sub: string, input: TelegramTestInput) {
    if (!env.telegramBotToken || !env.telegramOpsChatId) {
      throw new AppError(
        409,
        'Telegram is not set up: TELEGRAM_BOT_TOKEN and TELEGRAM_OPS_CHAT_ID are needed on the API.',
        'TELEGRAM_NOT_CONFIGURED'
      )
    }
    try {
      await sendTelegramMessage(env.telegramOpsChatId, telegramTestText(input.actorName))
    } catch (err) {
      log.error({ err, sub }, 'alerts:telegram_test_failed')
      const reason = err instanceof Error ? err.message : 'no answer'
      throw new AppError(502, `Telegram didn't take the test alert. ${reason}`, 'TELEGRAM_SEND_FAILED')
    }
    log.info({ sub, actorName: input.actorName }, 'alerts:telegram_test_sent')
    return { sent: true, sentAt: new Date().toISOString() }
  },
}
