/**
 * A small Excel (.xlsx) reader: the first sheet of a workbook as rows of
 * text, for Garage Book's "Bring in your book" (an Excel or Tally export of
 * the garage's customers). No library, like lib/xlsx.ts writes them: an
 * .xlsx is a zip of XML files, read here with the zip's own directory and
 * Node's inflate.
 *
 * Only what a customer list needs: text (shared, inline or formula
 * results), numbers as Excel stored them (a date stays its serial number;
 * the caller reads it). Formulas never run: only their saved value is read.
 * Sizes are capped so a "zip bomb" can't fill the server's memory.
 */
import { inflateRawSync } from 'node:zlib'

/** Rows read at most, and each XML part's unpacked size at most. */
const MAX_ROWS = 2000
const MAX_PART_BYTES = 20 * 1024 * 1024

interface ZipEntry {
  name: string
  method: number
  compressedSize: number
  size: number
  offset: number
}

function entries(zip: Uint8Array): ZipEntry[] {
  const view = new DataView(zip.buffer, zip.byteOffset, zip.byteLength)
  // The end-of-central-directory record is in the last 64 KB (after a comment, at most).
  let end = -1
  for (let i = zip.length - 22; i >= Math.max(0, zip.length - 65_557); i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      end = i
      break
    }
  }
  if (end < 0) throw new Error('not a zip')
  const count = view.getUint16(end + 10, true)
  let at = view.getUint32(end + 16, true)
  const out: ZipEntry[] = []
  for (let n = 0; n < count; n++) {
    if (at + 46 > zip.length || view.getUint32(at, true) !== 0x02014b50) throw new Error('broken zip')
    const method = view.getUint16(at + 10, true)
    const compressedSize = view.getUint32(at + 20, true)
    const size = view.getUint32(at + 24, true)
    const nameLength = view.getUint16(at + 28, true)
    const extraLength = view.getUint16(at + 30, true)
    const commentLength = view.getUint16(at + 32, true)
    const offset = view.getUint32(at + 42, true)
    const name = new TextDecoder().decode(zip.subarray(at + 46, at + 46 + nameLength))
    out.push({ name, method, compressedSize, size, offset })
    at += 46 + nameLength + extraLength + commentLength
  }
  return out
}

function unpack(zip: Uint8Array, entry: ZipEntry): string {
  const view = new DataView(zip.buffer, zip.byteOffset, zip.byteLength)
  if (view.getUint32(entry.offset, true) !== 0x04034b50) throw new Error('broken zip')
  const start = entry.offset + 30 + view.getUint16(entry.offset + 26, true) + view.getUint16(entry.offset + 28, true)
  const data = zip.subarray(start, start + entry.compressedSize)
  if (entry.size > MAX_PART_BYTES) throw new Error('part too big')
  let bytes: Uint8Array
  if (entry.method === 0) bytes = data
  else if (entry.method === 8) bytes = inflateRawSync(data, { maxOutputLength: MAX_PART_BYTES })
  else throw new Error('unsupported zip method')
  return new TextDecoder().decode(bytes)
}

function unescapeXml(text: string): string {
  return text
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec: string) => String.fromCodePoint(Number(dec)))
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
}

/** The text of every <t> inside a piece of XML, joined (rich text comes in runs). */
function textOf(xml: string): string {
  let out = ''
  for (const match of xml.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)) out += match[1]
  return unescapeXml(out)
}

function columnIndex(ref: string): number {
  const letters = ref.match(/^[A-Z]+/i)?.[0]?.toUpperCase() ?? ''
  let index = 0
  for (const letter of letters) index = index * 26 + (letter.charCodeAt(0) - 64)
  return index - 1
}

/** Whether the bytes are a zip (an .xlsx is one). */
export function looksLikeXlsx(bytes: Uint8Array): boolean {
  return bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04
}

/**
 * The first sheet's rows, each a list of cell texts (empty cells as ''),
 * blank rows left out. Throws on a file that isn't a readable .xlsx.
 */
export function readXlsxRows(bytes: Uint8Array): string[][] {
  const list = entries(bytes)
  const find = (name: string) => list.find((entry) => entry.name === name)
  const shared: string[] = []
  const sharedEntry = find('xl/sharedStrings.xml')
  if (sharedEntry) {
    for (const match of unpack(bytes, sharedEntry).matchAll(/<si>([\s\S]*?)<\/si>/g)) shared.push(textOf(match[1]!))
  }
  // The first sheet in the workbook's own order, through its relationship;
  // failing that, the lowest-numbered sheet file.
  let sheetPath: string | undefined
  const workbook = find('xl/workbook.xml')
  const rels = find('xl/_rels/workbook.xml.rels')
  if (workbook && rels) {
    const firstId = unpack(bytes, workbook).match(/<sheet\b[^>]*\br:id="([^"]+)"/)?.[1]
    const target = firstId
      ? unpack(bytes, rels).match(new RegExp(`<Relationship\\b[^>]*\\bId="${firstId}"[^>]*\\bTarget="([^"]+)"`))?.[1] ??
        unpack(bytes, rels).match(new RegExp(`<Relationship\\b[^>]*\\bTarget="([^"]+)"[^>]*\\bId="${firstId}"`))?.[1]
      : undefined
    if (target) sheetPath = target.startsWith('/') ? target.slice(1) : `xl/${target.replace(/^\.\//, '')}`
  }
  const sheetEntry =
    (sheetPath ? find(sheetPath) : undefined) ??
    list
      .filter((entry) => /^xl\/worksheets\/sheet\d+\.xml$/.test(entry.name))
      .sort((a, b) => Number(a.name.match(/\d+/)![0]) - Number(b.name.match(/\d+/)![0]))[0]
  if (!sheetEntry) throw new Error('no sheet')
  const xml = unpack(bytes, sheetEntry)

  const rows: string[][] = []
  for (const rowMatch of xml.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
    const row: string[] = []
    let next = 0
    for (const cell of rowMatch[1]!.matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const attrs = cell[1] ?? ''
      const body = cell[2] ?? ''
      const ref = attrs.match(/\br="([A-Z]+\d+)"/i)?.[1]
      const index = ref ? columnIndex(ref) : next
      next = index + 1
      const type = attrs.match(/\bt="([^"]+)"/)?.[1]
      const value = body.match(/<v>([\s\S]*?)<\/v>/)?.[1]
      let text = ''
      if (type === 's') text = shared[Number(value)] ?? ''
      else if (type === 'inlineStr') text = textOf(body)
      else if (value !== undefined) text = unescapeXml(value)
      if (index >= 0 && index < 200) row[index] = text.trim()
    }
    const cells = Array.from(row, (value) => value ?? '')
    if (cells.some((value) => value !== '')) rows.push(cells)
    if (rows.length >= MAX_ROWS) break
  }
  return rows
}

/** An Excel date serial (days since 30 Dec 1899) as "YYYY-MM-DD", or null outside 1990–2100. */
export function excelSerialDate(value: number): string | null {
  if (!Number.isFinite(value) || value < 32_874 || value > 73_051) return null
  const date = new Date(Date.UTC(1899, 11, 30) + Math.floor(value) * 86_400_000)
  return date.toISOString().slice(0, 10)
}
