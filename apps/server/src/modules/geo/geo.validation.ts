import { z } from 'zod'

// Latitude/longitude bounds are worth enforcing: a swapped lat/lng pair is the
// single most common geo bug, and in India (lat ~8-37, lng ~68-97) a swap
// usually still falls inside both ranges — so the check below catches malformed
// input, not swaps. Swaps are caught by the map showing the wrong place.
const latitude = z.coerce.number().finite().min(-90).max(90)
const longitude = z.coerce.number().finite().min(-180).max(180)

export const autocompleteQuerySchema = z.object({
  q: z.string().trim().min(3).max(200),
  // Biases results toward the user's map view. Optional — the picker sends it
  // once it knows where the map is, and omits it on a cold open.
  lat: latitude.optional(),
  lng: longitude.optional(),
  // Groups a keystroke sequence into one billable provider session.
  sessionToken: z.string().trim().min(1).max(100).optional(),
})

export const reverseQuerySchema = z.object({
  lat: latitude,
  lng: longitude,
})

export const geocodeQuerySchema = z.object({
  q: z.string().trim().min(3).max(300),
})

export const resolveQuerySchema = z.object({
  placeId: z.string().trim().min(1).max(300),
  sessionToken: z.string().trim().min(1).max(100).optional(),
})

/**
 * Deliberately just "a string". Link *shape* is not validated — a vendor who
 * pastes the wrong kind of Google link gets a warning and can carry on, rather
 * than a rejection that tells them nothing. The one thing that IS enforced,
 * server-side, is the host allowlist, because fetching a user-supplied URL is an
 * SSRF surface.
 */
export const mapsLinkQuerySchema = z.object({
  url: z.string().trim().min(1).max(2048),
})

export const routeQuerySchema = z.object({
  fromLat: latitude,
  fromLng: longitude,
  toLat: latitude,
  toLng: longitude,
})

export type RouteQuery = z.infer<typeof routeQuerySchema>
export type MapsLinkQuery = z.infer<typeof mapsLinkQuerySchema>
export type AutocompleteQuery = z.infer<typeof autocompleteQuerySchema>
export type ReverseQuery = z.infer<typeof reverseQuerySchema>
export type GeocodeQuery = z.infer<typeof geocodeQuerySchema>
export type ResolveQuery = z.infer<typeof resolveQuerySchema>
