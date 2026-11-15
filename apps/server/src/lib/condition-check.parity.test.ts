import { describe, expect, test } from 'bun:test'
import * as server from './condition-check.js'
import * as standards from './job-photo-standards.js'

// The apps' twin lives in packages/core, which the server does not depend
// on. Loaded by path at run time, like job-photo-standards.parity.test.ts.
const coreUrl = (file: string) => new URL(`../../../../packages/core/src/${file}`, import.meta.url).href

describe('car condition check parity', () => {
  test('the angles, kinds, numbers and gate words are the same', async () => {
    const core = (await import(coreUrl('condition-check.ts'))) as {
      CAR_CHECK_ANGLES: readonly string[]
      CAR_CHECK_ANGLE_LABELS: Record<string, string>
      DAMAGE_KINDS: readonly string[]
      DAMAGE_KIND_LABELS: Record<string, string>
      MARK_PART_MAX: number
      CONDITION_NOTE_MAX: number
      CAR_CHECK_PHOTO_CAP: number
      carCheckGateLines: (gate: { missing: number; notSent: boolean } | null) => string[]
    }
    expect([...core.CAR_CHECK_ANGLES]).toEqual([...server.CAR_CHECK_ANGLES])
    expect(core.CAR_CHECK_ANGLE_LABELS).toEqual(server.CAR_CHECK_ANGLE_LABELS)
    expect([...core.DAMAGE_KINDS]).toEqual([...server.DAMAGE_KINDS])
    expect(core.DAMAGE_KIND_LABELS).toEqual(server.DAMAGE_KIND_LABELS)
    expect(core.MARK_PART_MAX).toBe(server.MARK_PART_MAX)
    expect(core.CONDITION_NOTE_MAX).toBe(server.CONDITION_NOTE_MAX)
    expect(core.CAR_CHECK_PHOTO_CAP).toBe(server.CAR_CHECK_PHOTO_CAP)
    for (const gate of [
      { missing: 0, notSent: true },
      { missing: 1, notSent: false },
      { missing: 2, notSent: true },
      { missing: 8, notSent: true },
    ]) {
      expect(core.carCheckGateLines(gate)).toEqual(server.carCheckGateLines(gate))
    }
  })

  test('the corners and their words', async () => {
    const core = (await import(coreUrl('job-photo-standards.ts'))) as {
      CORNER_ANGLES: readonly string[]
      CORNER_ANGLE_LABELS: Record<string, string>
    }
    expect([...core.CORNER_ANGLES]).toEqual([...standards.CORNER_ANGLES])
    expect(core.CORNER_ANGLE_LABELS).toEqual(standards.CORNER_ANGLE_LABELS)
  })
})
