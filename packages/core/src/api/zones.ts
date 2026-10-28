import { apiClient } from './client'
import type { Zone } from '@repo/core/zones'

/** GET /zones (0062): Chennai's zones, and whether each has a live garage. Public. */
export async function getZones(): Promise<Zone[]> {
  const data = await apiClient<{ zones: Zone[] }>('/zones', { auth: false })
  return data.zones
}
