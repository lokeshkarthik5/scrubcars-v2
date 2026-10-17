import { logger } from '../../lib/logger.js'
import { vendorCardsFor } from '../vendors/vendors.service.js'
import { favouritesRepository } from './favourites.repository.js'
import { favouritesWith } from './favourites.rules.js'

export type { FavouritesResponse } from './favourites.rules.js'

const log = logger.child({ module: 'favourites' })

/**
 * A customer's saved garages: the rules in favourites.rules.ts over the
 * repository, with the garage list's own cards (vendorCardsFor), so Saved
 * garages and the list never differ in shape.
 */
export const favouritesService = favouritesWith({
  store: favouritesRepository,
  cards: (page) => vendorCardsFor(page),
  onSaved: (userId, vendorId) => log.info({ userId, vendorId }, 'favourites:saved'),
})
