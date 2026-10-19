import { z } from 'zod'
import { signedActorName } from '../../lib/admin-actor.js'

/**
 * "Send test alert": signed with the signed-in admin's name (0058; personal
 * login names are one line, so the plain-text alert stays one line). Strict:
 * nothing else.
 */
export const telegramTestSchema = z
  .object({
    actorName: signedActorName,
  })
  .strict()

export type TelegramTestInput = z.infer<typeof telegramTestSchema>
