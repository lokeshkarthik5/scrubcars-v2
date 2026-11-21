import { describe, expect, test } from 'bun:test'
import {
  BACKUP_GROUPS,
  BACKUP_TABLES,
  BACKUP_WINDOW_MS,
  backupPage,
  backupPageRefusal,
  backupRows,
  backupTable,
  maskDigits,
  maskNumbersInText,
  maskUpi,
  nextCursor,
} from './garage-backup.js'

describe('masking', () => {
  test('a phone is the first two and last three digits, as the sheet shows: 98•••••210', () => {
    expect(maskDigits('9876543210', 'phone')).toBe('98•••••210')
    expect(maskDigits('+91 98765 43210', 'phone')).toBe('98•••••210')
    expect(maskDigits('919876543210', 'phone')).toBe('98•••••210')
  })

  test('a bank account keeps its own first digits, and the dots never tell its length', () => {
    expect(maskDigits('911234567890123')).toBe('91•••••123')
    expect(maskDigits('123456789')).toBe('12•••••789')
    expect(maskDigits('123456789012345678')).toBe('12•••••678')
  })

  test('too few digits to keep any is all dots', () => {
    expect(maskDigits('1234567')).toBe('•••••')
    expect(maskDigits('')).toBe('•••••')
  })

  test('a UPI ID hides its name part, which is often a phone number', () => {
    expect(maskUpi('9876543210@ybl')).toBe('98•••••@ybl')
    expect(maskUpi('ravi.kumar@okaxis')).toBe('ra•••••@okaxis')
    expect(maskUpi('ab@upi')).toBe('•••••@upi')
    expect(maskUpi('9876543210')).toBe('98•••••210')
  })

  test('free text: phones however written, and long digit runs; dates, times and prices stay', () => {
    const masked = maskNumbersInText('Call 98400 12345 or +91-98400-12345. A/c 123456789012. On 2026-11-18 10:41, ₹1,499.00.')
    expect(masked).not.toContain('12345')
    expect(masked).not.toContain('123456789012')
    expect(masked).toContain('12•••••012')
    expect(masked).toContain('2026-11-18 10:41')
    expect(masked).toContain('₹1,499.00')
  })

  test('free text: emails, UPI IDs, Aadhaar and spaced account numbers, landlines and PANs', () => {
    const masked = maskNumbersInText(
      'Mail ravi.kumar@gmail.com, pay ravikumar@okaxis or 9840012345@ybl. Aadhaar 1234 5678 9012, ' +
        'a/c 5012-3456-7890-12, shop 044 2345 6789, PAN ABCDE1234F. Bill 12 on 18-11-2026 at 10:41, ₹450.'
    )
    for (const secret of ['ravi.kumar@', 'ravikumar@', '9840012345', '5678', '3456', '2345 6789', 'ABCDE1234F', 'E1234']) {
      expect(masked).not.toContain(secret)
    }
    expect(masked).toContain('ra•••••@gmail.com')
    expect(masked).toContain('ra•••••@okaxis')
    expect(masked).toContain('12•••••012')
    expect(masked).toContain('AB•••••F')
    expect(masked).toContain('Bill 12 on 18-11-2026 at 10:41, ₹450.')
  })
})

describe('rows', () => {
  const table = {
    columns: [
      { key: 'garage_id', header: 'Garage ID', about: '' },
      { key: 'phone', header: 'Phone', about: '', mask: 'phone' as const },
      { key: 'account', header: 'Account', about: '', mask: 'account' as const },
      { key: 'upi', header: 'UPI', about: '', mask: 'upi' as const },
      { key: 'note', header: 'Note', about: '', mask: 'text' as const },
      { key: 'on', header: 'On', about: '' },
      { key: 'bays', header: 'Bays', about: '' },
    ],
  }
  const raw = {
    garage_id: 'g1',
    phone: '9000007851',
    account: '123456789012',
    upi: '9000007851@ybl',
    note: 'Owner’s other number 9000007899',
    on: true,
    bays: 3,
    // Not a column: never sent.
    password_hash: 'scrypt$secret',
  }

  test('masked by default: every phone, account, UPI ID and number in a note', () => {
    const [row] = backupRows(table, [raw], false)
    expect(row).toEqual(['g1', '90•••••851', '12•••••012', '90•••••@ybl', expect.any(String), 'Yes', 3])
    expect(String(row[4])).not.toContain('9000007899')
    expect(JSON.stringify(row)).not.toContain('scrypt')
  })

  test('full numbers when the owner asked for them for this download', () => {
    const [row] = backupRows(table, [raw], true)
    expect(row).toEqual(['g1', '9000007851', '123456789012', '9000007851@ybl', 'Owner’s other number 9000007899', 'Yes', 3])
  })

  test('in the sheet’s column order; a missing value is empty, false is No, a list is joined', () => {
    const [row] = backupRows(
      { columns: [...table.columns, { key: 'types', header: 'Types', about: '' }] },
      [{ on: false, types: ['hatchback', 'suv'], phone: null }],
      false
    )
    expect(row).toEqual([null, null, null, null, null, 'No', null, 'hatchback; suv'])
  })

  test('a page is cut before it gets too big for Vercel, and the next one starts right after it', () => {
    const wide = { columns: [{ key: 'notes', header: 'Notes', about: '' }] }
    const rows = Array.from({ length: 6 }, (_, i) => ({ notes: 'அ'.repeat(5000), cursor_id: `c${i}` }))
    // Each row is about 15 KB of JSON: 40 KB holds two.
    const first = backupPage(wide, rows, true, { limit: 5, maxBytes: 40_000 })
    expect(first.rows).toHaveLength(2)
    expect(first.nextCursor).toBe('c1')
    // Never fewer than one row, however big.
    expect(backupPage(wide, rows, true, { limit: 5, maxBytes: 10 }).rows).toHaveLength(1)
    // Within the limit and the bytes: the cursor is after the limit's last row, or none at the end.
    expect(backupPage(wide, rows, true, { limit: 5, maxBytes: 1e9 })).toMatchObject({ nextCursor: 'c4' })
    expect(backupPage(wide, rows.slice(0, 3), true, { limit: 5, maxBytes: 1e9 }).nextCursor).toBeNull()
    expect(backupPage(wide, [], true, { limit: 5 })).toEqual({ rows: [], nextCursor: null })
  })

  test('the next page starts after the last row of this one, and there is none after a short page', () => {
    const rows = [{ cursor_id: 'a' }, { cursor_id: 'b' }, { cursor_id: 'c' }]
    expect(nextCursor(rows, 2)).toBe('b')
    expect(nextCursor(rows, 3)).toBeNull()
    expect(nextCursor([], 3)).toBeNull()
  })
})

describe('the sheets', () => {
  test('every sheet starts with the garage, so any two can be joined', () => {
    for (const table of BACKUP_TABLES) {
      expect(table.columns.slice(0, 2).map((column) => column.key)).toEqual(['garage_id', 'garage_name'])
    }
  })

  test('file names and keys are unique; every column has a header and a meaning for the Read me', () => {
    expect(new Set(BACKUP_TABLES.map((t) => t.file)).size).toBe(BACKUP_TABLES.length)
    expect(new Set(BACKUP_TABLES.map((t) => t.key)).size).toBe(BACKUP_TABLES.length)
    for (const table of BACKUP_TABLES) {
      expect(table.file).toMatch(/^[a-z-]+\.csv$/)
      expect(new Set(table.columns.map((c) => c.key)).size).toBe(table.columns.length)
      for (const column of table.columns) {
        expect(column.header.length).toBeGreaterThan(0)
        expect(column.about.length).toBeGreaterThan(0)
      }
    }
  })

  test('every line of the sheet has a spreadsheet, and every spreadsheet a line; Garage Book is four', () => {
    for (const group of BACKUP_GROUPS) {
      expect(BACKUP_TABLES.some((table) => table.group === group.key)).toBe(true)
    }
    expect(BACKUP_TABLES.filter((table) => table.group === 'garage_book').map((t) => t.file)).toEqual([
      'garage-book-customers.csv',
      'garage-book-bills.csv',
      'garage-book-expenses.csv',
      'garage-book-stock.csv',
    ])
  })

  test('every phone and bank number column is masked', () => {
    for (const table of BACKUP_TABLES) {
      for (const column of table.columns as ReadonlyArray<{ key: string; mask?: string }>) {
        if (/phone|whatsapp/.test(column.key)) expect([table.key, column.key, column.mask]).toEqual([table.key, column.key, 'phone'])
        if (/account_number/.test(column.key)) expect(column.mask).toBe('account')
        if (/upi_id/.test(column.key)) expect(column.mask).toBe('upi')
        if (/address|note|reason|comment|reply/.test(column.key)) expect(column.mask).toBeDefined()
      }
    }
  })

  test('backupTable finds a sheet by key, and nothing else', () => {
    expect(backupTable('bookings')?.file).toBe('bookings.csv')
    expect(backupTable('users')).toBeNull()
  })
})

describe('a page needs its download recorded', () => {
  const now = new Date('2026-11-18T05:11:00Z')
  const audit = { id: 'b1', actorSub: 'admin:owner', actorName: 'Mathew', full: false, createdAt: new Date(now.getTime() - 60_000) }

  test('the same admin, within the window', () => {
    expect(backupPageRefusal(audit, { sub: 'admin:owner', full: false, now })).toBeNull()
  })

  test('no record, or someone else’s, is refused', () => {
    expect(backupPageRefusal(null, { sub: 'admin:owner', full: false, now })).toBe('BACKUP_NOT_STARTED')
    expect(backupPageRefusal(audit, { sub: 'admin', full: false, now })).toBe('BACKUP_NOT_STARTED')
  })

  test('an old one is refused', () => {
    const later = new Date(audit.createdAt.getTime() + BACKUP_WINDOW_MS + 1)
    expect(backupPageRefusal(audit, { sub: 'admin:owner', full: false, now: later })).toBe('BACKUP_EXPIRED')
  })

  test('full numbers only when the record says they were asked for', () => {
    expect(backupPageRefusal(audit, { sub: 'admin:owner', full: true, now })).toBe('BACKUP_NOT_FULL')
    expect(backupPageRefusal({ ...audit, full: true }, { sub: 'admin:owner', full: true, now })).toBeNull()
    // A full backup may still read masked pages.
    expect(backupPageRefusal({ ...audit, full: true }, { sub: 'admin:owner', full: false, now })).toBeNull()
  })
})
