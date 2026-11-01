import { z } from 'zod'
import { DEVICE_PLATFORMS, isExpoPushToken } from '../../lib/expo-push.js'
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

/**
 * A phone's Expo push token (`ExponentPushToken[…]`), as the native app gets
 * it from Expo. Strict, like the browser's: nothing else rides along, and the
 * token travels in the body (POST/DELETE), never the URL.
 */
const deviceToken = z.string().trim().max(200).refine(isExpoPushToken, 'Not an Expo push token')

export const registerDeviceSchema = z
  .object({
    token: deviceToken,
    platform: z.enum(DEVICE_PLATFORMS),
  })
  .strict()

export const removeDeviceSchema = z.object({ token: deviceToken }).strict()

/**
 * "Send a test to my phone": every phone of this person's, or just this one
 * when its token is named. Strict like the rest, and like the other routes it needs a JSON
 * body: the app sends `{}` for "all my phones".
 */
export const deviceTestSchema = z.object({ token: deviceToken.optional() }).strict()

export type SubscribeInput = z.infer<typeof subscribeSchema>
export type EndpointInput = z.infer<typeof endpointSchema>
export type PreferencesInput = z.infer<typeof preferencesSchema>
export type RegisterDeviceInput = z.infer<typeof registerDeviceSchema>
export type RemoveDeviceInput = z.infer<typeof removeDeviceSchema>
export type DeviceTestInput = z.infer<typeof deviceTestSchema>
