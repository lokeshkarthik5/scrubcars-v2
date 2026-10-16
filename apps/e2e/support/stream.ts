/**
 * Stands in for Cloudflare Stream's webhook.
 *
 * Under STREAM_FAKE the API hands the browser an upload link on itself and
 * never calls Cloudflare, so nothing would ever say a video is ready. This
 * says it, the way Stream does: the video object as the body, signed with the
 * webhook secret from .env.e2e (Webhook-Signature: time=…,sig1=HMAC-SHA256 of
 * "time.body"). The API checks it exactly as it checks Stream's own.
 */
import { createHmac } from 'node:crypto'
import { request } from '@playwright/test'
import { API } from './auth'
import { sql } from './db'

const secret = () => {
  const value = process.env.CLOUDFLARE_STREAM_WEBHOOK_SECRET
  if (!value) throw new Error('CLOUDFLARE_STREAM_WEBHOOK_SECRET is not set — playwright.config.ts loads .env.e2e')
  return value
}

export function signStreamBody(body: string, timeSecs = Math.floor(Date.now() / 1000)): string {
  const sig = createHmac('sha256', secret()).update(`${timeSecs}.${body}`).digest('hex')
  return `time=${timeSecs},sig1=${sig}`
}

/**
 * The Stream uid of a service's video once its upload has started. Read
 * from the row because the uid is Stream's business, never shown in an app.
 */
export async function videoUidFor(serviceId: string, timeoutMs = 10_000): Promise<string> {
  const deadline = Date.now() + timeoutMs
  for (;;) {
    const rows = await sql<{ video_uid: string }[]>`
      select video_uid from service_images
       where service_id = ${serviceId} and kind = 'video' and video_uid is not null
       order by created_at desc limit 1
    `
    if (rows.length > 0) return rows[0].video_uid
    if (Date.now() > deadline) throw new Error(`No video row for service ${serviceId}`)
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
}

/** POSTs a Stream webhook for this video; returns the response status. */
export async function fireStreamWebhook(
  video: { uid: string; readyToStream: boolean; duration?: number; state?: string; errorReasonCode?: string },
  options: { signature?: string } = {}
): Promise<number> {
  const body = JSON.stringify({
    uid: video.uid,
    readyToStream: video.readyToStream,
    duration: video.duration ?? -1,
    status: {
      state: video.state ?? (video.readyToStream ? 'ready' : 'inprogress'),
      ...(video.errorReasonCode ? { errorReasonCode: video.errorReasonCode } : {}),
    },
  })
  const ctx = await request.newContext({ baseURL: API, storageState: { cookies: [], origins: [] } })
  try {
    const res = await ctx.post('/api/v1/webhooks/cloudflare-stream', {
      data: body,
      headers: {
        'Content-Type': 'application/json',
        'Webhook-Signature': options.signature ?? signStreamBody(body),
      },
    })
    return res.status()
  } finally {
    await ctx.dispose()
  }
}
