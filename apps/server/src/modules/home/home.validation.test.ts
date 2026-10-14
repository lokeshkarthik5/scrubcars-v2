import { describe, expect, test } from 'bun:test'
import { homeQuerySchema } from './home.validation.js'

describe("Home's location", () => {
  test('a pair of numbers is a location', () => {
    expect(homeQuerySchema.parse({ lat: '13.08', lng: '80.27' })).toEqual({ lat: 13.08, lng: 80.27 })
  })

  test('empty parameters are no location, not the point (0, 0)', () => {
    expect(homeQuerySchema.parse({ lat: '', lng: '' })).toEqual({})
    expect(homeQuerySchema.parse({ lat: ' ', lng: ' ' })).toEqual({})
    expect(homeQuerySchema.parse({})).toEqual({})
  })

  test('half a location, or one off the globe, is refused', () => {
    expect(homeQuerySchema.safeParse({ lat: '13.08' }).success).toBe(false)
    expect(homeQuerySchema.safeParse({ lat: '13.08', lng: '' }).success).toBe(false)
    expect(homeQuerySchema.safeParse({ lat: '999', lng: '80' }).success).toBe(false)
    expect(homeQuerySchema.safeParse({ lat: 'abc', lng: '80' }).success).toBe(false)
  })
})
