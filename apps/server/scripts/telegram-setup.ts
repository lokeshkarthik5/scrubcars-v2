/**
 * Connecting booking alerts to the team's Telegram group.
 *
 *   TELEGRAM_BOT_TOKEN=… bun run alerts:telegram
 *       lists the groups the bot has been added to, with their ids
 *   TELEGRAM_BOT_TOKEN=… TELEGRAM_OPS_CHAT_ID=… bun run alerts:telegram --test
 *       sends a test message to that group
 *
 * The values are passed on the command line, not read from .env, on purpose:
 * a token saved in apps/server/.env would also be picked up by local dev and
 * E2E runs. Standalone — it needs no database URL or other server secret.
 *
 * Telegram keeps a bot's updates for 24 hours, and a bot in a group sees only
 * commands addressed to it, not ordinary messages. If the listing is empty,
 * send /start@<bot username> in the group, or remove and re-add the bot, and
 * run it again.
 */

const token = process.env.TELEGRAM_BOT_TOKEN
const chatId = process.env.TELEGRAM_OPS_CHAT_ID
const api = (method: string) => `https://api.telegram.org/bot${token}/${method}`

type Chat = { id: number; title?: string; type: string }
type Update = {
  message?: { chat: Chat; migrate_to_chat_id?: number }
  my_chat_member?: { chat: Chat; new_chat_member: { status: string } }
}

/** The bot is no longer in a chat it was removed from or left. */
const GONE = new Set(['left', 'kicked'])

async function main() {
  if (!token) {
    console.error('Set TELEGRAM_BOT_TOKEN first (from @BotFather).')
    process.exit(1)
  }

  if (process.argv.includes('--test')) {
    if (!chatId) {
      console.error('Set TELEGRAM_OPS_CHAT_ID first (run without --test to find it).')
      process.exit(1)
    }
    const response = await fetch(api('sendMessage'), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: '✅ Detlio booking alerts are connected. New bookings, refunds due, declines, cancellations and reschedules will be posted here.',
      }),
    })
    const body = (await response.json()) as { ok: boolean; description?: string }
    console.log(body.ok ? 'Test message sent.' : `Telegram refused it: ${body.description}`)
    process.exit(body.ok ? 0 : 1)
  }

  const response = await fetch(api('getUpdates'))
  const body = (await response.json()) as { ok: boolean; result?: Update[]; description?: string }
  if (!body.ok) {
    console.error(`Telegram refused the token: ${body.description}`)
    process.exit(1)
  }

  // Updates arrive oldest first, so the last word on each chat wins.
  const chats = new Map<number, string>()
  for (const update of body.result ?? []) {
    const chat = update.my_chat_member?.chat ?? update.message?.chat
    if (!chat || chat.type === 'private') continue
    if (update.my_chat_member && GONE.has(update.my_chat_member.new_chat_member.status)) {
      chats.delete(chat.id)
      continue
    }
    chats.set(chat.id, `${chat.title ?? '(untitled)'} [${chat.type}]`)
    // A group upgraded to a supergroup gets a new id; the old one stops working.
    const movedTo = update.message?.migrate_to_chat_id
    if (movedTo) {
      chats.delete(chat.id)
      chats.set(movedTo, `${chat.title ?? '(untitled)'} [supergroup]`)
    }
  }

  if (chats.size === 0) {
    console.log(
      'No groups found. In the team group send /start@<bot username> (or remove and re-add the bot), then run this again.'
    )
    return
  }
  console.log('Groups this bot is in (set TELEGRAM_OPS_CHAT_ID to the id):')
  for (const [id, label] of chats) console.log(`  ${id}  ${label}`)
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})
