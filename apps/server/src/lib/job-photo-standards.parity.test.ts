import { describe, expect, test } from 'bun:test'
import * as server from './job-photo-standards.js'

// The apps' twin lives in packages/core, which the server does not depend
// on. Loaded by path at run time (a computed specifier, so the server's
// TypeScript build never tries to compile a file outside src/). The portal
// shows the gate words beside Start and Complete, and all three apps label
// the angles, from the core copy.
const coreUrl = (file: string) =>
  new URL(`../../../../packages/core/src/${file}`, import.meta.url).href

describe('job photo standards parity', () => {
  test('the angles, the numbers and the gate words are the same', async () => {
    const core = (await import(coreUrl('job-photo-standards.ts'))) as {
      PHOTO_ANGLES: readonly string[]
      PHOTO_ANGLE_LABELS: Record<string, string>
      MIN_GARAGE_PHOTOS: number
      MAX_CUSTOMER_PHOTOS_PER_STAGE: number
      CUSTOMER_AFTER_WINDOW_HOURS: number
      GARAGE_AFTER_GRACE_MINUTES: number
      photoGateMessage: (refusal: { stage: 'before' | 'after'; missing: number }) => string
    }
    expect([...core.PHOTO_ANGLES]).toEqual([...server.PHOTO_ANGLES])
    expect(core.PHOTO_ANGLE_LABELS).toEqual(server.PHOTO_ANGLE_LABELS)
    expect(core.MIN_GARAGE_PHOTOS).toBe(server.MIN_GARAGE_PHOTOS)
    expect(core.MAX_CUSTOMER_PHOTOS_PER_STAGE).toBe(server.MAX_CUSTOMER_PHOTOS_PER_STAGE)
    expect(core.CUSTOMER_AFTER_WINDOW_HOURS).toBe(server.CUSTOMER_AFTER_WINDOW_HOURS)
    expect(core.GARAGE_AFTER_GRACE_MINUTES).toBe(server.GARAGE_AFTER_GRACE_MINUTES)
    for (const stage of ['before', 'after'] as const) {
      for (const missing of [1, 2]) {
        expect(core.photoGateMessage({ stage, missing })).toBe(server.photoGateMessage({ stage, missing }))
      }
    }
  })
})
