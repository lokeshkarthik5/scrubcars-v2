import { readFileSync } from 'node:fs'
import { describe, expect, test } from 'bun:test'

describe('review reads', () => {
  test('every read of a booking’s lines leaves add-ons out (0068)', () => {
    const source = readFileSync(new URL('./reviews.repository.ts', import.meta.url), 'utf8')
    const reads = source.match(/items: \{[\s\S]*?orderBy/g) ?? []
    expect(reads.length).toBe(4)
    for (const read of reads) expect(read).toContain('eq(bookingItems.isAddon, false)')
  })
})
