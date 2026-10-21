import { AppError } from '../../lib/errors.js'
import { favouriteSaveRefusal, MAX_FAVOURITES } from '../../lib/favourites.js'
import type { VendorListItemResponse } from '../vendors/vendors.service.js'

/**
 * The favourites service's rules, over the reads and writes it is given:
 * favourites.service.ts passes the real repository and the garage list's
 * card builder, the unit tests pass stand-ins. No database or env import
 * here, so the rules run in a test without either.
 */

/** What the rules need of the repository (favourites.repository.ts). */
export interface FavouritesStore {
  findUser(userId: string): Promise<{ id: string; status: string } | undefined>
  listOpen(userId: string): Promise<Array<{ vendorId: string; pausedAt: Date | null }>>
  garageOpen(vendorId: string): Promise<boolean>
  saveUnderLimit<R extends string>(input: {
    userId: string
    vendorId: string
    decide: (facts: { alreadySaved: boolean; count: number }) => R | null
  }): Promise<{ refusal: R | null }>
  remove(userId: string, vendorId: string): Promise<void>
}

export interface FavouritesResponse {
  /** The garage list's own cards, newest saved first. */
  items: VendorListItemResponse[]
  /**
   * Saved garages that are paused: their page opens and says why, but they
   * take no bookings. The list's cards never show a paused garage, so this
   * says it beside the card rather than changing the card's shape.
   */
  pausedVendorIds: string[]
  /** How many may be saved (lib/favourites.ts). */
  max: number
}

export function favouritesWith(deps: {
  store: FavouritesStore
  /** The garage list's cards for these ids, in this order (vendorCardsFor). */
  cards: (page: Array<{ id: string; distanceM: number | null }>) => Promise<VendorListItemResponse[]>
  onSaved?: (userId: string, vendorId: string) => void
}) {
  const { store } = deps

  async function assertActive(userId: string) {
    const user = await store.findUser(userId)
    if (!user) throw new AppError(404, 'User not found', 'USER_NOT_FOUND')
    if (user.status === 'suspended') throw new AppError(403, 'Account is suspended', 'ACCOUNT_SUSPENDED')
  }

  return {
    /**
     * Saved garages, as the list's cards. Only those customers can open: a
     * garage in the Bin, suspended, archived or not verified is left out by
     * the store's read (and kept, in case it comes back).
     */
    async list(userId: string): Promise<FavouritesResponse> {
      const saved = await store.listOpen(userId)
      // No distance: Saved garages has no location to measure from.
      const items = await deps.cards(saved.map((row) => ({ id: row.vendorId, distanceM: null })))
      return {
        items,
        pausedVendorIds: saved.filter((row) => row.pausedAt !== null).map((row) => row.vendorId),
        max: MAX_FAVOURITES,
      }
    },

    /**
     * The heart. Idempotent: saving one already saved answers the same, even
     * at the cap. A garage customers cannot open is a 404, as on its page.
     */
    async save(userId: string, vendorId: string) {
      await assertActive(userId)
      if (!(await store.garageOpen(vendorId))) {
        throw new AppError(404, 'Vendor not found', 'VENDOR_NOT_FOUND')
      }
      const { refusal } = await store.saveUnderLimit({ userId, vendorId, decide: favouriteSaveRefusal })
      if (refusal) {
        throw new AppError(
          409,
          `You can save up to ${MAX_FAVOURITES} garages. Remove one from Saved garages to save this one.`,
          'FAVOURITES_LIMIT'
        )
      }
      deps.onSaved?.(userId, vendorId)
      return { vendorId, saved: true as const }
    },

    /** The heart, off. Idempotent: one not saved answers the same. */
    async remove(userId: string, vendorId: string) {
      await store.remove(userId, vendorId)
      return { vendorId, saved: false as const }
    },
  }
}
