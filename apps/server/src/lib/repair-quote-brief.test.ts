import { describe, expect, test } from 'bun:test'
import {
  BRIEF_JSON_SCHEMA,
  FAKE_BRIEF_READING,
  briefFromReading,
  briefPrompt,
  cleanBox,
  parseBriefReading,
  type BriefReading,
} from './repair-quote-brief.js'

const reading = (patch: Partial<BriefReading> = {}): BriefReading => ({ ...FAKE_BRIEF_READING, ...patch })

describe('repair brief: the answer is checked', () => {
  test('the strict schema names every property it requires', () => {
    expect([...BRIEF_JSON_SCHEMA.required].sort() as string[]).toEqual(Object.keys(BRIEF_JSON_SCHEMA.properties).sort())
    expect(BRIEF_JSON_SCHEMA.additionalProperties).toBe(false)
  })

  test('JSON of the right shape parses; anything else is null', () => {
    expect(parseBriefReading(JSON.stringify(FAKE_BRIEF_READING))).toEqual(FAKE_BRIEF_READING)
    expect(parseBriefReading('')).toBeNull()
    expect(parseBriefReading('not json')).toBeNull()
    expect(parseBriefReading(JSON.stringify({ readable: true }))).toBeNull()
  })

  test('the fake reading becomes the brief the specs assert on, asking for another angle', () => {
    expect(briefFromReading(FAKE_BRIEF_READING, 2)).toEqual({
      text: 'Front bumper, left side: deep scratch with a small dent, paint damaged.',
      area: 'Front bumper, left side',
      damage: 'Scratch + small dent',
      box: { image: 0, x: 0.44, y: 0.52, w: 0.42, h: 0.3 },
      unclear: true,
      angleHint: 'A close photo from the left side helps garages quote closer.',
    })
  })

  test('nothing to show: not readable, no sentence, or words the copy rules forbid', () => {
    expect(briefFromReading(reading({ readable: false }), 1)).toBeNull()
    expect(briefFromReading(reading({ brief: '   ' }), 1)).toBeNull()
    expect(briefFromReading(reading({ brief: 'Guaranteed flawless after a repaint.' }), 1)).toBeNull()
  })

  test('long words are cut, the hint only when unclear', () => {
    const brief = briefFromReading(reading({ brief: 'a '.repeat(150), unclear: false }), 1)!
    expect(brief.text.length).toBeLessThanOrEqual(200)
    expect(brief.angleHint).toBeNull()
  })
})

describe('repair brief: the box', () => {
  test('kept inside its picture, on a picture that was sent', () => {
    expect(cleanBox({ image: 1, x: 0.8, y: 0.9, w: 0.5, h: 0.5 }, 2)).toEqual({ image: 1, x: 0.8, y: 0.9, w: 0.2, h: 0.1 })
    expect(cleanBox({ image: 2, x: 0.1, y: 0.1, w: 0.2, h: 0.2 }, 2)).toBeNull()
    expect(cleanBox({ image: -1, x: 0.1, y: 0.1, w: 0.2, h: 0.2 }, 2)).toBeNull()
    expect(cleanBox({ image: 0, x: 0.1, y: 0.1, w: 0.001, h: 0.2 }, 2)).toBeNull()
    expect(cleanBox(null, 2)).toBeNull()
  })
})

describe('repair brief: what is sent', () => {
  test('only the customer’s line, quoted as data', () => {
    const prompt = briefPrompt('  Scraped a "pillar"\nwhile parking ')
    expect(prompt).toBe(`The customer says what happened: "Scraped a 'pillar' while parking". Describe the damage you can see.`)
  })
})
