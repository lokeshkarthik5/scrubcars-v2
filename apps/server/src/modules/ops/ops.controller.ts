import type { Context } from 'hono'
import { opsService } from './ops.service.js'
import type { PendingDigestQuery } from './ops.validation.js'

export async function pendingDigest(c: Context, query: PendingDigestQuery) {
  const data = await opsService.pendingDigest({ dryRun: query.dryRun === '1' })
  return c.json({ success: true, data })
}
