import type { Context } from 'hono'
import type { AuthVariables } from '../../middleware/auth.middleware.js'
import { placesService } from './places.service.js'
import type { PlacesSearchInput } from './places.validation.js'

type AdminContext = Context<{ Variables: AuthVariables }>

export async function search(c: AdminContext, input: PlacesSearchInput) {
  return c.json({ success: true, data: await placesService.search(input) })
}
