import { describe, expect, test } from 'bun:test'
import {
  CARD_POINTS,
  SHEET_POINTS,
  cardPointsLine,
  parseServiceDescription,
  sheetPoints,
} from './service-points'

describe('parseServiceDescription', () => {
  test('an intro line, then "- " points', () => {
    expect(
      parseServiceDescription(
        'Complete bike cleaning to remove dust.\n- Body foam wash\n- Wheels and rims\n- Chain area wipe-down'
      )
    ).toEqual({
      intro: 'Complete bike cleaning to remove dust.',
      points: ['Body foam wash', 'Wheels and rims', 'Chain area wipe-down'],
      note: null,
    })
  })

  test('no bullets: the whole text is the intro, untouched but trimmed', () => {
    const text =
      'A full exterior foam wash.\nDried by hand,\n\nthen tyres dressed.'
    expect(parseServiceDescription(`  ${text}\n`)).toEqual({
      intro: text,
      points: [],
      note: null,
    })
  })

  test('nothing to read', () => {
    const empty = { intro: null, points: [], note: null }
    expect(parseServiceDescription(null)).toEqual(empty)
    expect(parseServiceDescription(undefined)).toEqual(empty)
    expect(parseServiceDescription('')).toEqual(empty)
    expect(parseServiceDescription('  \n \n')).toEqual(empty)
  })

  test('only points: no intro', () => {
    expect(parseServiceDescription('- Foam wash\n- Vacuum')).toEqual({
      intro: null,
      points: ['Foam wash', 'Vacuum'],
      note: null,
    })
  })

  test('every marker: -, •, *, dashes, 1. and 1)', () => {
    expect(
      parseServiceDescription(
        '- One\n• Two\n* Three\n– Four\n— Five\n1. Six\n2) Seven\n10. Eight\n-Nine'
      ).points
    ).toEqual([
      'One',
      'Two',
      'Three',
      'Four',
      'Five',
      'Six',
      'Seven',
      'Eight',
      'Nine',
    ])
  })

  test('"1.5 hours" is words, not a point', () => {
    expect(parseServiceDescription('1.5 hours of polishing').points).toEqual([])
  })

  test('CRLF and old Mac line ends', () => {
    expect(parseServiceDescription('Intro\r\n- A\r\n- B\r- C')).toEqual({
      intro: 'Intro',
      points: ['A', 'B', 'C'],
      note: null,
    })
  })

  test('points and intro are trimmed; blank lines between points are fine', () => {
    expect(
      parseServiceDescription(
        '   Intro here   \n\n  -   Foam wash   \n\n\n-  Vacuum '
      )
    ).toEqual({
      intro: 'Intro here',
      points: ['Foam wash', 'Vacuum'],
      note: null,
    })
  })

  test('an empty or punctuation-only point is dropped', () => {
    expect(
      parseServiceDescription('- A\n-\n- \n---\n•  …\n- B').points
    ).toEqual(['A', 'B'])
  })

  test('an intro of several lines keeps its lines and one blank line between paragraphs', () => {
    expect(
      parseServiceDescription('\n\nFirst line\nSecond line\n\n\n\nThird\n\n- A')
        .intro
    ).toBe('First line\nSecond line\n\nThird')
  })

  test('an intro that only says "Includes:" is dropped', () => {
    expect(parseServiceDescription('Includes:\n- A').intro).toBeNull()
    expect(parseServiceDescription("What's included\n- A").intro).toBeNull()
    expect(
      parseServiceDescription('A deep clean.\nWhat is included:\n\n- A').intro
    ).toBe('A deep clean.')
    // A sentence that happens to start with the word stays.
    expect(
      parseServiceDescription('Includes a free air freshener.\n- A').intro
    ).toBe('Includes a free air freshener.')
  })

  test('an indented line straight after a point carries it on', () => {
    expect(
      parseServiceDescription(
        '- Foam wash with\n   pH-neutral shampoo\n- Vacuum'
      ).points
    ).toEqual(['Foam wash with pH-neutral shampoo', 'Vacuum'])
  })

  test('a plain line after the points is a note, never a ticked point', () => {
    expect(
      parseServiceDescription(
        'Intro\n- Foam wash\n- Vacuum\nTakes about an hour.\n\nBook a day ahead.'
      )
    ).toEqual({
      intro: 'Intro',
      points: ['Foam wash', 'Vacuum'],
      note: 'Takes about an hour.\n\nBook a day ahead.',
    })
  })

  test('a plain line between points goes to the note and the points carry on', () => {
    expect(parseServiceDescription('- A\nPlain remark\n- B')).toEqual({
      intro: null,
      points: ['A', 'B'],
      note: 'Plain remark',
    })
  })

  test('a long list keeps every point in order', () => {
    const lines = Array.from({ length: 20 }, (_, i) => `- Point ${i + 1}`)
    const { points } = parseServiceDescription(`Intro\n${lines.join('\n')}`)
    expect(points).toHaveLength(20)
    expect(points[0]).toBe('Point 1')
    expect(points[19]).toBe('Point 20')
  })
})

describe('sheetPoints', () => {
  const many = (n: number) => Array.from({ length: n }, (_, i) => `P${i + 1}`)

  test(`the first ${SHEET_POINTS}, then "+N more"`, () => {
    expect(sheetPoints(many(8), false)).toEqual({ shown: many(5), more: 3 })
    expect(sheetPoints(many(6), false)).toEqual({ shown: many(5), more: 1 })
  })

  test(`up to ${SHEET_POINTS}: every point, nothing more`, () => {
    expect(sheetPoints(many(5), false)).toEqual({ shown: many(5), more: 0 })
    expect(sheetPoints(many(2), false)).toEqual({ shown: many(2), more: 0 })
    expect(sheetPoints([], false)).toEqual({ shown: [], more: 0 })
  })

  test('expanded: every point', () => {
    expect(sheetPoints(many(12), true)).toEqual({ shown: many(12), more: 0 })
  })
})

describe('cardPointsLine', () => {
  test('no points: nothing (the card shows the description)', () => {
    expect(cardPointsLine([])).toBeNull()
  })

  test(`up to ${CARD_POINTS} short points joined with " · ", and how many more`, () => {
    expect(
      cardPointsLine(['Foam wash', 'Vacuum', 'Dashboard polish', 'Tyre shine'])
    ).toEqual({
      text: 'Foam wash · Vacuum · Dashboard polish',
      more: 1,
    })
    expect(cardPointsLine(['Foam wash', 'Vacuum'])).toEqual({
      text: 'Foam wash · Vacuum',
      more: 0,
    })
    expect(cardPointsLine(['Foam wash'])).toEqual({
      text: 'Foam wash',
      more: 0,
    })
  })

  test('fewer when long points would not fit two lines', () => {
    expect(
      cardPointsLine([
        'Deep vacuum of seats and carpets',
        'Seat shampoo',
        'Dashboard and door pads polish',
        'Odour removal',
        'Glass cleaned',
      ])
    ).toEqual({
      text: 'Deep vacuum of seats and carpets · Seat shampoo',
      more: 3,
    })
  })

  test('always the first point, however long', () => {
    const long =
      'A very long first point that on its own runs past the two lines a card has'
    expect(cardPointsLine([long, 'B'])).toEqual({ text: long, more: 1 })
  })

  test('a long list', () => {
    const points = Array.from({ length: 15 }, (_, i) => `P${i + 1}`)
    expect(cardPointsLine(points)).toEqual({ text: 'P1 · P2 · P3', more: 12 })
  })
})
