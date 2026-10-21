import { describe, expect, test } from 'bun:test'
import { handoverLocked } from './pickup'

describe('handoverLocked', () => {
  test('locks the step the too-many-codes answer came back on', () => {
    expect(handoverLocked('picked_up', 'picked_up', 2)).toBe(true)
    expect(handoverLocked('delivered', 'delivered', 1)).toBe(true)
  })

  test('clears once Detlio confirms the handover and the job moves on', () => {
    expect(handoverLocked('at_garage', 'picked_up', undefined)).toBe(false)
    expect(handoverLocked('start_work', 'picked_up', undefined)).toBe(false)
    expect(handoverLocked('out_for_delivery', 'picked_up', undefined)).toBe(
      false
    )
    expect(handoverLocked('delivered', 'picked_up', 5)).toBe(false)
  })

  test('with no answer seen, the server tries left decide, for the code steps only', () => {
    expect(handoverLocked('picked_up', null, 0)).toBe(true)
    expect(handoverLocked('delivered', null, 0)).toBe(true)
    expect(handoverLocked('picked_up', null, 3)).toBe(false)
    expect(handoverLocked('at_garage', null, 0)).toBe(false)
  })
})
