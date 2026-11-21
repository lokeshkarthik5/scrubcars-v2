import type { Context } from 'hono'
import { signedInAdmin, type AuthVariables } from '../../middleware/auth.middleware.js'
import { serviceTemplatesService } from './service-templates.service.js'
import type { CreateTemplateInput, SetTemplateOnInput, UpdateTemplateInput } from './service-templates.validation.js'

type AdminContext = Context<{ Variables: AuthVariables }>

export async function list(c: AdminContext, onlyOn: boolean) {
  return c.json({ success: true, data: await serviceTemplatesService.list(onlyOn) })
}

export async function create(c: AdminContext, input: CreateTemplateInput) {
  const data = await serviceTemplatesService.create(input, { sub: c.get('auth').sub, name: input.actorName })
  return c.json({ success: true, data }, 201)
}

export async function update(c: AdminContext, id: string, input: UpdateTemplateInput) {
  const data = await serviceTemplatesService.update(id, input, { sub: c.get('auth').sub, name: input.actorName })
  return c.json({ success: true, data })
}

export async function setOn(c: AdminContext, id: string, input: SetTemplateOnInput) {
  const data = await serviceTemplatesService.setOn(id, input.on, { sub: c.get('auth').sub, name: input.actorName })
  return c.json({ success: true, data })
}

// A DELETE carries no body, so the name comes from the session itself.
export async function remove(c: AdminContext, id: string) {
  const actor = signedInAdmin(c)
  const data = await serviceTemplatesService.remove(id, { sub: actor.sub, name: actor.name })
  return c.json({ success: true, data })
}
