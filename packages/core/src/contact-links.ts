import { normaliseIndianMobile } from '@repo/core/phone'

/**
 * Links that hand a number or a place to the phone's own apps — the dialler,
 * WhatsApp, Google Maps — so a garage can reach its customer and a customer
 * can reach and find their garage without copying anything by hand.
 *
 * Each returns null when there is nothing usable to link to, so a screen
 * renders no button rather than one that opens an error.
 */

/**
 * "919876543210" for an Indian number however it was stored, or null. Ten
 * national digits covers a mobile and a landline with its STD code ("044
 * 2490 1234"), which a garage may well list as its phone.
 */
export function indianE164(phone: string | null | undefined): string | null {
  if (!phone) return null
  const digits = normaliseIndianMobile(phone)
  return /^[1-9]\d{9}$/.test(digits) ? `91${digits}` : null
}

/** An Indian mobile: ten digits starting 6-9. Landlines have no WhatsApp. */
function isMobile(e164: string): boolean {
  return /^91[6-9]\d{9}$/.test(e164)
}

export function telHref(phone: string | null | undefined): string | null {
  const number = indianE164(phone)
  return number ? `tel:+${number}` : null
}

/** A WhatsApp chat with the number, the message typed in and ready to send. */
export function whatsAppHref(
  phone: string | null | undefined,
  message?: string
): string | null {
  const number = indianE164(phone)
  // A landline would open WhatsApp's "invalid number" screen instead.
  if (!number || !isMobile(number)) return null
  return `https://wa.me/${number}${message ? `?text=${encodeURIComponent(message)}` : ''}`
}

/** The hosts a garage's own Google Maps link may be on. */
const GOOGLE_MAPS_HOSTS = new Set(['maps.app.goo.gl', 'maps.google.com', 'www.google.com', 'google.com', 'goo.gl'])

/**
 * A garage's own Google Maps link (vendors.maps_url), or null unless it is
 * one: https, on a Google Maps host, and for google.com or goo.gl under
 * /maps. The garage types it, so anything else gets no button rather than a
 * link to wherever it points.
 */
export function googleMapsLink(url: string | null | undefined): string | null {
  if (!url) return null
  let parsed: URL
  try {
    parsed = new URL(url.trim())
  } catch {
    return null
  }
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password) return null
  const host = parsed.hostname.toLowerCase()
  if (!GOOGLE_MAPS_HOSTS.has(host)) return null
  if ((host === 'www.google.com' || host === 'google.com' || host === 'goo.gl') && !parsed.pathname.startsWith('/maps')) {
    return null
  }
  return parsed.toString()
}

/**
 * Google Maps driving directions to a place: to its pin when it has one,
 * then its own Google Maps link, otherwise to its address as text, which
 * Maps geocodes for itself.
 */
export function directionsHref(place: {
  lat: number | null
  lng: number | null
  address?: string
  mapsUrl?: string
}): string | null {
  const base = 'https://www.google.com/maps/dir/?api=1&travelmode=driving&destination='
  if (place.lat !== null && place.lng !== null) {
    // Six decimals is ~10 cm. A pin stored as a float4 reads back with noise
    // digits ("13.082699775695801") that only make the link longer.
    return `${base}${place.lat.toFixed(6)},${place.lng.toFixed(6)}`
  }
  // The garage's own link points at its listing, which beats Maps guessing
  // from the address text.
  const own = googleMapsLink(place.mapsUrl)
  if (own) return own
  if (place.address?.trim()) return `${base}${encodeURIComponent(place.address.trim())}`
  return null
}
