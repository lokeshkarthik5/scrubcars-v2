import { describe, expect, test } from 'bun:test'
import * as server from './admin-settings.js'

const coreUrl = new URL('../../../../packages/core/src/garage-target.ts', import.meta.url).href

type Shared = Pick<
  typeof server,
  | 'COLOUR_TAGS'
  | 'DEFAULT_COLOUR_NAMES'
  | 'COLOUR_NAME_MAX'
  | 'TARGET_COUNTS'
  | 'TARGET_MAX'
  | 'DEFAULT_GARAGE_TARGET'
  | 'isColourTag'
  | 'parseColourNames'
  | 'parseGarageTarget'
>

describe('garage board settings parity', () => {
  test('the panel and the server have the same colours, names, limits and parsing', async () => {
    const core = (await import(coreUrl)) as Shared
    expect([...core.COLOUR_TAGS]).toEqual([...server.COLOUR_TAGS])
    expect(core.DEFAULT_COLOUR_NAMES).toEqual(server.DEFAULT_COLOUR_NAMES)
    expect(core.COLOUR_NAME_MAX).toBe(server.COLOUR_NAME_MAX)
    expect([...core.TARGET_COUNTS]).toEqual([...server.TARGET_COUNTS])
    expect(core.TARGET_MAX).toBe(server.TARGET_MAX)
    expect(core.DEFAULT_GARAGE_TARGET).toEqual(server.DEFAULT_GARAGE_TARGET)
    for (const value of [null, {}, { green: 'G' }, { red: '  ' }, { blue: 'x'.repeat(50) }]) {
      expect(core.parseColourNames(value)).toEqual(server.parseColourNames(value))
    }
    for (const value of [null, { target: 5 }, { target: 0 }, { endsOn: '2026-12-31', counts: 'onboarded' }, { counts: 'x' }]) {
      expect(core.parseGarageTarget(value)).toEqual(server.parseGarageTarget(value))
    }
    for (const value of ['green', 'blue', 'pink', null]) expect(core.isColourTag(value)).toBe(server.isColourTag(value))
  })
})
