import { describe, expect, test } from 'bun:test'
import * as server from './complaints.js'

// The apps' twin lives in packages/core, which the server does not depend
// on. Loaded by path at run time (a computed specifier, so the server's
// TypeScript build never tries to compile a file outside src/). The legal
// pages print the core numbers, so a drift here would put one promise on the
// Contact page and another on the admin clock.
const coreUrl = new URL('../../../../packages/core/src/complaints.ts', import.meta.url).href

type Core = typeof server & {
  COMPLAINT_CATEGORY_LABELS: Record<string, string>
}

describe('complaints parity', () => {
  test('the promises, categories, statuses and lengths are the same', async () => {
    const core = (await import(coreUrl)) as Core
    expect(core.COMPLAINT_ACKNOWLEDGE_HOURS).toBe(server.COMPLAINT_ACKNOWLEDGE_HOURS)
    expect(core.COMPLAINT_RESOLVE_DAYS).toBe(server.COMPLAINT_RESOLVE_DAYS)
    expect([...core.COMPLAINT_CATEGORIES]).toEqual([...server.COMPLAINT_CATEGORIES])
    expect(core.COMPLAINT_CATEGORY_LABELS).toEqual(server.COMPLAINT_CATEGORY_LABELS)
    expect([...core.COMPLAINT_STATUSES]).toEqual([...server.COMPLAINT_STATUSES])
    expect(core.COMPLAINT_MESSAGE_MIN).toBe(server.COMPLAINT_MESSAGE_MIN)
    expect(core.COMPLAINT_MESSAGE_MAX).toBe(server.COMPLAINT_MESSAGE_MAX)
    expect(core.COMPLAINT_RESOLUTION_MAX).toBe(server.COMPLAINT_RESOLUTION_MAX)
    expect(core.COMPLAINT_ADMIN_NOTE_MAX).toBe(server.COMPLAINT_ADMIN_NOTE_MAX)
  })

  test('the number and the overdue rule agree', async () => {
    const core = (await import(coreUrl)) as Core
    for (const seq of [1, 42, 999999, 1000000]) {
      expect(core.formatComplaintNumber(seq)).toBe(server.formatComplaintNumber(seq))
    }
    const created = new Date('2026-10-17T04:30:00.000Z')
    for (const status of server.COMPLAINT_STATUSES) {
      for (const hours of [0, 24, 24.5, 168, 169]) {
        const now = new Date(created.getTime() + hours * 60 * 60 * 1000)
        expect(core.complaintOverdue({ status, createdAt: created }, now)).toBe(
          server.complaintOverdue({ status, createdAt: created }, now)
        )
      }
    }
  })
})
