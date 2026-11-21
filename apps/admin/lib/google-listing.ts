import type { AdminGoogleListing, AdminGooglePlace } from '@repo/core/api/admin-google'
import { GOOGLE_RATING_RULES } from '@repo/core/ratings'

/**
 * The garage side panel's "Google listing" words (Google rating for new
 * garages, 21 Nov 2026). The rules are the API's (lib/garage-google.ts);
 * this only says them.
 */

/** "14 Nov", in IST. */
export function shortDay(iso: string): string {
  return new Date(iso).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    timeZone: 'Asia/Kolkata',
  })
}

/** "Read from Google 14 Nov · next read by 13 Dec", or why there is nothing to read. */
export function readLine(listing: AdminGoogleListing): string {
  if (!listing.readAt || !listing.nextReadBy) {
    return 'Google no longer has this listing, or it could not be read. Link the new listing, or leave it.'
  }
  return `Read from Google ${shortDay(listing.readAt)} · next read by ${shortDay(listing.nextReadBy)}`
}

/** Whether customers see it now, and why. `shown` lights the first words. */
export function customersLine(listing: AdminGoogleListing): { shown: boolean; lead: string; rest: string } {
  const n = listing.detlioReviews
  const reviews = `${n} Detlio ${n === 1 ? 'review' : 'reviews'}`
  if (listing.shown) {
    return {
      shown: true,
      lead: 'Customers see it',
      rest: ` while the garage has fewer than ${GOOGLE_RATING_RULES.detlioTakesOverAt} Detlio reviews (now ${n}).`,
    }
  }
  if (listing.google) {
    return {
      shown: false,
      lead: 'Customers see Detlio’s own rating',
      rest: ` now (${reviews}); Google’s is only a small line on its page.`,
    }
  }
  return {
    shown: false,
    lead: 'Customers don’t see a Google rating',
    rest: ' now: they see “New” until it has Detlio reviews.',
  }
}

/** Who linked it, or that it came with its Coverage lead. */
export function linkedLine(listing: AdminGoogleListing): string {
  if (listing.linkedBy && listing.linkedAt) {
    return `Linked by ${listing.linkedBy}, ${shortDay(listing.linkedAt)}`
  }
  return 'Linked through its Coverage lead'
}

/** "120 m from the pin", "6.8 km from the pin". */
export function fromPin(distanceM: number): string {
  return distanceM < 1000
    ? `${Math.round(distanceM / 10) * 10} m from the pin`
    : `${(distanceM / 1000).toFixed(1)} km from the pin`
}

/** Why a result cannot be picked, or null. */
export function placeBlocked(place: AdminGooglePlace): string | null {
  if (place.linkedGarage) return `Linked to ${place.linkedGarage.name}`
  return null
}

/** The search's words when the dialog opens: the garage's name and its area. */
export function defaultGoogleSearch(name: string, area: string | null | undefined): string {
  return [name, area].filter(Boolean).join(' ').trim().slice(0, 80)
}
