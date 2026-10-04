/**
 * Connecting booking alerts to the team's Telegram group.
 *
 *   bun run alerts:telegram         list the chats the bot has been added to
 *   bun run alerts:telegram --test  send a test message to TELEGRAM_OPS_CHAT_ID
 *
 * Reads TELEGRAM_BOT_TOKEN (and TELEGRAM_OPS_CHAT_ID for --test) from the
 * environment or .env. Standalone on purpose — it does not load the app's env
 * module, so it runs without a database URL or any other server secret.
 *
 * Telegram keeps a bot's pending updates for 24 hours, so run the listing soon
 * after adding the bot to the group (or send a message in the group first).
 */
import 'dotenv/config'

const token = process.env.TELEGRAM_BOT_TOKEN
const chatId = process.env.TELEGRAM_OPS_CHAT_ID
const api = (method: string) => `https://api.telegram.org/bot${token}/${method}`

type Chat = { id: number; title?: string; type: string }
type Update = {
  message?: { chat: Chat; migrate_to_chat_id?: number }
  my_chat_member?: { chat: Chat; new_chat_member: { status: string } }
}

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

  const chats = new Map<number, string>()
  for (const update of body.result ?? []) {
    const chat = update.my_chat_member?.chat ?? update.message?.chat
    if (!chat || chat.type === 'private') continue
    chats.set(chat.id, `${chat.title ?? '(untitled)'} [${chat.type}]`)
    // A group upgraded to a supergroup gets a new id; the old one stops working.
    const movedTo = update.message?.migrate_to_chat_id
    if (movedTo) chats.set(movedTo, `${chat.title ?? '(untitled)'} [supergroup, use this one]`)
  }

  if (chats.size === 0) {
    console.log(
      'No groups yet. Add the bot to the team group, send any message there, then run this again.'
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
