import { env } from './env.js'

const TELEGRAM_API = 'https://api.telegram.org'

type TelegramResponse = { ok: boolean; description?: string }

/**
 * Posts a plain-text message to a Telegram chat through the Bot API.
 *
 * Plain text on purpose: no parse mode means nothing a customer typed (a
 * cancellation reason, a name) can break the message's markup. Throws on any
 * failure; the caller decides whether that matters. The error never carries
 * the request URL, which has the bot token in it.
 */
export async function sendTelegramMessage(chatId: string, text: string): Promise<void> {
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
  if (!response.ok || !body?.ok) {
    throw new Error(
      `Telegram sendMessage failed (${response.status}): ${body?.description ?? 'no response body'}`
    )
  }
}
