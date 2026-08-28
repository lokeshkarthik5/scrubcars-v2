import { apiClient } from './client'

/**
 * Vendor doorstep coverage area.
 *
 * A ring of [lng, lat] pairs (GeoJSON order), closed — first point repeated as
 * the last. Null means the vendor has not drawn one, in which case their
 * `doorstepRadiusKm` circle applies instead.
 */
export type CoverageRing = Array<[number, number]>

export interface DoorstepArea {
  ring: CoverageRing | null
  doorstepRadiusKm?: number | null
}

/** GET /vendors/me/doorstep-area */
export async function getDoorstepArea(): Promise<DoorstepArea> {
  return apiClient<DoorstepArea>('/vendors/me/doorstep-area')
}

/** PUT /vendors/me/doorstep-area — pass null to clear and fall back to the radius. */
export async function setDoorstepArea(
  ring: CoverageRing | null
): Promise<DoorstepArea> {
  return apiClient<DoorstepArea>('/vendors/me/doorstep-area', {
    method: 'PUT',
    body: JSON.stringify({ ring }),
  })
}

/** Closes a ring by repeating its first point, which the server requires. */
export function closeRing(ring: CoverageRing): CoverageRing {
  if (ring.length === 0) return ring
  const [first] = ring
  const last = ring[ring.length - 1]
  if (first[0] === last[0] && first[1] === last[1]) return ring
  return [...ring, first]
}
