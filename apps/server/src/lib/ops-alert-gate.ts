/**
 * Whether ops alerts go out, and to which chat. Pure, so the rule is tested
 * on its own; ops-alerts.ts feeds it the env.
 *
 * All of these must hold:
 * - a bot token and a chat id (both unset = alerts off, the default);
 * - not the E2E stack, where every payment is fake;
 * - the Production deployment on Vercel, or OPS_ALERTS=on for a deliberate
 *   local test. A preview or a laptop that happens to hold the token stays
 *   silent, so the team never gets a "refund due" for a test booking.
 */
export function opsAlertChat(config: {
  token?: string
  chatId?: string
  vercelEnv?: string
  forced?: boolean
  fakePayments?: boolean
}): string | null {
  if (!config.token || !config.chatId) return null
  if (config.fakePayments) return null
  if (config.vercelEnv !== 'production' && !config.forced) return null
  return config.chatId
}
