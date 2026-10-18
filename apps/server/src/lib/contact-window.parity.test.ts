import { describe, expect, test } from 'bun:test'
import * as server from './contact-window.js'

// The apps' twin lives in packages/core, which the server does not depend
// on. Loaded by path at run time (a computed specifier, so the server's
// TypeScript build never tries to compile a file outside src/). Both apps
// print "shows 2 hours before"; a drift would promise one window on screen
// and enforce another.
const coreUrl = (file: string) =>
  new URL(`../../../../packages/core/src/${file}`, import.meta.url).href

describe('contact window parity', () => {
  test('the hours are the same', async () => {
    const core = (await import(coreUrl('contact-window.ts'))) as typeof server
    expect(core.CONTACT_OPENS_HOURS_BEFORE).toBe(server.CONTACT_OPENS_HOURS_BEFORE)
    expect(core.CONTACT_STAYS_HOURS_AFTER).toBe(server.CONTACT_STAYS_HOURS_AFTER)
    expect(core.CONTACT_NOT_STARTED_HOURS_AFTER).toBe(server.CONTACT_NOT_STARTED_HOURS_AFTER)
  })

  test("the apps read the server's window the way it means it", async () => {
    const core = (await import(coreUrl('contact-window.ts'))) as {
      contactWindowState: (window: server.ContactWindow, now: number) => string
    }
    const IST = (iso: string) => new Date(`${iso}+05:30`)
    const slot = IST('2026-10-20T10:00:00')
    const read = (job: server.ContactWindowJob, at: string) =>
      core.contactWindowState(server.contactWindow(job, IST(at)), IST(at).getTime())

    const upcoming = { status: 'confirmed', bookingType: 'dropin', scheduledAt: slot }
    expect(read(upcoming, '2026-10-19T10:00:00')).toBe('before')
    expect(read(upcoming, '2026-10-20T09:00:00')).toBe('open')
    expect(read(upcoming, '2026-10-20T13:00:00')).toBe('after')
    // Cancelled days ahead: "hidden after", never "shows 2 hours before".
    const cancelled = { ...upcoming, status: 'cancelled', cancelledAt: IST('2026-10-18T09:00:00') }
    expect(read(cancelled, '2026-10-18T10:00:00')).toBe('after')
    const done = { ...upcoming, status: 'completed', completedAt: IST('2026-10-20T11:00:00') }
    expect(read(done, '2026-10-20T11:30:00')).toBe('open')
    expect(read(done, '2026-10-20T12:30:00')).toBe('after')
  })
})
