import type { Context } from 'hono'
import type { AuthVariables } from '../../middleware/auth.middleware.js'
import { getTenant, type TenantVariables } from '../../middleware/tenant.middleware.js'
import { FAKE_PICTURE } from '../../lib/ai-images.js'
import { serviceMediaService, type MediaActor } from './service-media.service.js'
import type {
  AiPicturesInput,
  StartVideoInput,
  UseAiPictureInput,
} from './service-media.validation.js'

type GarageContext = Context<{ Variables: TenantVariables }>
type AdminContext = Context<{ Variables: AuthVariables }>

/** The active company. Produced by resolveTenant, never by a request param. */
function garage(c: GarageContext): MediaActor {
  return { kind: 'garage', vendorId: getTenant(c).vendorId }
}

function admin(c: AdminContext): MediaActor {
  return { kind: 'admin', sub: c.get('auth').sub }
}

// ─── Garage app ──────────────────────────────────────────────────────────────

export function getGarageConfig(c: GarageContext) {
  return c.json({ success: true, data: serviceMediaService.config() })
}

export async function startGarageVideo(c: GarageContext, serviceId: string, input: StartVideoInput) {
  const data = await serviceMediaService.startVideo(garage(c), serviceId, input)
  return c.json({ success: true, data }, 201)
}

export async function getGarageMedia(c: GarageContext, serviceId: string, mediaId: string) {
  const data = await serviceMediaService.getMedia(garage(c), serviceId, mediaId)
  return c.json({ success: true, data })
}

// ─── Admin ───────────────────────────────────────────────────────────────────

export function getAdminConfig(c: AdminContext) {
  return c.json({ success: true, data: serviceMediaService.config() })
}

export function getAiConfig(c: AdminContext) {
  return c.json({ success: true, data: serviceMediaService.aiConfig() })
}

export async function startAdminVideo(c: AdminContext, serviceId: string, input: StartVideoInput) {
  const data = await serviceMediaService.startVideo(admin(c), serviceId, input)
  return c.json({ success: true, data }, 201)
}

export async function getAdminMedia(c: AdminContext, serviceId: string, mediaId: string) {
  const data = await serviceMediaService.getMedia(admin(c), serviceId, mediaId)
  return c.json({ success: true, data })
}

export async function generateAiPictures(c: AdminContext, serviceId: string, input: AiPicturesInput) {
  const data = await serviceMediaService.generateAiPictures(c.get('auth').sub, serviceId, input.prompt)
  return c.json({ success: true, data }, 201)
}

export async function useAiPicture(c: AdminContext, serviceId: string, input: UseAiPictureInput) {
  const data = await serviceMediaService.useAiPicture(c.get('auth').sub, serviceId, input)
  return c.json({ success: true, data }, 201)
}

// ─── Cloudflare Stream ───────────────────────────────────────────────────────

export async function handleStreamWebhook(c: Context) {
  // The signature covers the exact bytes Stream sent, so the body is read as
  // text and parsed only once it is verified.
  const rawBody = await c.req.text()
  const data = await serviceMediaService.handleStreamWebhook(rawBody, c.req.header('webhook-signature'))
  return c.json({ success: true, data })
}

// ─── STREAM_FAKE (E2E only) ──────────────────────────────────────────────────

/** Takes the upload and throws it away, as far as a test can tell like Stream. */
export async function fakeStreamUpload(c: Context) {
  await c.req.arrayBuffer()
  return c.body(null, 200)
}

/** Every fake video's poster. */
export function fakeStreamThumbnail(c: Context) {
  c.header('Content-Type', 'image/png')
  c.header('Cache-Control', 'no-store')
  return c.body(new Uint8Array(FAKE_PICTURE))
}
