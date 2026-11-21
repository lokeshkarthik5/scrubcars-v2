import { describe, expect, test } from 'bun:test'
import { serviceCategoryEnum } from '../db/schema.js'
import { CATEGORY_LABELS, CATEGORY_ORDER } from './categories.js'

// The apps' twin lives in packages/core, which the server does not depend
// on. Loaded by path at run time, as the other parity tests do.
const coreUrl = new URL('../../../../packages/core/src/categories.ts', import.meta.url).href

describe('service categories parity', () => {
  test('the same categories, names and order as the apps, and as the database enum', async () => {
    const core = (await import(coreUrl)) as {
      CATEGORY_LABELS: Record<string, string>
      CATEGORY_ORDER: readonly string[]
    }
    expect(Object.keys(core.CATEGORY_LABELS).sort()).toEqual([...serviceCategoryEnum.enumValues].sort())
    expect(Object.keys(CATEGORY_LABELS).sort()).toEqual([...serviceCategoryEnum.enumValues].sort())
    expect(core.CATEGORY_LABELS).toEqual(CATEGORY_LABELS)
    expect([...core.CATEGORY_ORDER]).toEqual([...CATEGORY_ORDER])
    expect([...CATEGORY_ORDER].sort()).toEqual([...serviceCategoryEnum.enumValues].sort())
  })
})
