import type { Context } from 'hono'
import { signedInAdmin, type AuthVariables } from '../../middleware/auth.middleware.js'
import { garageGoogleService } from './garage-google.service.js'
import type {
  GarageGoogleLinkInput,
  GarageGoogleSearchInput,
  GarageGoogleUnlinkInput,
} from './garage-google.validation.js'

type AdminContext = Context<{ Variables: AuthVariables }>

export async function search(c: AdminContext, vendorId: string, input: GarageGoogleSearchInput) {
  return c.json({ success: true, data: await garageGoogleService.search(vendorId, input) })
}

export async function link(c: AdminContext, vendorId: string, input: GarageGoogleLinkInput) {
  const actor = { sub: c.get('auth').sub, name: input.actorName || signedInAdmin(c).name }
  return c.json({ success: true, data: await garageGoogleService.link(vendorId, input, actor) })
}

export async function unlink(c: AdminContext, vendorId: string, input: GarageGoogleUnlinkInput) {
  const actor = { sub: c.get('auth').sub, name: input.actorName || signedInAdmin(c).name }
  return c.json({ success: true, data: await garageGoogleService.unlink(vendorId, actor) })
}
