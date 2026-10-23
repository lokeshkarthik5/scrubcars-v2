import { z } from 'zod'

/**
 * "Send test alert": the name the admin types, as the Bin's dialogs take it
 * (the shared admin login has no name of its own). Strict: nothing else.
 */
export const telegramTestSchema = z
  .object({
    actorName: z
      .string()
      .trim()
      .min(2, 'Type your name')
      .max(60)
      // One line: the alert is plain text, and a name has no line breaks.
      .transform((name) => name.replace(/\s+/g, ' ')),
  })
  .strict()

export type TelegramTestInput = z.infer<typeof telegramTestSchema>
