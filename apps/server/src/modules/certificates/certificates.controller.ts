import type { Context } from 'hono'
import type { AuthVariables } from '../../middleware/auth.middleware.js'
import { certificatesService } from './certificates.service.js'
import type { ShareInput, UpdateShareInput } from './certificates.validation.js'

type CustomerContext = Context<{ Variables: AuthVariables }>

/** The signed-in customer: the only one whose cars and links are ever read or written. */
function getUserId(c: CustomerContext): string {
  return c.get('auth').sub
}

/**
 * Every answer here carries a token or a car's record: never cached by a
 * browser or anything between, never indexed.
 */
function private_(c: Context) {
  c.header('Cache-Control', 'no-store')
  c.header('X-Robots-Tag', 'noindex, nofollow')
}

export async function getOwn(c: CustomerContext, vehicleId: string) {
  const data = await certificatesService.getOwn(getUserId(c), vehicleId)
  private_(c)
  return c.json({ success: true, data })
}

export async function share(c: CustomerContext, vehicleId: string, input: ShareInput) {
  const data = await certificatesService.share(getUserId(c), vehicleId, input)
  private_(c)
  return c.json({ success: true, data }, 201)
}

export async function updateShare(c: CustomerContext, vehicleId: string, input: UpdateShareInput) {
  const data = await certificatesService.updateShare(getUserId(c), vehicleId, input)
  private_(c)
  return c.json({ success: true, data })
}

export async function stopSharing(c: CustomerContext, vehicleId: string) {
  const data = await certificatesService.stopSharing(getUserId(c), vehicleId)
  private_(c)
  return c.json({ success: true, data })
}

export async function verify(c: Context, token: string) {
  const data = await certificatesService.verify(token)
  private_(c)
  return c.json({ success: true, data })
}

export async function sharedPhoto(c: Context, photoId: string, expiresAtSec: number, signature: string) {
  const photo = await certificatesService.sharedPhoto(photoId, expiresAtSec, signature)
  // Kept by the viewer's browser for the life of the signed path at most,
  // and never by a shared cache: the owner may stop sharing at any time.
  c.header('Cache-Control', 'private, max-age=300')
  c.header('X-Robots-Tag', 'noindex, nofollow')
  c.header('X-Content-Type-Options', 'nosniff')
  c.header('Content-Type', photo.contentType)
  return c.body(photo.body as Uint8Array<ArrayBuffer>)
}

export async function adminTotals(c: Context) {
  const data = await certificatesService.adminTotals()
  return c.json({ success: true, data })
}
