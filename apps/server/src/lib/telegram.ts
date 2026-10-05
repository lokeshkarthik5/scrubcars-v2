import { env } from './env.js'
import { logger } from './logger.js'

const TELEGRAM_API = 'https://api.telegram.org'
const log = logger.child({ module: 'telegram' })

type TelegramResponse = {
  ok: boolean
  description?: string
  parameters?: { migrate_to_chat_id?: number; retry_after?: number }
}

/** The longest Telegram's "slow down" is worth waiting out inside one send. */
const MAX_RETRY_AFTER_S = 5

/**
 * Posts a plain-text message to a Telegram chat through the Bot API.
 *
 * Plain text on purpose: no parse mode means nothing a customer typed can
 * break the message's markup. Throws on any failure; the caller decides
 * whether that matters. The error never carries the request URL, which has
 * the bot token in it.
 *
 * Two answers are worth one more try rather than a dropped alert: a group
 * upgraded to a supergroup (it gets a new id — sent there, and logged loudly
 * so the setting is updated), and a short rate limit.
 */
export async function sendTelegramMessage(chatId: string, text: string): Promise<void> {
  const first = await post(chatId, text)
  if (first.ok) return

  const movedTo = first.parameters?.migrate_to_chat_id
  if (movedTo) {
    log.error(
      { from: chatId, to: movedTo },
      'telegram:chat_migrated — set TELEGRAM_OPS_CHAT_ID to the new id'
    )
    const retry = await post(String(movedTo), text)
    if (retry.ok) return
    throw failure(retry)
  }

  const wait = first.parameters?.retry_after
  if (wait !== undefined && wait <= MAX_RETRY_AFTER_S) {
    await new Promise((resolve) => setTimeout(resolve, wait * 1000))
    const retry = await post(chatId, text)
    if (retry.ok) return
    throw failure(retry)
  }

  throw failure(first)
}

async function post(chatId: string, text: string): Promise<TelegramResponse & { status: number }> {
  if (!env.telegramBotToken) {
    throw new Error('Telegram bot token is not configured')
  }

  const response = await fetch(`${TELEGRAM_API}/bot${env.telegramBotToken}/sendMessage`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      link_preview_options: { is_disabled: true },
    }),
    signal: AbortSignal.timeout(5_000),
  })

  const body = (await response.json().catch(() => null)) as TelegramResponse | null
  return { ...body, status: response.status, ok: response.ok && body?.ok === true }
}

function failure(result: TelegramResponse & { status: number }): Error {
  return new Error(
    `Telegram sendMessage failed (${result.status}): ${result.description ?? 'no response body'}`
  )
}
