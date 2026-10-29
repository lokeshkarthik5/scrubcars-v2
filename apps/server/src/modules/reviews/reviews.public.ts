/**
 * A review as anyone may see it, signed in or not.
 *
 * GET /reviews/vendors/:vendorId has no auth: the garage page lists reviews to
 * every visitor, and the garage's own Reviews screen reads the same feed. So it
 * carries only what is on screen — rating, comment, date, the services — and
 * the reviewer as a first name and an initial. No phone, no account or booking
 * id, no visit date: nothing that identifies or reaches the customer.
 */

export interface PublicReviewSource {
  id: string
  vendorId: string
  rating: number
  comment: string | null
  createdAt: Date
  /** 0065: the tags the customer picked, and the garage's public reply. */
  tags?: string[] | null
  reply?: string | null
  repliedAt?: Date | null
  user?: { name: string } | null
  booking?: {
    items?: Array<{ name: string }> | null
    service?: { id: string; name: string } | null
  } | null
}

/** "K. Arjun" and "Arjun Kumar" both read "Arjun K."; a single name stays whole. */
export function publicReviewerName(fullName: string | null | undefined): string | null {
  const parts = (fullName ?? '').trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return null

  // Tamil names often lead with a family initial ("K. Arjun", "R.K. Suresh"):
  // the given name is then the first part that is not an initial.
  const isInitial = (part: string) => part.length === 1 || part.includes('.')
  const given = parts.find((part) => !isInitial(part)) ?? parts[0]
  const others = parts.filter((part) => part !== given)
  const initialSource = others[others.length - 1]?.replace(/\./g, '')
  const initial = initialSource ? firstLetter(initialSource).toUpperCase() : undefined

  return initial ? `${given} ${initial}.` : given
}

// A whole letter as the reader sees it: in Tamil "கு" is one letter made of
// two code points, and cutting it after the first would print a different one.
const letters = new Intl.Segmenter(undefined, { granularity: 'grapheme' })
function firstLetter(word: string): string {
  return letters.segment(word)[Symbol.iterator]().next().value?.segment ?? ''
}

export function toPublicReviewResponse(review: PublicReviewSource) {
  const name = publicReviewerName(review.user?.name)
  return {
    id: review.id,
    vendorId: review.vendorId,
    rating: review.rating,
    comment: review.comment,
    createdAt: review.createdAt.toISOString(),
    tags: review.tags ?? [],
    reply: review.reply && review.repliedAt ? { text: review.reply, repliedAt: review.repliedAt.toISOString() } : null,
    user: name ? { name } : null,
    booking: review.booking
      ? {
          serviceNames: (review.booking.items ?? []).map((item) => item.name),
          service: review.booking.service
            ? { id: review.booking.service.id, name: review.booking.service.name }
            : null,
        }
      : null,
  }
}
