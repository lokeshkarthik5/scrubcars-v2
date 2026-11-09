import type { Context } from 'hono'
import { signedInAdmin, type AuthVariables } from '../../middleware/auth.middleware.js'
import { citiesService } from './cities.service.js'
import type { CreateCityInput, OtherTownsInput, UpdateCityInput } from './cities.validation.js'

type AdminContext = Context<{ Variables: AuthVariables }>

export async function overview(c: AdminContext) {
  return c.json({ success: true, data: await citiesService.overview() })
}

export async function createCity(c: AdminContext, input: CreateCityInput) {
  const data = await citiesService.createCity(input, { sub: c.get('auth').sub, name: input.actorName })
  return c.json({ success: true, data }, 201)
}

export async function updateCity(c: AdminContext, id: string, input: UpdateCityInput) {
  const data = await citiesService.updateCity(id, input, { sub: c.get('auth').sub, name: input.actorName })
  return c.json({ success: true, data })
}

// A DELETE carries no body, so the name comes from the session itself.
export async function deleteCity(c: AdminContext, id: string) {
  const actor = signedInAdmin(c)
  const data = await citiesService.deleteCity(id, { sub: actor.sub, name: actor.name })
  return c.json({ success: true, data })
}

export async function setOtherTowns(c: AdminContext, input: OtherTownsInput) {
  const data = await citiesService.setOtherTowns(input, { sub: c.get('auth').sub, name: input.actorName })
  return c.json({ success: true, data })
}
