import { GOOGLE_REFRESH_AFTER_DAYS, googleHoldEnded } from './places/refresh.js'
import { googleIsMain, heldGoogleRating, type GoogleRating } from './ratings.js'

/**
 * Linking a garage to its Google listing (Google rating for new garages,
 * 21 Nov 2026). No new table: the listing lives on the garage's lead
 * (`leads.vendor_id`, unique, so a garage has at most one lead), whose
 * Google fields the nightly refresh already reads again every 29 days
 * (lib/places/refresh.ts). The team links from the garage's side panel in
 * admin; garages never link themselves. Pure: no database, no clock.
 */

/** Around the garage's pin, how far the "Link to Google listing" search looks. */
export const GARAGE_GOOGLE_SEARCH_RADIUS_KM = 10

/** At most this many places in the dialog, nearest the pin first. */
export const GARAGE_GOOGLE_RESULTS_MAX = 10

/** A lead as the link decision sees it. */
export interface LeadForLink {
  id: string
  vendorId: string | null
  googlePlaceId: string | null
}

export type GoogleLinkPlan =
  /** The garage's own lead takes the place (a first link, a Change, or the same place read again). */
  | { kind: 'update'; leadId: string }
  /** A lead not yet a garage already holds this place: it becomes this garage's lead. */
  | { kind: 'link_lead'; leadId: string }
  /** The garage has no lead and nobody holds the place: a lead is made for it. */
  | { kind: 'create' }
  /** Another garage's lead holds this place. */
  | { kind: 'taken'; leadId: string; vendorId: string }
  /** The garage has its own lead, and another lead (not a garage) holds this place. */
  | { kind: 'on_other_lead'; leadId: string }

/**
 * What linking this garage to this place does, from the garage's lead (if
 * it has one) and the lead holding the place id (place ids are unique on
 * leads, the leads' own "same place" rule). A place id is never on two
 * leads, so a place another lead holds is either moved there by linking
 * that lead (when the garage has none) or refused with what to do.
 */
export function googleLinkPlan(
  vendorId: string,
  garageLead: LeadForLink | null,
  placeLead: LeadForLink | null
): GoogleLinkPlan {
  if (placeLead) {
    if (placeLead.vendorId && placeLead.vendorId !== vendorId)
      return { kind: 'taken', leadId: placeLead.id, vendorId: placeLead.vendorId }
    if (placeLead.vendorId === vendorId) return { kind: 'update', leadId: placeLead.id }
    if (garageLead) return { kind: 'on_other_lead', leadId: placeLead.id }
    return { kind: 'link_lead', leadId: placeLead.id }
  }
  if (garageLead) return { kind: 'update', leadId: garageLead.id }
  return { kind: 'create' }
}

/**
 * What a link does to a pin the lead took from Google (`pin_source`
 * 'google'): it follows the place now linked, at Google's location for it
 * read now, so it is dated with the rest of Google's fields (Google's 30
 * days). For a different place that Google gave no location, the old place's
 * pin goes: it is not this place's, and its read would otherwise look fresh.
 * The same place with no location keeps its pin, as the nightly refresh
 * does. A pin of the team's own is never touched. `undefined`: leave it.
 */
export function googleLinkPin(
  lead: { pinSource: string | null; googlePlaceId: string | null },
  placeId: string,
  details: { lat: number | null; lng: number | null }
): { lat: number; lng: number } | null | undefined {
  if (lead.pinSource !== 'google') return undefined
  if (details.lat !== null && details.lng !== null) return { lat: details.lat, lng: details.lng }
  return lead.googlePlaceId === placeId ? undefined : null
}

/** What Unlink writes on the garage's lead: no listing, nothing of Google's, and a pin from Google with it. */
export function googleUnlinkPatch(
  lead: { name: string | null; pinSource: string | null },
  garageName: string,
  nameMax: number
) {
  return {
    googlePlaceId: null,
    googleName: null,
    googlePhone: null,
    googleAddress: null,
    googleRating: null,
    googleReviewCount: null,
    googleFetchedAt: null,
    // A lead named only by Google needs a name of its own once the place
    // id goes (leads_name_check): the garage's, which is ours.
    ...(lead.name === null ? { name: garageName.slice(0, nameMax).trim() } : {}),
    ...(lead.pinSource === 'google' ? { lat: null, lng: null, pinSource: null } : {}),
  }
}

/** The side panel's "Google listing" section, from the garage's lead. */
export interface AdminGoogleListing {
  leadId: string
  placeId: string
  /** As Google lists it, while the 30 days hold; null once they are up or cleared. */
  name: string | null
  address: string | null
  /** Google's rating that may be shown now (heldGoogleRating), or null. */
  google: GoogleRating | null
  /** When Detlio last read it from Google; null once cleared (Google no longer has it, or it couldn't be read). */
  readAt: string | null
  /** When the nightly refresh reads it again (29 days on). */
  nextReadBy: string | null
  /** Counted Detlio reviews. */
  detlioReviews: number
  /** Customers see Google's rating now: there is one, and fewer than 5 counted Detlio reviews. */
  shown: boolean
  /** How the lead came: 'google' from a Coverage search or this link, else how the team added it. */
  leadSource: string
  /** The last Link to Google listing on this garage, from admin_audit_log; null when it came with its Coverage lead. */
  linkedBy: string | null
  linkedAt: string | null
}

const DAY_MS = 24 * 60 * 60 * 1000

export function adminGoogleListing(
  lead: {
    id: string
    source: string
    googlePlaceId: string
    googleName: string | null
    googleAddress: string | null
    googleRating: string | number | null
    googleReviewCount: number | null
    googleFetchedAt: Date | null
  },
  detlioReviews: number,
  linked: { by: string; at: Date } | null,
  now: Date
): AdminGoogleListing {
  const google = heldGoogleRating(lead, now)
  const fetchedAt = lead.googleFetchedAt
  const held = fetchedAt !== null && !googleHoldEnded(fetchedAt, now)
  return {
    leadId: lead.id,
    placeId: lead.googlePlaceId,
    name: held ? lead.googleName : null,
    address: held ? lead.googleAddress : null,
    google,
    readAt: fetchedAt ? fetchedAt.toISOString() : null,
    nextReadBy: fetchedAt
      ? new Date(fetchedAt.getTime() + GOOGLE_REFRESH_AFTER_DAYS * DAY_MS).toISOString()
      : null,
    detlioReviews,
    shown: googleIsMain(google, detlioReviews),
    leadSource: lead.source,
    linkedBy: linked?.by ?? null,
    linkedAt: linked ? linked.at.toISOString() : null,
  }
}

/** A Google result in the link dialog, nearest the garage's pin first. */
export interface GarageGooglePlace {
  placeId: string
  name: string
  address: string | null
  rating: number | null
  reviewCount: number | null
  /** Straight-line metres from the garage's pin. */
  distanceM: number
  /** This garage's listing now. */
  current: boolean
  /** Another garage already linked to it (it cannot be linked here). */
  linkedGarage: { id: string; name: string } | null
  /** A lead not yet a garage holds it. */
  onLead: { id: string; name: string } | null
}

/** Straight-line metres between two pins (haversine). */
export function metresBetween(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number }
): number {
  const rad = (deg: number) => (deg * Math.PI) / 180
  const dLat = rad(b.lat - a.lat)
  const dLng = rad(b.lng - a.lng)
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2
  return Math.round(2 * 6_371_000 * Math.asin(Math.sqrt(h)))
}

/** The dialog's list: one row a place, nearest the pin first, at most GARAGE_GOOGLE_RESULTS_MAX. */
export function garageGooglePlaces(
  pin: { lat: number; lng: number },
  found: ReadonlyArray<{
    placeId: string
    name: string
    address: string | null
    lat: number
    lng: number
    rating: number | null
    reviewCount: number | null
  }>,
  vendorId: string,
  holders: ReadonlyArray<{
    leadId: string
    leadName: string
    placeId: string
    vendorId: string | null
    garageName: string | null
  }>
): GarageGooglePlace[] {
  const seen = new Set<string>()
  const byPlace = new Map(holders.map((row) => [row.placeId, row]))
  return found
    .filter((place) => {
      if (seen.has(place.placeId)) return false
      seen.add(place.placeId)
      return true
    })
    .map((place): GarageGooglePlace => {
      const holder = byPlace.get(place.placeId)
      return {
        placeId: place.placeId,
        name: place.name,
        address: place.address,
        rating: place.rating,
        reviewCount: place.reviewCount,
        distanceM: metresBetween(pin, place),
        current: holder?.vendorId === vendorId,
        linkedGarage:
          holder?.vendorId && holder.vendorId !== vendorId
            ? { id: holder.vendorId, name: holder.garageName ?? holder.leadName }
            : null,
        onLead: holder && !holder.vendorId ? { id: holder.leadId, name: holder.leadName } : null,
      }
    })
    .sort((a, b) => a.distanceM - b.distanceM)
    .slice(0, GARAGE_GOOGLE_RESULTS_MAX)
}
