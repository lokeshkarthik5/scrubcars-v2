import { z } from 'zod'
import { signedActorName } from '../../lib/admin-actor.js'
import { BACKUP_TABLE_KEYS, type BackupTableKey } from '../../lib/garage-backup.js'

/** Any row id as Postgres prints a uuid (fixture ids are not all RFC-shaped). */
const rowId = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)

/** POST /admin/backup/started: whether this download includes full numbers. */
export const startBackupSchema = z
  .object({
    actorName: signedActorName,
    full: z.boolean(),
  })
  .strict()

export const backupTableParamSchema = z.object({
  table: z.enum(BACKUP_TABLE_KEYS as [BackupTableKey, ...BackupTableKey[]]),
})

/**
 * GET /admin/backup/:table?backup=&cursor=&full=0|1. `backup` is the id
 * POST /backup/started gave: no page is read without its download recorded.
 */
export const backupPageQuerySchema = z
  .object({
    backup: rowId,
    cursor: rowId.optional(),
    full: z.enum(['0', '1']).default('0'),
  })
  .strict()

export type StartBackupInput = z.infer<typeof startBackupSchema>
export type BackupPageQuery = z.infer<typeof backupPageQuerySchema>
