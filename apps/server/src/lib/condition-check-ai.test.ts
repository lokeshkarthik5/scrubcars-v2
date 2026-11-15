import { describe, expect, test } from 'bun:test'
import {
  COMPARE_INSTRUCTIONS,
  COMPARE_PROMPT,
  FAKE_CONDITION_COMPARE,
  FAKE_CONDITION_READING,
  MARKS_JSON_SCHEMA,
  READ_INSTRUCTIONS,
  READ_PROMPT,
  parseMarks,
} from './condition-check-ai.js'
import { MAX_MARKS_PER_PHOTO } from './condition-check.js'

describe("Detlio's answer, as marks", () => {
  test('a good answer, cleaned', () => {
    const marks = parseMarks(
      JSON.stringify({
        marks: [
          { kind: 'dent', part: 'Rear Bumper', box: { x: 0.6, y: 0.5, w: 0.2, h: 0.1 }, sure: true },
          { kind: 'scratch', part: 'door near TN09AB1234', box: { x: 0.1, y: 0.1, w: 0, h: 0 }, sure: false },
        ],
      })
    )
    expect(marks).toEqual([
      { kind: 'dent', part: 'rear bumper', box: { x: 0.6, y: 0.5, w: 0.2, h: 0.1 }, unsure: false },
      // No digits survive, and a box too small to circle is dropped.
      { kind: 'scratch', part: 'door near tn ab', box: null, unsure: true },
    ])
  })

  test('sure marks first, at most the cap, and none with no words left', () => {
    const many = Array.from({ length: 12 }, (_, i) => ({
      kind: 'scratch',
      part: i === 0 ? '1234' : `panel ${'abcdefghijkl'[i]}`,
      box: { x: 0.1, y: 0.1, w: 0.1, h: 0.1 },
      sure: i % 2 === 0,
    }))
    const marks = parseMarks(JSON.stringify({ marks: many }))!
    expect(marks).toHaveLength(MAX_MARKS_PER_PHOTO)
    expect(marks.slice(0, 5).every((m) => !m.unsure)).toBe(true)
    expect(marks.some((m) => m.part === '')).toBe(false)
  })

  test('an empty list is an answer; anything else is not', () => {
    expect(parseMarks('{"marks":[]}')).toEqual([])
    expect(parseMarks('')).toBeNull()
    expect(parseMarks('not json')).toBeNull()
    expect(parseMarks('{"marks":[{"kind":"smudge","part":"x","box":{"x":0,"y":0,"w":1,"h":1},"sure":true}]}')).toBeNull()
    expect(parseMarks('{"other":1}')).toBeNull()
  })

  test('the fakes parse, and say what the E2E specs assert', () => {
    expect(parseMarks(JSON.stringify(FAKE_CONDITION_READING))?.[0]).toMatchObject({ kind: 'scratch', part: 'rear left door' })
    expect(parseMarks(JSON.stringify(FAKE_CONDITION_COMPARE))?.[0]).toMatchObject({ kind: 'dent', part: 'rear bumper' })
  })
})

describe('what is sent', () => {
  test('fixed words only: no placeholders for a name, phone, plate or booking', () => {
    for (const text of [READ_INSTRUCTIONS, COMPARE_INSTRUCTIONS, READ_PROMPT, COMPARE_PROMPT]) {
      expect(text).not.toMatch(/\$\{|\{\w+\}/)
    }
    expect(READ_INSTRUCTIONS).toContain('Never write a number plate')
    expect(COMPARE_INSTRUCTIONS).toContain('Never write a number plate')
  })

  test('the schema is strict: every property required, nothing else', () => {
    const item = MARKS_JSON_SCHEMA.properties.marks.items
    expect(MARKS_JSON_SCHEMA.additionalProperties).toBe(false)
    expect(item.additionalProperties).toBe(false)
    expect([...item.required].sort()).toEqual(Object.keys(item.properties).sort())
  })
})
