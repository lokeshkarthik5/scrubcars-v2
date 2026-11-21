import type { Context } from 'hono'
import type { BackupTableKey } from '../../lib/garage-backup.js'
import { signedInAdmin, type AuthVariables } from '../../middleware/auth.middleware.js'
import { garageBackupService } from './garage-backup.service.js'
import type { BackupPageQuery, StartBackupInput } from './garage-backup.validation.js'

type BackupContext = Context<{ Variables: AuthVariables }>

export async function last(c: BackupContext) {
  return c.json({ success: true, data: await garageBackupService.last() })
}

export async function manifest(c: BackupContext) {
  return c.json({ success: true, data: await garageBackupService.manifest() })
}

export async function start(c: BackupContext, input: StartBackupInput) {
  const admin = signedInAdmin(c)
  const data = await garageBackupService.start({ sub: admin.sub, name: input.actorName }, input.full)
  return c.json({ success: true, data }, 201)
}

export async function page(c: BackupContext, table: BackupTableKey, query: BackupPageQuery) {
  const data = await garageBackupService.page({ sub: signedInAdmin(c).sub }, table, query)
  // Personal data: never kept by a browser or a proxy.
  c.header('Cache-Control', 'no-store')
  return c.json({ success: true, data })
}
