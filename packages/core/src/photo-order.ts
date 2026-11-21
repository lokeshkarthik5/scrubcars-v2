import { msg } from './i18n/translate'

/**
 * Garage photo order (owner OK 21 Nov 2026), as the three screens show it:
 * the admin editor's Logo & photos, the garage website's Photos page and the
 * garage app's Photos screen. Each photo has "Make cover" (to the front: the
 * photo customers see first on the garage card and page) and ← → arrows (one
 * place left or right, off at the ends); the first has a small Cover tag.
 * A move saves at once with the whole gallery in its new order
 * (PUT …/photos/order, apps/server/src/lib/photo-order.ts), and is put back
 * if the save fails.
 *
 * The words stay English here (msg) and each screen says t(label); admin
 * stays English.
 */

export type PhotoMove = 'cover' | 'left' | 'right'

export const PHOTO_ORDER_WORDS = {
  cover: msg('Cover'),
  makeCover: msg('Make this the cover photo'),
  left: msg('Move photo left'),
  right: msg('Move photo right'),
  failed: msg("Couldn't change the photo order. Try again."),
  stale: msg('Your photos changed somewhere else. Showing them as they are now.'),
  /** The garage's screens, under the Photos heading once there are two or more. */
  hint: msg(
    'The first photo is your cover: customers see it first. Tap the star to make a photo the cover, or the arrows to move it.'
  ),
} as const

/** The code the server answers when the list is not the garage's photos now. */
export const PHOTO_ORDER_STALE = 'PHOTO_ORDER_STALE'

/**
 * The gallery after `move` on photo `id`, or null when nothing would change
 * (the cover made cover, the first moved left, the last moved right, or an id
 * that isn't there). Never changes `photos`.
 */
export function movedPhotos<T extends { id: string }>(
  photos: readonly T[],
  id: string,
  move: PhotoMove
): T[] | null {
  const from = photos.findIndex((photo) => photo.id === id)
  if (from < 0) return null
  const to = move === 'cover' ? 0 : move === 'left' ? from - 1 : from + 1
  if (to < 0 || to >= photos.length || to === from) return null
  const next = photos.slice()
  const [photo] = next.splice(from, 1)
  next.splice(to, 0, photo!)
  return next
}

/** Which moves a photo at `index` of `count` can make: the arrows are off at the ends. */
export function photoMoves(index: number, count: number) {
  return {
    isCover: index === 0,
    cover: index > 0,
    left: index > 0,
    right: index < count - 1,
  }
}

/**
 * `current` in the order of `ids`, for putting an order back after a failed
 * save, or taking the server's order after a good one, without losing a photo
 * added (or bringing back one deleted) on this screen meanwhile: a photo not
 * in `ids` keeps its place after the ones that are, and an id that is no
 * longer in `current` is skipped.
 */
export function withOrderOf<T extends { id: string }>(
  current: readonly T[],
  ids: readonly string[]
): T[] {
  const rank = new Map(ids.map((id, index) => [id, index]))
  return current
    .map((photo, index) => ({ photo, index }))
    .sort((a, b) => {
      const ra = rank.get(a.photo.id)
      const rb = rank.get(b.photo.id)
      if (ra !== undefined && rb !== undefined) return ra - rb
      if (ra !== undefined) return -1
      if (rb !== undefined) return 1
      return a.index - b.index
    })
    .map(({ photo }) => photo)
}
