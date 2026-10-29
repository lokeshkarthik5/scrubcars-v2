import { describe, expect, test } from 'bun:test'
import { parsePastedLeads } from './lead-paste.js'
import { LEAD_PASTE_MAX } from './leads.js'

describe('parsePastedLeads', () => {
  test('"name, phone" lines in the ways people write them', () => {
    const { lines, tooMany } = parsePastedLeads(
      [
        'Speed Wash, 98400 12345',
        'Car Spa Studio\t+91 97900 60193',
        '9443011820, Sri Murugan Auto Works',
        'Glossy Doorstep - 044-2345 6789',
        'Wheel Point | 9884012345',
        'Raja Car Care 9876543210',
      ].join('\n')
    )
    expect(tooMany).toBe(false)
    expect(
      lines.map(({ name, phone, problem }) => [name, phone, problem])
    ).toEqual([
      ['Speed Wash', '9840012345', null],
      ['Car Spa Studio', '9790060193', null],
      ['Sri Murugan Auto Works', '9443011820', null],
      ['Glossy Doorstep', '4423456789', null],
      ['Wheel Point', '9884012345', null],
      ['Raja Car Care', '9876543210', null],
    ])
  })

  test('a name with commas keeps them; a line with no phone is kept', () => {
    const { lines } = parsePastedLeads(
      'Speed Wash, Anna Nagar, 9840012345\nNo Phone Garage'
    )
    expect(lines[0]).toMatchObject({
      name: 'Speed Wash, Anna Nagar',
      phone: '9840012345',
      problem: null,
    })
    expect(lines[1]).toMatchObject({
      name: 'No Phone Garage',
      phone: null,
      problem: null,
    })
  })

  test('blank lines and a header row are skipped; line numbers are the pasted ones', () => {
    const { lines } = parsePastedLeads(
      'Name, Phone\n\n  \nSpeed Wash, 9840012345\n'
    )
    expect(lines).toEqual([
      { line: 4, name: 'Speed Wash', phone: '9840012345', problem: null },
    ])
  })

  test('problems: no name, a number that is no phone, a name too long, a line repeated', () => {
    const { lines } = parsePastedLeads(
      [
        '9840012345',
        'Odd Garage, 1234567890123456789',
        `${'x'.repeat(121)}, 9840000001`,
        'Speed Wash, 9840012345',
        'speed wash, 98400 12345',
      ].join('\n')
    )
    expect(lines.map((line) => line.problem)).toEqual([
      'no_name',
      'bad_phone',
      'name_too_long',
      null,
      'repeated',
    ])
  })

  test(`at most ${LEAD_PASTE_MAX} lines, and it says when there were more`, () => {
    const text = Array.from(
      { length: LEAD_PASTE_MAX + 5 },
      (_, i) => `Garage ${i}, 98400${String(i).padStart(5, '0')}`
    ).join('\n')
    const { lines, tooMany } = parsePastedLeads(text)
    expect(lines).toHaveLength(LEAD_PASTE_MAX)
    expect(tooMany).toBe(true)
  })
})
