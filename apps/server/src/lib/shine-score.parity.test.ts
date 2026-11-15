import { describe, expect, test } from 'bun:test'
import * as server from './shine-score.js'

// The apps' twin lives in packages/core, which the server does not depend
// on. Loaded by path at run time (a computed specifier, so the server's
// TypeScript build never tries to compile a file outside src/). The scan
// screens and the booking card say these numbers and words, and pick the
// job photos the same way, so they must be the ones the server decides by.
const coreUrl = (file: string) => new URL(`../../../../packages/core/src/${file}`, import.meta.url).href

describe('shine score parity', () => {
  test('the areas, their words, the numbers and the job angles are the same', async () => {
    const core = (await import(coreUrl('shine-score.ts'))) as {
      SHINE_AREAS: readonly string[]
      SHINE_AREA_LABELS: Record<string, string>
      SHINE_NUMBERS: Record<string, number>
      SHINE_JOB_ANGLES: Record<string, readonly string[]>
    }
    expect([...core.SHINE_AREAS]).toEqual([...server.SHINE_AREAS])
    expect(core.SHINE_AREA_LABELS).toEqual(server.SHINE_AREA_LABELS)
    expect(core.SHINE_NUMBERS).toEqual({ ...server.SHINE_RULES })
    expect(core.SHINE_JOB_ANGLES).toEqual(server.SHINE_JOB_ANGLES)
  })
})
