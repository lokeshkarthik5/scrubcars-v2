/**
 * 0082's seed: the ready-made services that lived in the code until 0082
 * (packages/core/src/service-templates.ts, SERVICE_TEMPLATES) moved into the
 * service_templates table. The seed is now the only copy; this holds it to
 * that list as it was, field for field and in its order, and to the rules
 * every template description keeps (the same as an AI-written one, and the
 * ones the template save enforces).
 *
 * Reads the migration file itself (no database): the VALUES list is parsed
 * as SQL string and number literals, with || joining strings.
 */
import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { bannedPhraseIn } from '../lib/copy-rules.js'
import { descriptionProblem } from '../lib/service-description.js'
import { templateDescriptionProblem, templateNameProblem } from '../lib/service-templates.js'

/**
 * SERVICE_TEMPLATES as it stood when 0082 moved it into the database
 * (commit 25e69456 "Service categories: General service, Repairs and Dent &
 * paint in core"). A record, never read by the app: change the table, not
 * this.
 */
const CONSTANT_AT_0082 = [
  {
    key: 'foam-wash',
    name: 'Foam wash',
    category: 'car_wash',
    durationMins: 45,
    pricingType: 'per_vehicle',
    description:
      'Snow-foam pre-wash to lift road dirt, then a hand wash, wheels and tyres cleaned, and a microfibre dry. Exterior only.',
  },
  {
    key: 'body-wash',
    name: 'Body wash',
    category: 'car_wash',
    durationMins: 30,
    pricingType: 'per_vehicle',
    description:
      'Exterior rinse and shampoo wash, wheels and tyres cleaned, glass wiped and the body hand-dried. Interior not included.',
  },
  {
    key: 'full-wash',
    name: 'Full wash',
    category: 'car_wash',
    durationMins: 60,
    pricingType: 'per_vehicle',
    description:
      'Foam wash outside plus an interior clean: seats, mats and boot vacuumed, dashboard and door panels wiped, and glass cleaned inside and out.',
  },
  {
    key: 'interior-cleaning',
    name: 'Interior cleaning',
    category: 'car_wash',
    durationMins: 90,
    pricingType: 'per_vehicle',
    description:
      'Deep vacuum of seats, carpets, mats and boot, with the dashboard, console and door trims cleaned. Stain removal is not included.',
  },
  {
    key: 'ceramic-coating',
    name: 'Ceramic coating',
    category: 'coating',
    durationMins: 1440,
    pricingType: 'per_vehicle',
    description:
      'Paint washed, decontaminated and machine-polished, then a ceramic coating applied panel by panel and left to cure.',
  },
  {
    key: 'polishing',
    name: 'Polishing',
    category: 'detailing',
    durationMins: 180,
    pricingType: 'per_vehicle',
    description:
      'Machine polishing of the paint to reduce light swirl marks and dullness, finished with a coat of wax. Deep scratches may need more work.',
  },
  {
    key: 'engine-bay-cleaning',
    name: 'Engine bay cleaning',
    category: 'detailing',
    durationMins: 45,
    pricingType: 'flat',
    description:
      'Electrical parts covered, then the engine bay degreased and cleaned with low-pressure water, and the plastic and rubber parts dressed.',
  },
  {
    key: 'underbody-wash',
    name: 'Underbody wash',
    category: 'car_wash',
    durationMins: 30,
    pricingType: 'flat',
    description:
      'The underside of the car rinsed with high-pressure water to clear mud, sand and road grime from the chassis and wheel arches.',
  },
  {
    key: 'headlight-restoration',
    name: 'Headlight restoration',
    category: 'detailing',
    durationMins: 60,
    pricingType: 'flat',
    description:
      'Yellowed, hazy headlight lenses sanded, polished and sealed, so the lights look clearer.',
  },
  {
    key: 'bike-wash',
    name: 'Bike wash',
    category: 'others',
    durationMins: 30,
    pricingType: 'flat',
    description:
      'Two-wheeler foam wash with the body, wheels and chain area cleaned, then dried. The engine and electrics are not pressure-washed.',
  },
  {
    key: 'general-service',
    name: 'General service',
    category: 'general_service',
    durationMins: 180,
    pricingType: 'per_vehicle',
    description:
      'Engine oil and filter changed, fluids topped up, and the brakes, battery, tyres and lights checked.',
  },
  {
    key: 'oil-change',
    name: 'Oil change',
    category: 'general_service',
    durationMins: 45,
    pricingType: 'per_vehicle',
    description:
      'Engine oil drained and refilled with the grade your car needs, and a new oil filter fitted.',
  },
  {
    key: 'wheel-alignment-balancing',
    name: 'Wheel alignment & balancing',
    category: 'general_service',
    durationMins: 45,
    pricingType: 'flat',
    description:
      'Wheel angles set on an alignment machine and each wheel balanced, so the car runs straight with less vibration.',
  },
  {
    key: 'brake-pads',
    name: 'Brake pads',
    category: 'repairs',
    durationMins: 60,
    pricingType: 'per_vehicle',
    description:
      'Worn front brake pads removed and new ones fitted, the discs and callipers checked, and the brakes tested before handover.',
  },
  {
    key: 'ac-service',
    name: 'AC service',
    category: 'repairs',
    durationMins: 90,
    pricingType: 'per_vehicle',
    description:
      'AC gas checked and topped up, the cabin filter cleaned, and the cooling tested.',
  },
  {
    key: 'clutch-repair',
    name: 'Clutch repair',
    category: 'repairs',
    durationMins: 1440,
    pricingType: 'on_inspection',
    description:
      'The clutch inspected first, then the worn parts repaired or replaced as quoted, and the clutch tested on the road.',
  },
  {
    key: 'dent-repair',
    name: 'Dent repair',
    category: 'dent_paint',
    durationMins: 120,
    pricingType: 'on_inspection',
    description:
      'Dents pulled or beaten out and the panel smoothed. The work is quoted after the garage sees the car.',
  },
  {
    key: 'panel-painting',
    name: 'Panel painting',
    category: 'dent_paint',
    durationMins: 1440,
    pricingType: 'per_vehicle',
    description:
      'One panel sanded, primed and painted to match the car, then clear-coated and polished.',
  },
] as const

type SeedRow = {
  key: string
  name: string
  category: string
  durationMins: number
  pricingType: string
  description: string
  position: number
}

/** The seed's VALUES rows, in the file's order. */
function seedRows(): SeedRow[] {
  const sql = readFileSync(join(import.meta.dir, '../../drizzle/0082_service_templates.sql'), 'utf8')
  const start = sql.indexOf('FROM (VALUES')
  const end = sql.indexOf(') AS v(')
  expect(start).toBeGreaterThan(-1)
  expect(end).toBeGreaterThan(start)
  const body = sql.slice(start + 'FROM (VALUES'.length, end)

  // Tokens: a string literal ('' is a quote), a whole number, ||, ( ) and ,.
  const tokens: Array<string | number> = []
  const pattern = /\s*(?:'((?:[^']|'')*)'|(\d+)|(\|\|)|([(),]))/y
  while (body.slice(pattern.lastIndex).trim() !== '') {
    const at = pattern.lastIndex
    const match = pattern.exec(body)
    if (!match) throw new Error(`Unreadable seed at: ${body.slice(at, at + 40)}`)
    if (match[1] !== undefined) tokens.push(`'${match[1].replace(/''/g, "'")}`)
    else if (match[2] !== undefined) tokens.push(Number(match[2]))
    else tokens.push(match[3] ?? match[4]!)
  }

  const rows: SeedRow[] = []
  let values: Array<string | number> = []
  let joining = false
  for (const token of tokens) {
    if (token === '(') values = []
    else if (token === '||') joining = true
    else if (token === ')') {
      const [key, name, category, durationMins, pricingType, description, position] = values
      rows.push({
        key: key as string,
        name: name as string,
        category: category as string,
        durationMins: durationMins as number,
        pricingType: pricingType as string,
        description: description as string,
        position: position as number,
      })
    } else if (token === ',') continue
    else if (typeof token === 'string') {
      const text = token.slice(1)
      if (joining) values[values.length - 1] = `${values[values.length - 1]}${text}`
      else values.push(text)
      joining = false
    } else values.push(token)
  }
  return rows
}

describe('0082 seeds the templates the code had', () => {
  const rows = seedRows()

  test('every one, field for field, in the same order', () => {
    expect(rows.map(({ position: _position, ...row }) => row)).toEqual(CONSTANT_AT_0082.map((t) => ({ ...t })))
    expect(rows.map((row) => row.position)).toEqual(rows.map((_, i) => i + 1))
  })

  test('keys and names are each used once, and none is a package', () => {
    expect(new Set(rows.map((row) => row.key)).size).toBe(rows.length)
    expect(new Set(rows.map((row) => row.name.toLowerCase())).size).toBe(rows.length)
    for (const row of rows) {
      expect(row.category).not.toBe('package')
      expect(row.durationMins).toBeGreaterThan(0)
    }
  })

  test('every description passes the rules an AI one and a template save keep', () => {
    for (const row of rows) {
      expect({ name: row.name, problem: descriptionProblem(row.description, false) }).toEqual({ name: row.name, problem: null })
      expect({ name: row.name, problem: templateDescriptionProblem(row.description) }).toEqual({ name: row.name, problem: null })
      expect({ name: row.name, problem: templateNameProblem(row.name) }).toEqual({ name: row.name, problem: null })
      expect(bannedPhraseIn(row.description)).toBeNull()
      // Prices are the garage's own; nothing tells a customer to ask the garage.
      expect(row.description).not.toMatch(/₹|\brs\b|rupee/i)
      expect(row.description).not.toMatch(/\bask\b|\bcontact\b|\bcall\b/i)
    }
  })
})
