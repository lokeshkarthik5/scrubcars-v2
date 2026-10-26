/**
 * The area a garage is in, for collection lists and their Telegram post
 * ("Adyar", not "Chennai"): Chennai's well-known neighbourhoods at their
 * approximate centres, and the one a garage's pin is near.
 *
 * Twin: packages/core/src/localities.ts, which the admin panel's Garages
 * list names areas with; the server does not depend on @repo/core.
 * localities.parity.test.ts keeps the two the same, so a garage is in the
 * same area on screen and in the collector's message.
 */
import { straightLineKm } from './service-city.js'

export const CHENNAI_LOCALITIES: ReadonlyArray<{
  name: string
  lat: number
  lng: number
}> = [
  { name: 'Adyar', lat: 13.0067, lng: 80.257 },
  { name: 'Alwarpet', lat: 13.0336, lng: 80.255 },
  { name: 'Ambattur', lat: 13.1143, lng: 80.1548 },
  { name: 'Anna Nagar', lat: 13.085, lng: 80.2101 },
  { name: 'Ashok Nagar', lat: 13.035, lng: 80.212 },
  { name: 'Besant Nagar', lat: 13.0002, lng: 80.2668 },
  { name: 'Chromepet', lat: 12.9516, lng: 80.1462 },
  { name: 'Egmore', lat: 13.0732, lng: 80.2609 },
  { name: 'George Town', lat: 13.09, lng: 80.287 },
  { name: 'Guindy', lat: 13.0067, lng: 80.2206 },
  { name: 'K.K. Nagar', lat: 13.039, lng: 80.199 },
  { name: 'Kilpauk', lat: 13.0827, lng: 80.242 },
  { name: 'Kodambakkam', lat: 13.0521, lng: 80.2255 },
  { name: 'Kolathur', lat: 13.124, lng: 80.211 },
  { name: 'Kotturpuram', lat: 13.017, lng: 80.241 },
  { name: 'Madipakkam', lat: 12.962, lng: 80.198 },
  { name: 'Medavakkam', lat: 12.92, lng: 80.192 },
  { name: 'Mogappair', lat: 13.0837, lng: 80.1748 },
  { name: 'Mylapore', lat: 13.0368, lng: 80.2676 },
  { name: 'Nanganallur', lat: 12.98, lng: 80.19 },
  { name: 'Navalur', lat: 12.8459, lng: 80.2265 },
  { name: 'Nungambakkam', lat: 13.0569, lng: 80.2425 },
  { name: 'Pallavaram', lat: 12.9675, lng: 80.1491 },
  { name: 'Pallikaranai', lat: 12.937, lng: 80.214 },
  { name: 'Perambur', lat: 13.121, lng: 80.233 },
  { name: 'Perungudi', lat: 12.9653, lng: 80.2461 },
  { name: 'Porur', lat: 13.0382, lng: 80.1564 },
  { name: 'Royapettah', lat: 13.054, lng: 80.264 },
  { name: 'Royapuram', lat: 13.1137, lng: 80.2954 },
  { name: 'Saidapet', lat: 13.0213, lng: 80.2231 },
  { name: 'Sholinganallur', lat: 12.901, lng: 80.2279 },
  { name: 'T. Nagar', lat: 13.0418, lng: 80.2341 },
  { name: 'Tambaram', lat: 12.9249, lng: 80.1 },
  { name: 'Teynampet', lat: 13.044, lng: 80.251 },
  { name: 'Thiruvanmiyur', lat: 12.983, lng: 80.2594 },
  { name: 'Thoraipakkam', lat: 12.9416, lng: 80.2362 },
  { name: 'Triplicane', lat: 13.0588, lng: 80.2756 },
  { name: 'Vadapalani', lat: 13.05, lng: 80.2121 },
  { name: 'Valasaravakkam', lat: 13.04, lng: 80.172 },
  { name: 'Velachery', lat: 12.9815, lng: 80.218 },
  { name: 'Washermanpet', lat: 13.114, lng: 80.287 },
]

/** Past this, a pin is not "near" any listed area. */
const NEAR_KM = 2.5

/** The listed area within NEAR_KM of a pin, nearest first; null with none. */
export function nearLocality(lat: number, lng: number): string | null {
  let best: { name: string; km: number } | null = null
  for (const place of CHENNAI_LOCALITIES) {
    const km = straightLineKm({ lat, lng }, { lat: place.lat, lng: place.lng })
    if (!best || km < best.km) best = { name: place.name, km }
  }
  return best && best.km <= NEAR_KM ? best.name : null
}

/**
 * The area a garage is in: the listed neighbourhood its pin is near, else
 * its city. Outside the service city, or with no pin, it is the city.
 */
export function garageAreaName(v: {
  city: string
  lat: number | null
  lng: number | null
  /** Any set value (lib/service-city.ts's OutsideServiceCity) means outside. */
  outsideServiceCity?: object | boolean | null
}): string {
  if (v.lat !== null && v.lng !== null && !v.outsideServiceCity) {
    const near = nearLocality(v.lat, v.lng)
    if (near) return near
  }
  return v.city
}
