import { describe, expect, test } from 'bun:test'
import { isHomeHubEnabled } from './home-hub'

describe('isHomeHubEnabled', () => {
  test("only the exact value 'on' turns the hub on", () => {
    expect(isHomeHubEnabled('on')).toBe(true)
  })

  test('anything else leaves it off', () => {
    for (const value of ['', 'off', 'ON', 'On', ' on', 'true', '1', 'yes']) {
      expect(isHomeHubEnabled(value)).toBe(false)
    }
  })

  // Passing undefined means "use the default", so the unset case is tested
  // through the environment itself.
  test('reads NEXT_PUBLIC_HOME_HUB when called with no argument', () => {
    const saved = process.env.NEXT_PUBLIC_HOME_HUB
    try {
      delete process.env.NEXT_PUBLIC_HOME_HUB
      expect(isHomeHubEnabled()).toBe(false)
      process.env.NEXT_PUBLIC_HOME_HUB = 'true'
      expect(isHomeHubEnabled()).toBe(false)
      process.env.NEXT_PUBLIC_HOME_HUB = 'on'
      expect(isHomeHubEnabled()).toBe(true)
    } finally {
      if (saved === undefined) delete process.env.NEXT_PUBLIC_HOME_HUB
      else process.env.NEXT_PUBLIC_HOME_HUB = saved
    }
  })
})
