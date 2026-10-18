import { describe, expect, test } from 'bun:test'
import { executeSchema, previewSchema } from './data-reset.validation.js'

const ID = 'e2e00000-0000-4000-8000-000000000601'
const HASH = 'a'.repeat(64)

describe('previewSchema', () => {
  test('a cutoff with its offset, as the page sends the IST time', () => {
    expect(
      previewSchema.parse({ scope: { kind: 'before_cutoff', cutoff: '2026-10-01T09:00:00+05:30' } })
    ).toEqual({
      scope: { kind: 'before_cutoff', cutoff: '2026-10-01T09:00:00+05:30' },
      unknownIds: [],
    })
    expect(
      previewSchema.safeParse({ scope: { kind: 'before_cutoff', cutoff: '1 Oct 2026' } }).success
    ).toBe(false)
    expect(previewSchema.safeParse({ scope: { kind: 'before_cutoff' } }).success).toBe(false)
  })

  test('marked Test, or a few bookings by id', () => {
    expect(previewSchema.safeParse({ scope: { kind: 'marked_test' } }).success).toBe(true)
    expect(previewSchema.safeParse({ scope: { kind: 'chains', bookingIds: [ID] } }).success).toBe(true)
    expect(previewSchema.safeParse({ scope: { kind: 'chains', bookingIds: [] } }).success).toBe(false)
    expect(previewSchema.safeParse({ scope: { kind: 'everything' } }).success).toBe(false)
  })

  test('the ticked list holds ids; more than a run takes is the planner\'s to cap', () => {
    const scope = { kind: 'marked_test' }
    expect(previewSchema.safeParse({ scope, only: { chainIds: [ID], checkoutIds: [] } }).success).toBe(true)
    expect(previewSchema.safeParse({ scope, only: { chainIds: ['x'], checkoutIds: [] } }).success).toBe(false)
    // Past MAX_CHAINS_PER_RUN (300) and MAX_CHECKOUTS_PER_RUN (1000): accepted.
    expect(
      previewSchema.safeParse({
        scope,
        only: { chainIds: Array(420).fill(ID), checkoutIds: Array(1200).fill(ID) },
      }).success
    ).toBe(true)
    // Only the body is bounded.
    expect(
      previewSchema.safeParse({ scope, only: { chainIds: Array(10_001).fill(ID), checkoutIds: [] } }).success
    ).toBe(false)
  })
})

describe('executeSchema', () => {
  const base = {
    scope: { kind: 'marked_test' },
    selectionHash: HASH,
    confirmText: 'DELETE 1 BOOKING',
    actorName: ' Mathew ',
    backupConfirmed: true,
  }

  test('a name, the backup and the fingerprint', () => {
    expect(executeSchema.parse(base)).toMatchObject({ actorName: 'Mathew', backupConfirmed: true })
  })

  test('refused without the backup box, a name or a dry run', () => {
    expect(executeSchema.safeParse({ ...base, backupConfirmed: false }).success).toBe(false)
    expect(executeSchema.safeParse({ ...base, actorName: ' ' }).success).toBe(false)
    expect(executeSchema.safeParse({ ...base, selectionHash: 'abc' }).success).toBe(false)
  })
})
