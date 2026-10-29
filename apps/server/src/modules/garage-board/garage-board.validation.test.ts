import { describe, expect, test } from 'bun:test'
import { setColourNamesSchema, setColourTagsSchema, setGarageTargetSchema } from './garage-board.validation.js'

const ID = '00000000-0000-4000-8000-000000000001'

describe('colour tags', () => {
  test('a colour, or none, on up to 500 garages; a day only with Call back', () => {
    expect(setColourTagsSchema.safeParse({ vendorIds: [ID], tag: 'green' }).success).toBe(true)
    expect(setColourTagsSchema.safeParse({ vendorIds: [ID], tag: null }).success).toBe(true)
    expect(setColourTagsSchema.safeParse({ vendorIds: [ID], tag: 'blue', callOn: '2026-10-30' }).success).toBe(true)
    expect(setColourTagsSchema.safeParse({ vendorIds: [ID], tag: 'red', callOn: '2026-10-30' }).success).toBe(false)
    expect(setColourTagsSchema.safeParse({ vendorIds: [ID], tag: 'blue', callOn: '30 Oct' }).success).toBe(false)
    expect(setColourTagsSchema.safeParse({ vendorIds: [ID], tag: 'pink' }).success).toBe(false)
    expect(setColourTagsSchema.safeParse({ vendorIds: [], tag: 'green' }).success).toBe(false)
    expect(setColourTagsSchema.safeParse({ vendorIds: Array(501).fill(ID), tag: 'green' }).success).toBe(false)
    expect(setColourTagsSchema.safeParse({ vendorIds: [ID], tag: 'green', extra: 1 }).success).toBe(false)
  })
})

describe('the target and the names', () => {
  test('a whole number from 1, an optional real day, and what counts', () => {
    expect(setGarageTargetSchema.safeParse({ target: 50, endsOn: null, counts: 'live' }).success).toBe(true)
    expect(setGarageTargetSchema.safeParse({ target: 50, endsOn: '2026-12-31', counts: 'onboarded' }).success).toBe(true)
    expect(setGarageTargetSchema.safeParse({ target: 0, endsOn: null, counts: 'live' }).success).toBe(false)
    expect(setGarageTargetSchema.safeParse({ target: 2.5, endsOn: null, counts: 'live' }).success).toBe(false)
    expect(setGarageTargetSchema.safeParse({ target: 50, endsOn: '2026-02-30', counts: 'live' }).success).toBe(false)
    expect(setGarageTargetSchema.safeParse({ target: 50, endsOn: null, counts: 'all' }).success).toBe(false)
  })

  test('every colour named, at most 30 characters', () => {
    const names = { green: 'Verified on call', amber: 'A few', red: 'Needs', blue: 'Call back' }
    expect(setColourNamesSchema.safeParse(names).success).toBe(true)
    expect(setColourNamesSchema.safeParse({ ...names, red: '  ' }).success).toBe(false)
    expect(setColourNamesSchema.safeParse({ ...names, blue: 'x'.repeat(31) }).success).toBe(false)
  })
})
