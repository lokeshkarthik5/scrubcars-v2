import { describe, expect, test } from 'bun:test'
import { strFromU8, unzipSync } from 'fflate'
import type { AdminBackupManifest, AdminBackupPage } from '@repo/core/api/admin-backup'
import { ApiError } from '@repo/core/api/client'
import {
  BackupStopped,
  backupFileName,
  backupProgress,
  buildBackupZip,
  csvLines,
  csvStart,
  formatBytes,
  groupCount,
  lastBackupLine,
  readMeText,
  spreadsheetsLine,
  withRetries,
} from './garage-backup'

const manifest: Pick<AdminBackupManifest, 'groups'> = {
  groups: [
    {
      key: 'garages',
      label: 'Garages and their details',
      short: 'Garages',
      tables: [
        {
          key: 'garages',
          file: 'garages.csv',
          about: 'One row per garage.',
          rows: 3,
          columns: [
            { header: 'Garage ID', about: 'The id.' },
            { header: 'Garage', about: 'The name.' },
            { header: 'Phone', about: 'The phone.' },
          ],
        },
      ],
    },
    {
      key: 'bookings',
      label: 'Bookings',
      short: 'Bookings',
      tables: [
        {
          key: 'bookings',
          file: 'bookings.csv',
          about: 'One row per booking.',
          rows: 1,
          columns: [
            { header: 'Garage ID', about: 'The id.' },
            { header: 'Total (₹)', about: 'What was paid.' },
          ],
        },
        {
          key: 'booking_items',
          file: 'booking-items.csv',
          about: 'One row per item.',
          rows: 0,
          columns: [{ header: 'Garage ID', about: 'The id.' }],
        },
      ],
    },
  ],
}

/** Pages of two rows, as the API would hand them out (already masked). */
const pages: Record<string, AdminBackupPage[]> = {
  garages: [
    {
      rows: [
        ['g1', 'Murugan Motors, Kilpauk', '90•••••851'],
        ['g2', '=HYPERLINK("http://evil")', null],
      ],
      nextCursor: 'c2',
    },
    { rows: [['g3', 'Shine Auto Spa – Anna Nagar', '98•••••210']], nextCursor: null },
  ],
  bookings: [{ rows: [['g1', '-1499.00']], nextCursor: null }],
  booking_items: [{ rows: [], nextCursor: null }],
}

function fakeApi() {
  const calls: Array<[string, string | null]> = []
  return {
    calls,
    fetchPage: async (table: string, cursor: string | null) => {
      calls.push([table, cursor])
      return pages[table][cursor === null ? 0 : 1]
    },
  }
}

describe('the words', () => {
  test('the last backup under the button, in Chennai time', () => {
    const now = new Date('2026-11-18T05:00:00Z')
    expect(lastBackupLine({ at: '2026-11-14T15:42:00Z', by: 'Mathew', full: false }, now)).toBe(
      'Last backup: 14 Nov, 9:12 pm by Mathew'
    )
    expect(lastBackupLine({ at: '2025-11-14T15:42:00Z', by: 'admin', full: true }, now)).toBe(
      'Last backup: 14 Nov 2025, 9:12 pm by admin'
    )
  })

  test('the file is named for the day in Chennai', () => {
    expect(backupFileName(new Date('2026-11-18T05:11:00Z'))).toBe('detlio-backup-2026-11-18.zip')
    // 11:30 pm on the 17th in UTC is already the 18th in Chennai.
    expect(backupFileName(new Date('2026-11-17T23:30:00Z'))).toBe('detlio-backup-2026-11-18.zip')
  })

  test('sizes and counts', () => {
    expect(formatBytes(4.2 * 1024 * 1024)).toBe('4.2 MB')
    expect(formatBytes(820 * 1024)).toBe('820 KB')
    expect(formatBytes(10)).toBe('1 KB')
    expect(groupCount(manifest.groups[1])).toBe('1')
    expect(groupCount({ ...manifest.groups[1], key: 'garage_book', tables: [1, 2, 3, 4].map(() => manifest.groups[1].tables[0]) })).toBe('4 sheets')
    expect(spreadsheetsLine(manifest)).toBe('3 spreadsheets + Read me')
  })
})

describe('the spreadsheets', () => {
  test('a header with the byte-order mark, then rows; formulas defused, commas quoted, numbers kept', () => {
    expect(csvStart(['Garage ID', 'Garage'])).toBe('\uFEFFGarage ID,Garage\r\n')
    expect(csvLines(pages.garages[0].rows)).toBe(
      'g1,"Murugan Motors, Kilpauk",90•••••851\r\n' + `g2,"'=HYPERLINK(""http://evil"")",\r\n`
    )
    expect(csvLines([['g1', '-1499.00', 3]])).toBe('g1,-1499.00,3\r\n')
  })

  test('the Read me names every file, its rows and every column, and whether numbers are hidden', () => {
    const text = readMeText({
      manifest,
      full: false,
      at: '2026-11-18T05:11:00Z',
      by: 'Mathew',
      written: { 'garages.csv': 3, 'bookings.csv': 1, 'booking-items.csv': 0 },
    })
    expect(text).toContain('Made 18 Nov 2026, 10:41 am (India time) by Mathew.')
    expect(text).toContain('hidden, shown like 98•••••210')
    expect(text).toContain('garages.csv (3 rows)')
    expect(text).toContain('bookings.csv (1 row)')
    expect(text).toContain('  Total (₹): What was paid.')
    expect(readMeText({ manifest, full: true, at: '2026-11-18T05:11:00Z', by: 'Mathew', written: {} })).toContain(
      'included in full'
    )
  })
})

describe('progress', () => {
  test('waiting, then each line ticking off; never 100% until done', () => {
    const none = backupProgress(manifest, {}, new Set(), 0)
    expect(none.groups.map((g) => g.status)).toEqual(['waiting', 'waiting'])
    expect(none.line).toBe('garages 0%')

    const mid = backupProgress(manifest, { garages: 3, bookings: 1 }, new Set(['garages']), 30_000)
    expect(mid.groups).toEqual([
      { key: 'garages', status: 'done', percent: 100 },
      { key: 'bookings', status: 'active', percent: 50 },
    ])
    expect(mid.line).toBe('garages done, bookings 50%')
    expect(mid.percent).toBe(80)
    expect(mid.eta).toBe('about 1 min')

    // More rows than were counted: still 99% until the sheet is finished.
    expect(backupProgress(manifest, { garages: 9 }, new Set(), 1000).groups[0].percent).toBe(99)

    const all = backupProgress(manifest, {}, new Set(['garages', 'bookings', 'booking_items']), 60_000)
    expect([all.percent, all.line, all.eta]).toEqual([100, 'bookings done', ''])
  })
})

describe('building the .zip', () => {
  test('every spreadsheet page by page, then the Read me; the rows exactly as the API gave them', async () => {
    const api = fakeApi()
    const seen: number[] = []
    const result = await buildBackupZip({
      manifest,
      full: false,
      at: '2026-11-18T05:11:00Z',
      by: 'Mathew',
      fetchPage: api.fetchPage,
      onProgress: (p) => seen.push(p.percent),
    })
    expect(api.calls).toEqual([
      ['garages', null],
      ['garages', 'c2'],
      ['bookings', null],
      ['booking_items', null],
    ])
    expect(result.files).toEqual(['garages.csv', 'bookings.csv', 'booking-items.csv', 'read-me.txt'])
    expect(result.written).toEqual({ 'garages.csv': 3, 'bookings.csv': 1, 'booking-items.csv': 0 })
    expect(seen.at(-1)).toBe(100)

    const blob = new Blob(result.chunks as BlobPart[])
    expect(blob.size).toBe(result.bytes)
    const files = unzipSync(new Uint8Array(await blob.arrayBuffer()))
    expect(Object.keys(files)).toEqual(result.files)
    // UTF-8's byte-order mark first, for Excel (the decoder drops it).
    expect([...files['garages.csv'].slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf])
    expect(strFromU8(files['garages.csv'])).toBe(
      'Garage ID,Garage,Phone\r\n' +
        'g1,"Murugan Motors, Kilpauk",90•••••851\r\n' +
        `g2,"'=HYPERLINK(""http://evil"")",\r\n` +
        'g3,Shine Auto Spa – Anna Nagar,98•••••210\r\n'
    )
    expect(strFromU8(files['booking-items.csv'])).toBe('Garage ID\r\n')
    expect(strFromU8(files['read-me.txt'])).toContain('garages.csv (3 rows)')
  })

  test('Stop ends it between pages', async () => {
    const api = fakeApi()
    let stop = false
    const run = buildBackupZip({
      manifest,
      full: false,
      at: '2026-11-18T05:11:00Z',
      by: 'Mathew',
      fetchPage: async (table, cursor) => {
        stop = true
        return api.fetchPage(table, cursor)
      },
      shouldStop: () => stop,
    })
    await expect(run).rejects.toBeInstanceOf(BackupStopped)
    expect(api.calls).toHaveLength(1)
  })

  test('a refusal stops it with the server’s reason', async () => {
    const run = buildBackupZip({
      manifest,
      full: true,
      at: '2026-11-18T05:11:00Z',
      by: 'Mathew',
      fetchPage: async () => {
        throw new ApiError(403, 'This backup was started without full numbers.', 'BACKUP_NOT_FULL')
      },
    })
    await expect(run).rejects.toMatchObject({ code: 'BACKUP_NOT_FULL' })
  })
})

describe('asking again', () => {
  test('a 429 waits as long as the server says; a 5xx a little longer each time', async () => {
    const waits: number[] = []
    let n = 0
    const value = await withRetries(
      async () => {
        n++
        if (n === 1) throw new ApiError(429, 'Too many requests', 'RATE_LIMIT_EXCEEDED', 7)
        if (n === 2) throw new ApiError(504, 'The server took too long to answer', 'READ_TIMEOUT')
        if (n === 3) throw new TypeError('Failed to fetch')
        return 'page'
      },
      { wait: async (ms) => void waits.push(ms) }
    )
    expect(value).toBe('page')
    expect(waits).toEqual([7000, 4000, 6000])
  })

  test('gives up after a few tries, and never retries a refusal', async () => {
    const waits: number[] = []
    await expect(
      withRetries(async () => {
        throw new ApiError(500, 'Internal server error')
      }, { wait: async (ms) => void waits.push(ms) })
    ).rejects.toMatchObject({ status: 500 })
    expect(waits).toHaveLength(3)

    let tries = 0
    await expect(
      withRetries(async () => {
        tries++
        throw new ApiError(410, 'This backup took too long.', 'BACKUP_EXPIRED')
      })
    ).rejects.toMatchObject({ code: 'BACKUP_EXPIRED' })
    expect(tries).toBe(1)
  })
})
