import { describe, expect, test } from 'bun:test'
import * as server from './add-ons.js'

const coreUrl = new URL(
  '../../../../packages/core/src/add-ons.ts',
  import.meta.url
).href

describe('add-ons parity', () => {
  test('the apps hold the same rules and words as the server', async () => {
    const core = (await import(coreUrl)) as typeof server
    expect(core.ADD_ON_CATEGORY).toBe(server.ADD_ON_CATEGORY)
    expect(core.ADD_ON_LIMITS).toEqual(server.ADD_ON_LIMITS)
    expect(core.ADD_ONS_ALONE_CODE).toBe(server.ADD_ONS_ALONE_CODE)
    expect(core.ADD_ONS_ALONE_MESSAGE).toBe(server.ADD_ONS_ALONE_MESSAGE)
    const lines = [
      { amount: '99.50', isAddon: true },
      { amount: '599.00' },
      { amount: '49.00', isAddon: true },
    ]
    expect(core.onlyAddOns(lines)).toBe(server.onlyAddOns(lines))
    expect(core.onlyAddOns([lines[0]!])).toBe(server.onlyAddOns([lines[0]!]))
    expect(core.servicesFirst(lines)).toEqual(server.servicesFirst(lines))
    expect(core.addOnPaise(lines)).toBe(server.addOnPaise(lines))
  })
})
