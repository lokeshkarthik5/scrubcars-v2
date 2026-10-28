import type { Context } from 'hono'
import { reachService } from './reach.service.js'

/**
 * `GET /zones`: Chennai's zones for the landing page's area chips, public and
 * the same for everyone, so caches may keep it for five minutes.
 */
export async function listZones(c: Context) {
  const zones = await reachService.listZones()
  c.header('Cache-Control', 'public, max-age=300, s-maxage=300')
  return c.json({ success: true, data: { zones } })
}
