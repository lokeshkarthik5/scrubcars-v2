import { describe, expect, test } from 'bun:test'
import { outcomeLabel, tickAll, ticksAfterReload } from './data-reset'

describe('ticking the list', () => {
  const ids = (n: number) => Array.from({ length: n }, (_, i) => `chain-${i + 1}`)

  test('"Tick all" takes the oldest up to what one run deletes', () => {
    const { ticked, left } = tickAll(ids(420), 300)
    expect(ticked.size).toBe(300)
    expect(ticked.has('chain-1')).toBe(true)
    expect(ticked.has('chain-300')).toBe(true)
    expect(ticked.has('chain-301')).toBe(false)
    expect(left).toBe(120)
  })

  test('"Tick all" under the cap ticks every row', () => {
    const { ticked, left } = tickAll(ids(3), 300)
    expect([...ticked]).toEqual(['chain-1', 'chain-2', 'chain-3'])
    expect(left).toBe(0)
  })

  test('loading again keeps what the owner unticked unticked', () => {
    const unticked = new Set(['chain-2'])
    expect([...ticksAfterReload(ids(4), unticked)]).toEqual(['chain-1', 'chain-3', 'chain-4'])
    // A row the server no longer ticks (now kept) stays off as well.
    expect([...ticksAfterReload(['chain-1'], unticked)]).toEqual(['chain-1'])
  })
})

describe('what happens to a row', () => {
  test('kept rows give their reason; the rest are deleted or unticked', () => {
    const kept = { code: 'live', label: 'Real payment — kept', detail: 'Live.' }
    expect(outcomeLabel({ kept, selected: false })).toBe('Real payment — kept')
    expect(outcomeLabel({ kept: null, selected: true })).toBe('Deleted')
    expect(outcomeLabel({ kept: null, selected: false })).toBe('Unticked — kept')
  })
})
