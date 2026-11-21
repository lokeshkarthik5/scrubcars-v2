import { describe, expect, test } from 'bun:test'
import { csvCell, toCsv } from './csv'

describe('CSV cells', () => {
  test('anything a spreadsheet would run as a formula is defused', () => {
    for (const text of ['=HYPERLINK("http://x","y")', '+91 98400', '-2+3', '@SUM(A1)', '\tcmd', '\rcmd', '-cmd|calc']) {
      expect(csvCell(text).replace(/^"/, '')).toStartWith("'")
    }
  })

  test('a plain negative number stays a number', () => {
    expect(csvCell('-50')).toBe('-50')
    expect(csvCell('-1499.00')).toBe('-1499.00')
    expect(csvCell(-12.5)).toBe('-12.5')
    expect(csvCell('-1e5')).toBe("'-1e5")
  })

  test('quoted when it holds a comma, quote or line break', () => {
    expect(csvCell('Anna Nagar, Chennai')).toBe('"Anna Nagar, Chennai"')
    expect(csvCell('the "big" wash')).toBe('"the ""big"" wash"')
    expect(csvCell('line\none')).toBe('"line\none"')
    expect(csvCell(null)).toBe('')
    expect(csvCell(undefined)).toBe('')
  })

  test('a file: header first, CRLF line ends', () => {
    expect(toCsv(['A', 'B'], [[1, '=x'], [null, 'b']])).toBe("A,B\r\n1,'=x\r\n,b\r\n")
  })
})
