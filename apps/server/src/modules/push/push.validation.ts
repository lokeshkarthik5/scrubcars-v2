import { z } from 'zod'
import { isAllowedPushEndpoint, isValidSubscriptionKeys, MAX_ENDPOINT_LENGTH } from '../../lib/push.js'

/**
 * A browser's subscription, as PushSubscription.toJSON() gives it. Strict:
 * nothing else rides along. The endpoint must be a known push service
 * (lib/push.ts), since the API will POST to it.
 */
const endpoint = z
  .string()
  .trim()
  .max(MAX_ENDPOINT_LENGTH)
  .refine(isAllowedPushEndpoint, 'Not a browser push service address')

export const subscribeSchema = z
  .object({
    endpoint,
    // Browsers send null here; the push service decides how long it lasts.
    expirationTime: z.number().nullable().optional(),
    keys: z
      .object({
        p256dh: z.string().trim().max(200),
        auth: z.string().trim().max(100),
      })
      .strict()
      .refine(isValidSubscriptionKeys, 'Not a valid subscription key'),
  })
  .strict()

/** Turning this browser off, asking whether it is on, or sending it a test. */
export const endpointSchema = z.object({ endpoint }).strict()

/** The customer's two switches (Profile → Notifications). */
export const preferencesSchema = z
  .object({
    bookingUpdates: z.boolean().optional(),
    reminders: z.boolean().optional(),
  })
  .strict()
  .refine((input) => input.bookingUpdates !== undefined || input.reminders !== undefined, 'Nothing to change')

export type SubscribeInput = z.infer<typeof subscribeSchema>
export type EndpointInput = z.infer<typeof endpointSchema>
export type PreferencesInput = z.infer<typeof preferencesSchema>
