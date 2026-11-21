import { signedBody } from './admin-signer'
import { apiClient } from './client'

/**
 * Back up all garages (owner-approved screens, 18 Nov 2026): the owner's
 * "Download backup" on the Garages page. The API lists the spreadsheets and
 * hands out their rows a page at a time; the panel builds the .zip
 * (apps/admin/lib/garage-backup.ts). Owner only: anyone else is 403
 * ADMIN_OWNER_ONLY. Phones and bank numbers come masked unless the download
 * was started with full numbers.
 */

/** "Last backup: 14 Nov, 9:12 pm by Mathew". */
export interface AdminBackupLast {
  /** ISO time. */
  at: string
  by: string
  full: boolean
}

export interface AdminBackupTable {
  key: string
  /** Its name inside the .zip ("bookings.csv"). */
  file: string
  /** One line for the Read me. */
  about: string
  rows: number
  columns: Array<{ header: string; about: string }>
}

/** One line of the sheet ("Bookings"), with the spreadsheets behind it. */
export interface AdminBackupGroup {
  key: string
  label: string
  /** For the progress line: "Garage Book". */
  short: string
  tables: AdminBackupTable[]
}

export interface AdminBackupManifest {
  pageSize: number
  totals: { garages: number; bookings: number; garageBookBills: number }
  groups: AdminBackupGroup[]
  lastBackup: AdminBackupLast | null
}

export type AdminBackupCell = string | number | null

export interface AdminBackupPage {
  rows: AdminBackupCell[][]
  nextCursor: string | null
}

/** GET /admin/backup/last */
export function getAdminBackupLast() {
  return apiClient<{ lastBackup: AdminBackupLast | null }>('/admin/backup/last')
}

/** GET /admin/backup — what the sheet lists. */
export function getAdminBackupManifest() {
  return apiClient<AdminBackupManifest>('/admin/backup')
}

/** POST /admin/backup/started — records this download; its id opens the pages. */
export function startAdminBackup(full: boolean) {
  return apiClient<AdminBackupLast & { backupId: string }>('/admin/backup/started', {
    method: 'POST',
    body: signedBody({ full }),
  })
}

/**
 * GET /admin/backup/:table — one page of one spreadsheet. A read, so the
 * client's own timeout gives up on a stuck one (a 504 the backup retries).
 */
export function getAdminBackupPage(table: string, input: { backupId: string; cursor: string | null; full: boolean }) {
  return apiClient<AdminBackupPage>(`/admin/backup/${encodeURIComponent(table)}`, {
    params: {
      backup: input.backupId,
      cursor: input.cursor ?? undefined,
      full: input.full ? '1' : '0',
    },
  })
}
