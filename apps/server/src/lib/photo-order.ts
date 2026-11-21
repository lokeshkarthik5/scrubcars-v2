/**
 * Garage photo order (owner OK 21 Nov 2026): "Make cover" and the ← → arrows
 * in the admin editor, the garage website's Photos page and the garage app
 * send the garage's whole gallery in its new order, and the server writes
 * `vendor_photos.sort_order` 0..n-1 from it. The first photo is the cover:
 * the one customers see first on the garage card and the garage page.
 *
 * The list must be exactly the garage's photos as they are now: every one of
 * them, each once, and none from another garage. Anything else is refused,
 * never half-applied, so a screen that is out of date (a photo added or
 * deleted elsewhere meanwhile) reloads instead of guessing.
 */
import { AppError } from './errors.js'

export type PhotoOrderProblem = 'PHOTO_ORDER_DUPLICATE' | 'PHOTO_ORDER_STALE'

/** Each problem's status and words, as the error the routes answer with. */
export const PHOTO_ORDER_ERRORS: Record<
  PhotoOrderProblem,
  { status: 400 | 409; message: string }
> = {
  PHOTO_ORDER_DUPLICATE: {
    status: 400,
    message: 'Each photo can be in the order only once.',
  },
  PHOTO_ORDER_STALE: {
    status: 409,
    message: "The photos have changed since this page loaded. Reload and try again.",
  },
}

/**
 * Why `requested` can't be the new order of a garage whose photos are
 * `currentIds`, or null when it can. A duplicate is the request's own
 * mistake (400); a missing, extra or foreign id means the screen is behind
 * the garage's photos (409).
 */
export function photoOrderProblem(
  currentIds: readonly string[],
  requested: readonly string[]
): PhotoOrderProblem | null {
  const asked = new Set(requested)
  if (asked.size !== requested.length) return 'PHOTO_ORDER_DUPLICATE'
  if (asked.size !== currentIds.length) return 'PHOTO_ORDER_STALE'
  for (const id of currentIds) {
    if (!asked.has(id)) return 'PHOTO_ORDER_STALE'
  }
  return null
}

/** The error a route answers a problem with. */
export function photoOrderError(problem: PhotoOrderProblem): AppError {
  const { status, message } = PHOTO_ORDER_ERRORS[problem]
  return new AppError(status, message, problem)
}
