import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'

/**
 * What Home hands to checkout: the offer code the customer tapped, and the car
 * they were looking at when they tapped Book a wash.
 *
 * Between the two lies the garage list, the search and the map, and none of
 * them knows anything about codes or cars. Rather than thread a code through
 * every link on the way (VendorCard, the map's pins, search results), Home
 * writes it here and checkout reads it back. A garage's own offer also rides
 * in the URL (`/garage/:id?code=`), which the garage page passes on to
 * checkout; this store is what carries a Detlio-wide code, whose garage the
 * customer has not picked yet.
 *
 * Kept on the device (localStorage), so it survives a reload on the way, but
 * never trusted blindly: it belongs to one account, it ends when the code
 * does, and checkout validates the code with the server like a typed one. It
 * is cleared on a booking, on Remove, and on sign-out.
 */

export interface PendingCheckout {
  /** Whose it is. Another account signed in on this phone does not inherit it. */
  userId: string
  /** The offer's code; null when only a car was picked (Book a wash). */
  code: string | null
  /** The garage a code is for; null for a Detlio-wide code. */
  vendorId: string | null
  /** The car chosen on Home. Checkout uses it only if it is still a saved car. */
  vehicleId: string | null
  /** When the code stops working (the offer's ends_at). */
  endsAt: string | null
  /** When this was written, epoch ms. */
  savedAt: number
}

/**
 * How long a car picked on Home stays picked. A day: long enough to choose a
 * garage after lunch, short enough that next week's checkout does not open on
 * the car tapped last time.
 */
export const PENDING_CHECKOUT_TTL_MS = 24 * 60 * 60 * 1000

/** Its localStorage key, named in the privacy policy's storage table. */
export const PENDING_CHECKOUT_STORAGE_KEY = 'detlio-pending-checkout'

/**
 * The pending checkout if it still applies to this customer now, or null:
 * none written, written by another account, older than a day, or its code has
 * ended. Pure, with the clock passed in.
 */
export function livePendingCheckout(
  pending: PendingCheckout | null,
  context: { userId: string | null | undefined; now: number }
): PendingCheckout | null {
  if (!pending || !context.userId || pending.userId !== context.userId) return null
  if (context.now - pending.savedAt > PENDING_CHECKOUT_TTL_MS) return null
  if (pending.endsAt) {
    const ends = Date.parse(pending.endsAt)
    if (!Number.isNaN(ends) && context.now >= ends) return null
  }
  return pending
}

/**
 * The code to apply at this garage's checkout, or null. A garage's own code is
 * not carried to another garage, where it could only be refused; a
 * Detlio-wide one (no garage) applies anywhere.
 */
export function pendingCodeFor(pending: PendingCheckout | null, vendorId: string): string | null {
  if (!pending?.code) return null
  return pending.vendorId === null || pending.vendorId === vendorId ? pending.code : null
}

/**
 * The server's refusals (its error `code`) that no change of cart or car can
 * undo: the code is unknown, switched off, over, used up, or already used by
 * this customer. Checkout still says so on the page, but stops carrying the
 * code to the next garage's checkout, where it could only be refused again.
 * A minimum order or a car the code is not for can change, so those keep it.
 */
const LASTING_REFUSALS: ReadonlySet<string> = new Set([
  'DISCOUNT_NOT_FOUND',
  'DISCOUNT_INACTIVE',
  'DISCOUNT_EXPIRED',
  'DISCOUNT_EXHAUSTED',
  'DISCOUNT_ALREADY_USED',
])

export function isLastingRefusal(errorCode: string | null | undefined): boolean {
  return !!errorCode && LASTING_REFUSALS.has(errorCode)
}

interface PendingCheckoutState {
  pending: PendingCheckout | null
  /** An offer was tapped. Replaces whatever was pending. */
  rememberOffer: (input: {
    userId: string
    code: string
    vendorId: string | null
    vehicleId: string | null
    endsAt: string
  }) => void
  /** Book a wash with this car. Keeps a pending code: the car is all that changed. */
  rememberCar: (input: { userId: string; vehicleId: string }) => void
  /** Remove at checkout: the code goes, the car stays. */
  forgetCode: () => void
  /** A booking was made, or the customer signed out. */
  clear: () => void
}

export const usePendingCheckoutStore = create<PendingCheckoutState>()(
  persist(
    (set) => ({
      pending: null,

      rememberOffer: ({ userId, code, vendorId, vehicleId, endsAt }) =>
        set({ pending: { userId, code, vendorId, vehicleId, endsAt, savedAt: Date.now() } }),

      rememberCar: ({ userId, vehicleId }) =>
        set((state) => {
          const keep = state.pending?.userId === userId ? state.pending : null
          return {
            pending: {
              userId,
              code: keep?.code ?? null,
              vendorId: keep?.vendorId ?? null,
              endsAt: keep?.endsAt ?? null,
              vehicleId,
              savedAt: Date.now(),
            },
          }
        }),

      forgetCode: () =>
        set((state) =>
          state.pending
            ? { pending: { ...state.pending, code: null, vendorId: null, endsAt: null } }
            : state
        ),

      clear: () => set({ pending: null }),
    }),
    {
      name: PENDING_CHECKOUT_STORAGE_KEY,
      // localStorage, named rather than left to zustand's default (which
      // reaches for `window`), so the unit tests can stand one in. Where it is
      // blocked (private mode, policy) the store lives in memory only, and
      // checkout still gets what this page load saw.
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({ pending: state.pending }),
    }
  )
)
