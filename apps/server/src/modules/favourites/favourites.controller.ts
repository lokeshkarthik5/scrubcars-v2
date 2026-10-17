import type { Context } from 'hono'
import type { AuthVariables } from '../../middleware/auth.middleware.js'
import { favouritesService } from './favourites.service.js'

type FavouritesContext = Context<{ Variables: AuthVariables }>

/** The signed-in customer: the only user whose saves are ever read or written. */
function getUserId(c: FavouritesContext): string {
  return c.get('auth').sub
}

export async function listFavourites(c: FavouritesContext) {
  const data = await favouritesService.list(getUserId(c))
  return c.json({ success: true, data })
}

export async function saveFavourite(c: FavouritesContext, vendorId: string) {
  const data = await favouritesService.save(getUserId(c), vendorId)
  return c.json({ success: true, data })
}

export async function removeFavourite(c: FavouritesContext, vendorId: string) {
  const data = await favouritesService.remove(getUserId(c), vendorId)
  return c.json({ success: true, data })
}
