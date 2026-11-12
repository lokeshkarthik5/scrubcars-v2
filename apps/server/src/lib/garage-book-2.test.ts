/**
 * Garage Book stages 2 and 3's pure rules (0073): bill numbers, the booking
 * page's slug and times, payment QR text, the stock dial and orders,
 * monthly expenses, milestones, and reading a customer book.
 */
import { describe, expect, test } from 'bun:test'
import { cleanRow, mapHeaders, parseOwes, parseVisitDate, rowsFromReading, rowsFromTable, FAKE_BOOK_READING } from './garage-book-import.js'
import {
  billNumberText,
  isLow,
  isMilestoneKey,
  jobsLeft,
  linkTimes,
  milestoneFor,
  milestoneKeysSettled,
  nextMonth,
  openNow,
  parseJobRef,
  parseUpiUri,
  payAppsText,
  payLine,
  rupeesText,
  sameDayIn,
  slugFor,
  slugWithSuffix,
  stockAmountText,
  stockShare,
  suggestPacks,
} from './garage-book.js'
import { deflateRawSync } from 'node:zlib'
import { buildXlsx, crc32 } from './xlsx.js'
import { excelSerialDate, readXlsxRows } from './xlsx-read.js'

const ID = '0b6b5f0e-1d1a-4c43-9d5b-4a9c2f3e8a11'

describe('bills', () => {
  test('a bill number prints four digits at least, and grows past them', () => {
    expect(billNumberText(1)).toBe('0001')
    expect(billNumberText(142)).toBe('0142')
    expect(billNumberText(12345)).toBe('12345')
  })
  test('rupees as a WhatsApp writes them, Indian grouping', () => {
    expect(rupeesText(139_800)).toBe('₹1,398')
    expect(rupeesText(14_610_000)).toBe('₹1,46,100')
    expect(rupeesText(1250)).toBe('₹12.5')
  })
  test('a job ref: own, detlio, or a bare id; anything else is nothing', () => {
    expect(parseJobRef(`own:${ID}`)).toEqual({ kind: 'own', id: ID })
    expect(parseJobRef(`detlio:${ID.toUpperCase()}`)).toEqual({ kind: 'detlio', id: ID })
    expect(parseJobRef(ID)).toEqual({ kind: 'any', id: ID })
    expect(parseJobRef(`other:${ID}`)).toBeNull()
    expect(parseJobRef('own:nope')).toBeNull()
  })
})

describe('payment details', () => {
  test('a UPI QR gives its id and name; anything else is not UPI', () => {
    expect(parseUpiUri('upi://pay?pa=samplecarcare@okaxis&pn=Sample%20Car%20Care&cu=INR')).toEqual({
      upiId: 'samplecarcare@okaxis',
      upiName: 'Sample Car Care',
    })
    expect(parseUpiUri('UPI://pay?pa=9840000000@ybl')).toEqual({ upiId: '9840000000@ybl', upiName: null })
    expect(parseUpiUri('https://example.com/pay')).toBe('not_upi')
    expect(parseUpiUri('upi://pay?pn=NoPayee')).toBe('not_upi')
    expect(parseUpiUri('BEGIN:VCARD')).toBe('not_upi')
  })
  test('the pay line names the ticked apps in a fixed order, with the phone spaced', () => {
    expect(payAppsText(['phonepe', 'gpay'])).toBe('GPay/PhonePe')
    expect(payLine({ phone: '9840000000', apps: ['gpay'] })).toBe('Pay on GPay 98400 00000')
    expect(payLine({ phone: '9840000000', apps: [] })).toBe('Pay by UPI on 98400 00000')
    expect(payLine({ phone: null, apps: ['gpay'] })).toBeNull()
  })
})

describe('the booking link', () => {
  test('the slug comes from the garage’s name, and a clash gets a number', () => {
    expect(slugFor('Sample Car Care')).toBe('sample-car-care')
    expect(slugFor('  S.K.T. Car Wash & Polish!! ')).toBe('s-k-t-car-wash-and-polish')
    expect(slugFor('Ö')).toBe('garage')
    expect(slugFor('x'.repeat(80))).toHaveLength(50)
    expect(slugWithSuffix('sample-car-care', 1)).toBe('sample-car-care')
    expect(slugWithSuffix('sample-car-care', 2)).toBe('sample-car-care-2')
  })

  // Thursday 12 Nov 2026, 10:12 in Chennai. Open 9:00–20:00 every day but Sunday.
  const now = new Date('2026-11-12T10:12:00+05:30')
  const hours = [1, 2, 3, 4, 5, 6].map((dayOfWeek) => ({ dayOfWeek, openTime: '09:00:00', closeTime: '20:00:00', isClosed: false }))
  const ist = (iso: string) => new Date(iso).toLocaleTimeString('en-GB', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit' })

  test('times: from opening every 90 minutes, today only from an hour from now, never on a closed day', () => {
    const days = linkTimes(hours, new Set(['2026-11-13']), now)
    expect(days.map((day) => day.date)).toEqual(['2026-11-12', '2026-11-14', '2026-11-16'])
    expect(days[0]!.times.map(ist)).toEqual(['12:00', '13:30', '15:00', '16:30', '18:00'])
    expect(days[1]!.times.map(ist)).toEqual(['09:00', '10:30', '12:00', '13:30', '15:00', '16:30', '18:00'])
  })

  test('open now reads today’s hours and closed days', () => {
    expect(openNow(hours, new Set(), now)).toBe(true)
    expect(openNow(hours, new Set(['2026-11-12']), now)).toBe(false)
    expect(openNow(hours, new Set(), new Date('2026-11-15T11:00:00+05:30'))).toBe(false)
    expect(openNow(hours, new Set(), new Date('2026-11-12T20:30:00+05:30'))).toBe(false)
  })
})

describe('stock', () => {
  test('the dial reads the level against one pack; low is at or under the mark', () => {
    expect(stockShare(600, 5000, 1000)).toBe(0.12)
    expect(stockShare(9000, 5000, 1000)).toBe(1)
    expect(stockShare(500, null, 250)).toBe(0.5)
    expect(isLow(600, 1000)).toBe(true)
    expect(isLow(600, 0)).toBe(false)
  })
  test('about N jobs left, and the packs to order', () => {
    expect(jobsLeft(600, 100)).toBe(6)
    expect(jobsLeft(600, null)).toBeNull()
    expect(suggestPacks(600, 1000, 5000)).toBe(1)
    expect(suggestPacks(0, 6000, 5000)).toBe(3)
    expect(suggestPacks(5, 10, null)).toBe(1)
  })
  test('amounts as the screens write them', () => {
    expect(stockAmountText(600, 'ml')).toBe('600 ml')
    expect(stockAmountText(5000, 'ml')).toBe('5 L')
    expect(stockAmountText(1250, 'g')).toBe('1.25 kg')
    expect(stockAmountText(2, 'l')).toBe('2 L')
    expect(stockAmountText(10, 'pcs')).toBe('10 pcs')
  })
})

describe('monthly expenses', () => {
  test('a copy keeps its day, inside the month', () => {
    expect(nextMonth('2026-12')).toBe('2027-01')
    expect(sameDayIn('2027-02', '2027-01-31')).toBe('2027-02-28')
    expect(sameDayIn('2026-12', '2026-11-05')).toBe('2026-12-05')
  })
})

describe('milestones', () => {
  const months = (list: Array<[string, number]>) => list.map(([month, rupees]) => ({ month, paise: rupees * 100 }))

  test('the 100th customer first, then a lakh month, then a best month; each once', () => {
    const base = { months: months([['2026-09', 40_000], ['2026-10', 60_000], ['2026-11', 1_10_000]]), currentMonth: '2026-11' }
    expect(milestoneFor({ ...base, ownCustomers: 104, seen: new Set() })).toMatchObject({
      key: 'customers_100',
      kind: 'customers',
      value: 100,
      next: { kind: 'customers', value: 250 },
    })
    expect(milestoneFor({ ...base, ownCustomers: 104, seen: new Set(['customers_100']) })).toMatchObject({
      key: 'lakh_month_1',
      month: '2026-11',
      next: { kind: 'lakh_month', value: 2 },
    })
    expect(milestoneFor({ ...base, ownCustomers: 104, seen: new Set(['customers_100', 'lakh_month_1']) })).toMatchObject({
      key: 'best_month_2026-11',
      takenPaise: 11_000_000,
      previousBestPaise: 6_000_000,
    })
    expect(milestoneFor({ ...base, ownCustomers: 104, seen: new Set(['customers_100', 'lakh_month_1', 'best_month_2026-11']) })).toBeNull()
  })

  test('a best month needs two earlier months to beat', () => {
    expect(milestoneFor({ ownCustomers: 3, months: months([['2026-10', 9_000], ['2026-11', 12_000]]), currentMonth: '2026-11', seen: new Set() })).toBeNull()
  })

  test('seeing a big one settles the smaller ones; only real keys can be marked', () => {
    expect(milestoneKeysSettled('customers_500')).toEqual(['customers_100', 'customers_250', 'customers_500'])
    expect(milestoneKeysSettled('best_month_2026-11')).toEqual(['best_month_2026-11'])
    expect(isMilestoneKey('lakh_month_2')).toBe(true)
    expect(isMilestoneKey('lakh_month_3')).toBe(false)
    expect(isMilestoneKey('anything')).toBe(false)
  })
})

describe('bringing in a book', () => {
  const today = '2026-11-12'

  test('dates as Indian books write them, never guessed', () => {
    expect(parseVisitDate('12/10/2026', today)).toBe('2026-10-12')
    expect(parseVisitDate('3-11-26', today)).toBe('2026-11-03')
    expect(parseVisitDate('2026-10-12', today)).toBe('2026-10-12')
    expect(parseVisitDate('3 Nov', today)).toBe('2026-11-03')
    // A day later in the year than today is last year's.
    expect(parseVisitDate('20 Dec', today)).toBe('2025-12-20')
    expect(parseVisitDate('46300', today)).toBe('2026-10-05')
    expect(parseVisitDate('31/02/2026', today)).toBeNull()
    expect(parseVisitDate('last week', today)).toBeNull()
  })

  test('amounts owed', () => {
    expect(parseOwes('₹6,400')).toBe(640_000)
    expect(parseOwes('Rs. 1,200.50')).toBe(120_050)
    expect(parseOwes('500/-')).toBe(50_000)
    expect(parseOwes('some')).toBeNull()
  })

  test('a smudged phone stays out and is marked, with what was written', () => {
    const row = cleanRow({ name: 'Ramesh', phone: '98?40 1123?', plate: 'tn22ck1180', owes: 'lots' }, today)
    expect(row).toMatchObject({ name: 'Ramesh', phone: null, plate: 'TN 22 CK 1180', owesPaise: null, unsure: ['phone', 'owes'] })
    expect(row.note).toContain('Phone not clear: 98?40 1123?')
    expect(cleanRow({ name: 'Suresh', phone: '+91 98400 12345' }, today)).toMatchObject({ phone: '9840012345', unsure: [] })
  })

  test('a sheet’s columns are found by their names, a title line above them is fine', () => {
    expect(mapHeaders(['Customer Name', 'Mobile', 'Vehicle No', 'Model', 'Last Visit', 'Balance'])).toEqual([
      'name',
      'phone',
      'plate',
      'car',
      'lastVisit',
      'owes',
    ])
    const rows = rowsFromTable(
      [
        ['Sample Car Care customers'],
        ['Name', 'Phone', 'Reg No', 'Car', 'Due'],
        ['Suresh Kumar', '98400 12345', 'TN09AB4521', 'Creta', ''],
        ['', '', '', '', ''],
        ['Meena Transports', '9444055667', 'TN 07 BX 2210', 'Innova', '6400'],
      ],
      today
    )
    expect(rows).toHaveLength(2)
    expect(rows![1]).toMatchObject({ name: 'Meena Transports', phone: '9444055667', owesPaise: 640_000 })
    expect(rowsFromTable([['a', 'b'], ['c', 'd']], today)).toBeNull()
  })

  test('the AI’s reading becomes the same rows (the test fake)', () => {
    const rows = rowsFromReading(FAKE_BOOK_READING, today)
    expect(rows.map((row) => row.unsure)).toEqual([[], ['phone'], []])
    expect(rows[2]).toMatchObject({ lastVisit: '2026-11-03', owesPaise: 640_000 })
  })

  test('an .xlsx is read back: its first sheet, as text', () => {
    const bytes = buildXlsx([
      { name: 'Customers', header: ['Name', 'Phone', 'Plate'], rows: [['Suresh & Co', '98400 12345', 'TN 09 AB 4521'], ['Ravi', 9840099999, null]] },
      { name: 'Other', header: ['Ignored'], rows: [['x']] },
    ])
    expect(readXlsxRows(bytes)).toEqual([
      ['Name', 'Phone', 'Plate'],
      ['Suresh & Co', '98400 12345', 'TN 09 AB 4521'],
      ['Ravi', '9840099999'],
    ])
    expect(excelSerialDate(46300)).toBe('2026-10-05')
    expect(() => readXlsxRows(new TextEncoder().encode('not a zip'))).toThrow()
  })
})

/** A zip the way Excel writes one: deflated entries. */
function deflatedZip(entries: Array<[string, string]>): Uint8Array {
  const parts: Buffer[] = []
  const central: Buffer[] = []
  let offset = 0
  for (const [name, text] of entries) {
    const data = Buffer.from(text)
    const packed = deflateRawSync(data)
    const nameBytes = Buffer.from(name)
    const local = Buffer.alloc(30)
    local.writeUInt32LE(0x04034b50, 0)
    local.writeUInt16LE(20, 4)
    local.writeUInt16LE(8, 8)
    local.writeUInt32LE(crc32(data), 14)
    local.writeUInt32LE(packed.length, 18)
    local.writeUInt32LE(data.length, 22)
    local.writeUInt16LE(nameBytes.length, 26)
    parts.push(local, nameBytes, packed)
    const entry = Buffer.alloc(46)
    entry.writeUInt32LE(0x02014b50, 0)
    entry.writeUInt16LE(20, 4)
    entry.writeUInt16LE(20, 6)
    entry.writeUInt16LE(8, 10)
    entry.writeUInt32LE(crc32(data), 16)
    entry.writeUInt32LE(packed.length, 20)
    entry.writeUInt32LE(data.length, 24)
    entry.writeUInt16LE(nameBytes.length, 28)
    entry.writeUInt32LE(offset, 42)
    central.push(entry, nameBytes)
    offset += 30 + nameBytes.length + packed.length
  }
  const dir = Buffer.concat(central)
  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50, 0)
  end.writeUInt16LE(entries.length, 8)
  end.writeUInt16LE(entries.length, 10)
  end.writeUInt32LE(dir.length, 12)
  end.writeUInt32LE(offset, 16)
  return new Uint8Array(Buffer.concat([...parts, dir, end]))
}

test('an Excel-made .xlsx (deflated, shared strings, a gap in the row) reads the same', () => {
  const bytes = deflatedZip([
    ['xl/workbook.xml', '<workbook><sheets><sheet name="Book" sheetId="1" r:id="rId1"/></sheets></workbook>'],
    ['xl/_rels/workbook.xml.rels', '<Relationships><Relationship Id="rId1" Type="x" Target="worksheets/sheet1.xml"/></Relationships>'],
    ['xl/sharedStrings.xml', '<sst><si><t>Name</t></si><si><t>Phone</t></si><si><r><t>Meena </t></r><r><t>Transports</t></r></si></sst>'],
    [
      'xl/worksheets/sheet1.xml',
      '<worksheet><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="C1" t="s"><v>1</v></c></row>' +
        '<row r="2"><c r="A2" t="s"><v>2</v></c><c r="C2"><v>9444055667</v></c></row></sheetData></worksheet>',
    ],
  ])
  expect(readXlsxRows(bytes)).toEqual([
    ['Name', '', 'Phone'],
    ['Meena Transports', '', '9444055667'],
  ])
})
