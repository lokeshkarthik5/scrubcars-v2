import { describe, expect, test } from 'bun:test'
import * as server from './slot-alerts.js'

// The customer app's twin lives in packages/core, which the server does not
// depend on. Loaded by path at run time (a computed specifier, so the
// server's TypeScript build never tries to compile a file outside src/). The
// app's window chips and "up to 5" must say what the API decides.
const coreUrl = new URL('../../../../packages/core/src/slot-alerts.ts', import.meta.url).href

type Core = {
  SLOT_ALERT_WINDOWS: readonly string[]
  SLOT_ALERT_WINDOW_HOURS: Record<string, { from: number; to: number }>
  MAX_ACTIVE_SLOT_ALERTS: number
  SLOT_ALERT_MAX_DAYS_AHEAD: number
  inSlotAlertWindow: (iso: string, window: server.SlotAlertWindow) => boolean
}

describe('slot alerts parity', () => {
  test('the windows, their hours, the cap and the reach are the same', async () => {
    const core = (await import(coreUrl)) as Core
    expect([...core.SLOT_ALERT_WINDOWS]).toEqual([...server.SLOT_ALERT_WINDOWS])
    expect(core.SLOT_ALERT_WINDOW_HOURS).toEqual(server.SLOT_ALERT_WINDOW_HOURS)
    expect(core.MAX_ACTIVE_SLOT_ALERTS).toBe(server.MAX_ACTIVE_SLOT_ALERTS)
    expect(core.SLOT_ALERT_MAX_DAYS_AHEAD).toBe(server.SLOT_ALERT_MAX_DAYS_AHEAD)
  })

  test('a start time falls in the same window on both sides, every half hour of the day', async () => {
    const core = (await import(coreUrl)) as Core
    for (let minutes = 0; minutes < 24 * 60; minutes += 30) {
      const iso = new Date(Date.parse('2026-10-24T00:00:00+05:30') + minutes * 60_000).toISOString()
      for (const window of server.SLOT_ALERT_WINDOWS) {
        expect(core.inSlotAlertWindow(iso, window)).toBe(server.inWindow(iso, window))
      }
    }
  })
})
