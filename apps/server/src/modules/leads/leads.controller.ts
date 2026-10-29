import type { Context } from 'hono'
import type { AuthVariables } from '../../middleware/auth.middleware.js'
import { leadsService } from './leads.service.js'
import type {
  CreateLeadInput,
  DuplicatesInput,
  FromPlacesInput,
  PastePreviewInput,
  PasteSaveInput,
  ResolvePinInput,
  UpdateLeadInput,
} from './leads.validation.js'

type AdminContext = Context<{ Variables: AuthVariables }>

export async function get(c: AdminContext, id: string) {
  return c.json({ success: true, data: await leadsService.get(id) })
}

export async function create(c: AdminContext, input: CreateLeadInput) {
  return c.json({ success: true, data: await leadsService.create(input) }, 201)
}

export async function update(
  c: AdminContext,
  id: string,
  input: UpdateLeadInput
) {
  return c.json({ success: true, data: await leadsService.update(id, input) })
}

export async function remove(c: AdminContext, id: string) {
  return c.json({ success: true, data: await leadsService.remove(id) })
}

export async function resolvePin(c: AdminContext, input: ResolvePinInput) {
  return c.json({ success: true, data: await leadsService.resolvePin(input) })
}

export async function duplicates(c: AdminContext, input: DuplicatesInput) {
  return c.json({ success: true, data: await leadsService.duplicates(input) })
}

export async function pastePreview(c: AdminContext, input: PastePreviewInput) {
  return c.json({ success: true, data: await leadsService.pastePreview(input) })
}

export async function pasteSave(c: AdminContext, input: PasteSaveInput) {
  return c.json(
    { success: true, data: await leadsService.pasteSave(input) },
    201
  )
}

export async function fromPlaces(c: AdminContext, input: FromPlacesInput) {
  return c.json(
    { success: true, data: await leadsService.fromPlaces(input) },
    201
  )
}
