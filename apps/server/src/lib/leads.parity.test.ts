import { expect, test } from 'bun:test'
import {
  LEAD_NAME_MAX,
  LEAD_NOTE_MAX,
  LEAD_REASON_MAX,
  LEAD_SOURCES,
  LEAD_STATUSES,
  isIndianMobile,
  normalisePhone,
} from './leads.js'
import { PLACE_KINDS, PLACE_KIND_LABELS } from './places/kinds.js'
import { GOOGLE_HOLD_DAYS } from './places/refresh.js'

// The panel's copy (packages/core/src/leads.ts), loaded by path at run time
// as zones.parity.test.ts does, so the server build never compiles it.
const coreUrl = new URL(
  '../../../../packages/core/src/leads.ts',
  import.meta.url
).href

test("the panel's lead words and rules are the server's", async () => {
  const core = (await import(coreUrl)) as Record<string, unknown> & {
    normalisePhone: (raw: string | null) => string | null
    isIndianMobile: (phone: string | null) => boolean
  }
  expect(core.LEAD_STATUSES).toEqual([...LEAD_STATUSES])
  expect(core.LEAD_SOURCES).toEqual([...LEAD_SOURCES])
  expect(core.PLACE_KINDS).toEqual([...PLACE_KINDS])
  expect(core.PLACE_KIND_LABELS).toEqual(PLACE_KIND_LABELS)
  expect([
    core.LEAD_NAME_MAX,
    core.LEAD_NOTE_MAX,
    core.LEAD_REASON_MAX,
  ]).toEqual([LEAD_NAME_MAX, LEAD_NOTE_MAX, LEAD_REASON_MAX])
  expect(core.GOOGLE_HOLD_DAYS).toBe(GOOGLE_HOLD_DAYS)
  for (const raw of [
    '+91 98400 12345',
    '098400 12345',
    '044 2345 6789',
    '0919840012345',
    '12345',
    '',
    'call',
    '1234567890123456',
    '9443011820',
  ]) {
    expect(core.normalisePhone(raw)).toBe(normalisePhone(raw))
  }
  for (const phone of ['9840012345', '4423456789', '5840012345', null]) {
    expect(core.isIndianMobile(phone)).toBe(isIndianMobile(phone))
  }
})
