import { LEAD_NAME_MAX, LEAD_PASTE_MAX, normalisePhone } from './leads.js'

/**
 * "Paste a list" (0064): lines of "name, phone" from a sheet or a chat
 * become leads, previewed before anything is saved. Pure, unit-tested in
 * lead-paste.test.ts.
 *
 * A line is a name and a phone in either order, split by a comma, a tab (a
 * row copied from a sheet), " - " or " | ". The phone may be written any
 * usual way (+91 98400 12345, 044-2345 6789). A line with no phone is kept
 * (some places list none), a line with no name is a problem, and so is a
 * number that is not a phone. Blank lines are skipped; a header row
 * ("Name, Phone") is skipped too.
 */

export type PasteProblem =
  'no_name' | 'bad_phone' | 'name_too_long' | 'repeated'

export interface PastedLine {
  /** The line's number in what was pasted, from 1. */
  line: number
  name: string
  phone: string | null
  problem: PasteProblem | null
}

export const PASTE_PROBLEM_TEXT: Record<PasteProblem, string> = {
  no_name: 'No name on this line',
  bad_phone: 'That is not a phone number',
  name_too_long: `Names are ${LEAD_NAME_MAX} characters at most`,
  repeated: 'Already on a line above',
}

const HEADER =
  /^\s*(name|garage|business)\s*([,\t|-]\s*(phone|mobile|number|contact)\s*)?$/i

/** Whether a piece of a line looks like a phone number rather than a name. */
function looksLikePhone(part: string): boolean {
  const digits = part.replace(/\D+/g, '')
  return digits.length >= 6 && /^[+\d\s().-]+$/.test(part.trim())
}

function splitLine(line: string): string[] {
  for (const separator of [/\t/, /\s+\|\s+|\|/, /,/, /\s+-\s+/]) {
    const parts = line
      .split(separator)
      .map((part) => part.trim())
      .filter(Boolean)
    if (parts.length > 1) return parts
  }
  // "Speed Wash 98400 12345": a trailing number is the phone.
  const trailing = line.match(/^(.*?)[\s:]+((?:\+?\d[\d\s().-]{5,}\d))\s*$/)
  if (trailing && trailing[1].trim())
    return [trailing[1].trim(), trailing[2].trim()]
  return [line.trim()]
}

/** What a pasted list holds, line by line, with each line's problem if any. */
export function parsePastedLeads(text: string): {
  lines: PastedLine[]
  tooMany: boolean
} {
  const rawLines = text.split(/\r?\n/)
  const lines: PastedLine[] = []
  const seen = new Set<string>()
  let tooMany = false

  rawLines.forEach((raw, index) => {
    const trimmed = raw.trim()
    if (!trimmed) return
    if (lines.length === 0 && HEADER.test(trimmed)) return
    if (lines.length >= LEAD_PASTE_MAX) {
      tooMany = true
      return
    }

    const parts = splitLine(trimmed)
    const phonePart = parts.find(looksLikePhone) ?? null
    const nameParts = parts.filter(
      (part) => part !== phonePart && !looksLikePhone(part)
    )
    const name = nameParts.join(', ').replace(/\s+/g, ' ').trim()
    const phone = phonePart ? normalisePhone(phonePart) : null

    let problem: PasteProblem | null = null
    if (!name) problem = 'no_name'
    else if (name.length > LEAD_NAME_MAX) problem = 'name_too_long'
    else if (phonePart && !phone) problem = 'bad_phone'

    const key = `${name.toLowerCase()}|${phone ?? ''}`
    if (!problem && seen.has(key)) problem = 'repeated'
    if (!problem) seen.add(key)

    lines.push({ line: index + 1, name, phone, problem })
  })

  return { lines, tooMany }
}
