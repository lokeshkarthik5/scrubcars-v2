import { describe, expect, test } from 'bun:test'
import { buildXlsx, crc32, safeText, zipStored } from './xlsx.js'

describe('the Excel writer', () => {
  test('crc32 matches the zip standard', () => {
    expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xcbf43926)
  })

  test('a zip lists every file, with the end record pointing at the directory', () => {
    const zip = zipStored([
      ['a.txt', new TextEncoder().encode('hello')],
      ['b/c.txt', new TextEncoder().encode('world')],
    ])
    const view = new DataView(zip.buffer)
    expect(view.getUint32(0, true)).toBe(0x04034b50)
    const end = zip.length - 22
    expect(view.getUint32(end, true)).toBe(0x06054b50)
    expect(view.getUint16(end + 10, true)).toBe(2)
    const directoryAt = view.getUint32(end + 16, true)
    expect(view.getUint32(directoryAt, true)).toBe(0x02014b50)
  })

  test('a workbook holds a sheet per tab, text escaped, formulas kept as text', () => {
    const bytes = buildXlsx([
      { name: 'Customers', header: ['Name', 'Owes'], rows: [['A & B <Co>', 12.5], ['=SUM(A1)', null]] },
      { name: 'Jobs', header: ['Date'], rows: [] },
    ])
    const text = new TextDecoder().decode(bytes)
    expect(text).toContain('xl/worksheets/sheet1.xml')
    expect(text).toContain('xl/worksheets/sheet2.xml')
    expect(text).toContain('<sheet name="Customers"')
    expect(text).toContain('A &amp; B &lt;Co&gt;')
    expect(text).toContain('<v>12.5</v>')
    expect(text).toContain("'=SUM(A1)")
    expect(safeText('+91 98400')).toBe("'+91 98400")
    expect(safeText('Suresh')).toBe('Suresh')
  })
})
