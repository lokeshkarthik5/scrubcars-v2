import { Zip, ZipDeflate } from 'fflate'
import type {
  AdminBackupCell,
  AdminBackupGroup,
  AdminBackupLast,
  AdminBackupManifest,
  AdminBackupPage,
} from '@repo/core/api/admin-backup'
import { ApiError } from '@repo/core/api/client'
import { csvCell } from '@repo/core/csv'
import { APP_TIMEZONE } from '@repo/core/utils'

/**
 * Back up all garages (owner-approved screens, 18 Nov 2026): the .zip is
 * built here, in the browser, because the API's answers are capped near
 * 4.5 MB. Each spreadsheet is read a page at a time and deflated into the
 * .zip as it arrives, so only the compressed file is ever held whole, never
 * every row as text. The rows come already masked from the server (unless
 * the download asked for full numbers); nothing here unmasks or adds any.
 */

export const READ_ME_FILE = 'read-me.txt'

/** The byte-order mark that makes Excel read a CSV as UTF-8 (₹ and Tamil names survive). */
const BOM = '\uFEFF'

const encoder = new TextEncoder()

// ─── Words ────────────────────────────────────────────────────────────────

const WHEN = new Intl.DateTimeFormat('en-IN', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
  hour12: true,
  timeZone: APP_TIMEZONE,
})

/** "14 Nov, 9:12 pm" in Chennai time; the year only when it isn't this year's. */
export function backupWhen(iso: string, now = new Date()): string {
  const parts = WHEN.formatToParts(new Date(iso))
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value ?? ''
  const thisYear = WHEN.formatToParts(now).find((p) => p.type === 'year')?.value
  const year = part('year') === thisYear ? '' : ` ${part('year')}`
  return `${part('day')} ${part('month')}${year}, ${part('hour')}:${part('minute')} ${part('dayPeriod').toLowerCase()}`
}

/** "Last backup: 14 Nov, 9:12 pm by Mathew" under the button. */
export function lastBackupLine(last: AdminBackupLast, now = new Date()): string {
  return `Last backup: ${backupWhen(last.at, now)} by ${last.by}`
}

/** "detlio-backup-2026-11-18.zip": the day in Chennai. */
export function backupFileName(now = new Date()): string {
  return `detlio-backup-${now.toLocaleDateString('en-CA', { timeZone: APP_TIMEZONE })}.zip`
}

/** "4.2 MB", "820 KB": the file's size as a person reads it. */
export function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${Math.max(1, Math.round(bytes / 1024))} KB`
}

/** "3,402" */
export const count = (n: number) => n.toLocaleString('en-IN')

/** The count beside a line of the sheet: its main spreadsheet's rows, or "4 sheets". */
export function groupCount(group: AdminBackupGroup): string {
  if (group.key === 'garage_book') return `${group.tables.length} sheets`
  return count(group.tables[0]?.rows ?? 0)
}

/** "13 spreadsheets + Read me" */
export function spreadsheetsLine(manifest: Pick<AdminBackupManifest, 'groups'>): string {
  const n = manifest.groups.reduce((sum, group) => sum + group.tables.length, 0)
  return `${n} spreadsheet${n === 1 ? '' : 's'} + Read me`
}

// ─── The spreadsheets ─────────────────────────────────────────────────────

/** A page of rows as CSV lines (CRLF, as Excel expects); the header goes first, once. */
export function csvLines(rows: readonly AdminBackupCell[][]): string {
  return rows.map((row) => `${row.map(csvCell).join(',')}\r\n`).join('')
}

/** The start of a spreadsheet: the byte-order mark and its header row. */
export function csvStart(headers: readonly string[]): string {
  return `${BOM}${headers.map(csvCell).join(',')}\r\n`
}

/** The Read me: what each file and column means, in plain English. */
export function readMeText(input: {
  manifest: Pick<AdminBackupManifest, 'groups'>
  full: boolean
  at: string
  by: string
  /** Rows actually written per file (the counts may have moved while it ran). */
  written: Record<string, number>
}): string {
  const lines = [
    'Detlio backup: all garages',
    '==========================',
    '',
    // Always with the year: a backup is read long after it is made.
    `Made ${backupWhen(input.at, new Date(0))} (India time) by ${input.by}.`,
    input.full
      ? 'Phone numbers and bank account numbers: included in full.'
      : 'Phone numbers and bank account numbers: hidden, shown like 98•••••210.',
    '',
    "Keep this file private. It holds customers' names and bookings: keep it",
    'somewhere only you can open, like your own Google Drive, never in a shared',
    'WhatsApp group.',
    '',
    'How to read it',
    '--------------',
    '- Each .csv file is a spreadsheet. It opens in Excel or Google Sheets.',
    '- Every file starts with Garage ID and Garage, so files can be matched up',
    '  (for example with VLOOKUP or XLOOKUP on Garage ID).',
    '- Times are India time (IST), written 2026-11-18 10:41.',
    '- Money is in rupees, written 450.00.',
    '- An empty cell means nothing was recorded.',
    '- Photos and documents are links, not the files. Documents open only when',
    '  you are signed in to Detlio admin.',
    '- Excel may show a long number (a bank account number) as 1.2E+11. The file',
    '  keeps every digit: to see them, open it with Data > From Text/CSV and set',
    '  that column to Text.',
    '- A text cell that started with = + - or @ has a \' in front, so a spreadsheet',
    '  never runs it as a formula.',
    '',
    'The files',
    '---------',
  ]
  for (const group of input.manifest.groups) {
    for (const table of group.tables) {
      const rows = input.written[table.file] ?? 0
      lines.push('', `${table.file} (${count(rows)} row${rows === 1 ? '' : 's'})`, table.about, '')
      for (const column of table.columns) lines.push(`  ${column.header}: ${column.about}`)
    }
  }
  lines.push('')
  return lines.join('\r\n')
}

// ─── Progress ─────────────────────────────────────────────────────────────

export type BackupGroupState = { key: string; status: 'waiting' | 'active' | 'done'; percent: number }

export interface BackupProgress {
  groups: BackupGroupState[]
  /** 0–100 over every row. */
  percent: number
  /** "garages done, bookings 60%" */
  line: string
  /** "about 1 min", or '' until there is enough to tell. */
  eta: string
}

const shortWord = (group: Pick<AdminBackupGroup, 'short'>) =>
  group.short === 'Garage Book' ? group.short : group.short.toLowerCase()

/** The progress as the sheet shows it, from rows read so far. */
export function backupProgress(
  manifest: Pick<AdminBackupManifest, 'groups'>,
  read: Record<string, number>,
  finished: ReadonlySet<string>,
  elapsedMs: number
): BackupProgress {
  let total = 0
  let done = 0
  const groups = manifest.groups.map((group): BackupGroupState => {
    const rows = group.tables.reduce((sum, t) => sum + Math.max(1, t.rows), 0)
    const got = group.tables.reduce(
      (sum, t) => sum + (finished.has(t.key) ? Math.max(1, t.rows) : Math.min(read[t.key] ?? 0, Math.max(1, t.rows))),
      0
    )
    total += rows
    done += got
    const all = group.tables.every((t) => finished.has(t.key))
    const started = group.tables.some((t) => finished.has(t.key) || (read[t.key] ?? 0) > 0)
    return {
      key: group.key,
      status: all ? 'done' : started ? 'active' : 'waiting',
      // Never 100% until it is done: rows may have been added since the count.
      percent: all ? 100 : Math.min(99, Math.floor((got / rows) * 100)),
    }
  })
  const percent = groups.every((g) => g.status === 'done') ? 100 : Math.min(99, Math.floor((done / Math.max(1, total)) * 100))

  const lastDone = [...groups].reverse().find((g) => g.status === 'done')
  const current = groups.find((g) => g.status !== 'done')
  const label = (key: string) => shortWord(manifest.groups.find((g) => g.key === key)!)
  const bits = [
    ...(lastDone ? [`${label(lastDone.key)} done`] : []),
    ...(current ? [`${label(current.key)} ${current.percent}%`] : []),
  ]

  let eta = ''
  if (percent >= 3 && percent < 100 && elapsedMs > 2000) {
    const remainingMs = (elapsedMs / (done / total)) - elapsedMs
    const minutes = Math.max(1, Math.round(remainingMs / 60_000))
    eta = `about ${minutes} min`
  }
  return { groups, percent, line: bits.join(', '), eta }
}

// ─── Reading and zipping ──────────────────────────────────────────────────

/** The owner pressed Stop. */
export class BackupStopped extends Error {
  constructor() {
    super('Stopped')
    this.name = 'BackupStopped'
  }
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

/**
 * A page, asked again when the server is busy: a 429 waits as long as it
 * says (at most a minute), a 5xx, a timeout or a dropped connection a little
 * longer each time. Anything else (403, 410) stops the backup with its reason.
 */
export async function withRetries<T>(
  read: () => Promise<T>,
  options: { wait?: (ms: number) => Promise<void>; shouldStop?: () => boolean } = {}
): Promise<T> {
  const wait = options.wait ?? sleep
  for (let attempt = 1; ; attempt++) {
    try {
      return await read()
    } catch (error) {
      const status = error instanceof ApiError ? error.status : error instanceof TypeError ? 0 : -1
      const limited = status === 429 && attempt <= 5
      const flaky = (status === 0 || status >= 500) && attempt <= 3
      if (!limited && !flaky) throw error
      if (options.shouldStop?.()) throw new BackupStopped()
      const retryAfter = error instanceof ApiError ? error.retryAfterSeconds : undefined
      await wait(limited ? Math.min(60, retryAfter ?? 5) * 1000 : 2000 * attempt)
    }
  }
}

export interface BackupResult {
  /** The .zip, in the pieces fflate wrote: a Blob is made from them. */
  chunks: Uint8Array[]
  bytes: number
  /** Rows written, by file. */
  written: Record<string, number>
  files: string[]
}

/**
 * Reads every spreadsheet, one page at a time and one request at a time,
 * deflating each page into the .zip as it arrives; then adds the Read me.
 * `fetchPage` is the API (getAdminBackupPage); tests pass their own.
 */
export async function buildBackupZip(input: {
  manifest: Pick<AdminBackupManifest, 'groups'>
  full: boolean
  at: string
  by: string
  fetchPage: (table: string, cursor: string | null) => Promise<AdminBackupPage>
  onProgress?: (progress: BackupProgress) => void
  shouldStop?: () => boolean
  wait?: (ms: number) => Promise<void>
  now?: () => number
}): Promise<BackupResult> {
  const now = input.now ?? Date.now
  const started = now()
  const chunks: Uint8Array[] = []
  // Written by fflate's callback, which runs inside each push.
  const out = { bytes: 0, ended: false, failure: null as Error | null }
  const zip = new Zip((error, data, final) => {
    if (error) {
      out.failure = error
      return
    }
    chunks.push(data)
    out.bytes += data.length
    if (final) out.ended = true
  })

  const read: Record<string, number> = {}
  const finished = new Set<string>()
  const written: Record<string, number> = {}
  const files: string[] = []
  const report = () => input.onProgress?.(backupProgress(input.manifest, read, finished, now() - started))
  const stopIfAsked = () => {
    if (input.shouldStop?.()) {
      zip.terminate()
      throw new BackupStopped()
    }
  }

  report()
  for (const group of input.manifest.groups) {
    for (const table of group.tables) {
      stopIfAsked()
      const file = new ZipDeflate(table.file, { level: 6 })
      zip.add(file)
      file.push(encoder.encode(csvStart(table.columns.map((column) => column.header))))
      let cursor: string | null = null
      let rows = 0
      do {
        const page: AdminBackupPage = await withRetries(() => input.fetchPage(table.key, cursor), {
          wait: input.wait,
          shouldStop: input.shouldStop,
        })
        stopIfAsked()
        if (page.rows.length > 0) file.push(encoder.encode(csvLines(page.rows)))
        rows += page.rows.length
        read[table.key] = rows
        cursor = page.nextCursor
        report()
      } while (cursor)
      file.push(new Uint8Array(0), true)
      written[table.file] = rows
      files.push(table.file)
      finished.add(table.key)
      report()
    }
  }

  const readMe = new ZipDeflate(READ_ME_FILE, { level: 6 })
  zip.add(readMe)
  readMe.push(encoder.encode(readMeText({ manifest: input.manifest, full: input.full, at: input.at, by: input.by, written })), true)
  files.push(READ_ME_FILE)
  zip.end()

  if (out.failure) throw out.failure
  if (!out.ended) throw new Error('The .zip did not finish')
  return { chunks, bytes: out.bytes, written, files }
}

/**
 * Saves the .zip. The link is on the page while it is clicked and the URL
 * revoked only later, as downloadCsv does: Safari on iOS reads the blob after
 * the click returns.
 */
export function saveZip(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.hidden = true
  document.body.appendChild(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
}
