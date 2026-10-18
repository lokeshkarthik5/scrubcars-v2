import OpenAI from 'openai'
import { env } from './env.js'
import { AppError } from './errors.js'
import { logger } from './logger.js'

/**
 * Sample pictures for a service with no real photo, made with OpenAI's image
 * model (admin only). The prompt arrives already built and cleaned
 * (buildAiPicturePrompt in lib/service-media.ts); nothing about a customer,
 * a garage's people or a booking is ever sent.
 *
 * Under AI_FAKE (E2E only, refused in production) OpenAI is never called and
 * every picture is the same small graphite PNG.
 */

const log = logger.child({ module: 'ai-images' })

/** A 32×18 graphite PNG: the fake's picture, and the fake video's poster. */
export const FAKE_PICTURE = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAACAAAAASCAIAAAC1qksFAAAAH0lEQVR42mPQ0jWmKWIYtWDUglELRi0YtWDUAnpYAAALHzaQNOICcAAAAABJRU5ErkJggg==',
  'base64'
)

/** How many options each press makes: the admin picks one of two. */
export const PICTURES_PER_REQUEST = 2

export function isAiPicturesEnabled(): boolean {
  return env.aiFake || Boolean(env.openaiApiKey)
}

export type GeneratedPicture = {
  bytes: Uint8Array
  contentType: 'image/webp' | 'image/png' | 'image/jpeg'
  ext: 'webp' | 'png' | 'jpeg'
}

let client: OpenAI | null = null

function getClient(): OpenAI {
  if (!env.openaiApiKey) {
    throw new AppError(404, 'Not found', 'NOT_FOUND')
  }
  // Generation takes tens of seconds; one retry covers a dropped connection
  // without letting a slow minute become three.
  client ??= new OpenAI({ apiKey: env.openaiApiKey, timeout: 120_000, maxRetries: 1 })
  return client
}

/**
 * Two pictures for one prompt, in one request (n = 2), landscape 1536×1024
 * at medium quality, returned as WebP so they are small enough to serve
 * as they are. Any failure of the SDK is the same 503 to the admin: there is
 * nothing they can do about OpenAI being down, out of credit or refusing,
 * except try other words later.
 */
export async function generatePictures(prompt: string): Promise<GeneratedPicture[]> {
  if (env.aiFake) {
    return Array.from({ length: PICTURES_PER_REQUEST }, () => ({
      bytes: FAKE_PICTURE,
      contentType: 'image/png' as const,
      ext: 'png' as const,
    }))
  }

  try {
    const response = await getClient().images.generate({
      model: env.aiImageModel,
      prompt,
      n: PICTURES_PER_REQUEST,
      size: '1536x1024',
      quality: 'medium',
      output_format: 'webp',
    })

    const pictures = (response.data ?? [])
      .map((image) => image.b64_json)
      .filter((b64): b64 is string => typeof b64 === 'string' && b64.length > 0)
      .map((b64) => ({
        bytes: Buffer.from(b64, 'base64'),
        contentType: 'image/webp' as const,
        ext: 'webp' as const,
      }))

    if (pictures.length === 0) {
      log.error({ model: env.aiImageModel }, 'ai-images:empty-response')
      throw aiUnavailable()
    }
    return pictures
  } catch (error) {
    if (error instanceof AppError) throw error
    if (error instanceof OpenAI.APIError) {
      // Status and OpenAI's own code only: the prompt stays out of the logs.
      log.error({ status: error.status, code: error.code, model: env.aiImageModel }, 'ai-images:failed')
      if (error.status === 400 && error.code === 'moderation_blocked') {
        throw new AppError(
          503,
          'OpenAI would not make a picture from that description. Try plainer words.',
          'AI_UNAVAILABLE'
        )
      }
      throw aiUnavailable()
    }
    log.error({ err: error }, 'ai-images:failed')
    throw aiUnavailable()
  }
}

function aiUnavailable(): AppError {
  return new AppError(
    503,
    'Pictures could not be made right now. Try again in a few minutes.',
    'AI_UNAVAILABLE'
  )
}
