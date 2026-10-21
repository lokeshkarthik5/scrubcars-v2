/**
 * Favourite garages: the heart on the garage list and the garage page, and
 * Profile's Saved garages. Pure, unit-tested; the module is
 * modules/favourites.
 *
 * Owner decision (17 Oct 2026): a customer saves garages to come back to
 * them. A save is personal data (which garages someone likes), read only by
 * that customer, and it is not test data: the pilot reset leaves it alone,
 * deleting the account or the garage takes it with it (ON DELETE CASCADE).
 */

/**
 * How many garages one customer may save. Far more than anyone books from,
 * and a wall for a script: the Saved garages list loads every card at once.
 * The apps read the same number from GET /users/me/favourites (`max`).
 */
export const MAX_FAVOURITES = 50

/**
 * Why a save is refused, if it is. Saving one already saved is not a
 * refusal (PUT is idempotent), even at the cap. `count` is how many the
 * customer has saved that customers can still open (one moved to the Bin
 * no longer takes a place).
 */
export function favouriteSaveRefusal(facts: { alreadySaved: boolean; count: number }): 'limit' | null {
  if (facts.alreadySaved) return null
  return facts.count >= MAX_FAVOURITES ? 'limit' : null
}
