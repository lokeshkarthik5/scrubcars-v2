import { AppError } from '../../lib/errors.js'
import {
  BACKUP_GROUPS,
  BACKUP_PAGE_SIZE,
  BACKUP_TABLES,
  backupPageRefusal,
  backupRows,
  backupTable,
  nextCursor,
  type BackupAudit,
  type BackupTableKey,
} from '../../lib/garage-backup.js'
import { garageBackupRepository } from './garage-backup.repository.js'

/** "Last backup: 14 Nov, 9:12 pm by Mathew": the panel words the time. */
function lastLine(audit: BackupAudit | null) {
  return audit ? { at: audit.createdAt.toISOString(), by: audit.actorName, full: audit.full } : null
}

const REFUSALS = {
  BACKUP_NOT_STARTED: [403, 'Start the backup again from the Garages page.'],
  BACKUP_EXPIRED: [410, 'This backup took too long. Start it again from the Garages page.'],
  BACKUP_NOT_FULL: [403, 'This backup was started without full numbers.'],
} as const

/**
 * Back up all garages (owner only; the routes check). The panel reads the
 * manifest, records the download, then pages through each sheet and builds
 * the .zip itself. One database read at a time throughout.
 */
export const garageBackupService = {
  async last() {
    return { lastBackup: lastLine(await garageBackupRepository.lastBackup()) }
  },

  /** What the sheet lists: each spreadsheet with its row count, by line. */
  async manifest() {
    const counts = await garageBackupRepository.counts()
    const lastBackup = lastLine(await garageBackupRepository.lastBackup())
    return {
      pageSize: BACKUP_PAGE_SIZE,
      totals: {
        garages: counts.garages,
        bookings: counts.bookings,
        garageBookBills: counts.garage_book_bills,
      },
      groups: BACKUP_GROUPS.map((group) => ({
        key: group.key,
        label: group.label,
        short: group.short,
        tables: BACKUP_TABLES.filter((table) => table.group === group.key).map((table) => ({
          key: table.key,
          file: table.file,
          about: table.about,
          rows: counts[table.key],
          columns: table.columns.map((column) => ({ header: column.header, about: column.about })),
        })),
      })),
      lastBackup,
    }
  },

  /** The download's record, written before any of its rows are read. */
  async start(actor: { sub: string; name: string }, full: boolean) {
    const audit = await garageBackupRepository.recordBackup({ actorSub: actor.sub, actorName: actor.name, full })
    return { backupId: audit.id, ...lastLine(audit)! }
  },

  async page(
    actor: { sub: string },
    table: BackupTableKey,
    query: { backup: string; cursor?: string; full: '0' | '1' },
    now = new Date()
  ) {
    const full = query.full === '1'
    const refusal = backupPageRefusal(await garageBackupRepository.findBackup(query.backup), {
      sub: actor.sub,
      full,
      now,
    })
    if (refusal) {
      const [status, message] = REFUSALS[refusal]
      throw new AppError(status, message, refusal)
    }
    const definition = backupTable(table)!
    const rows = await garageBackupRepository.page(table, query.cursor ?? null, BACKUP_PAGE_SIZE)
    return {
      rows: backupRows(definition, rows.slice(0, BACKUP_PAGE_SIZE), full),
      nextCursor: nextCursor(rows, BACKUP_PAGE_SIZE),
    }
  },
}
