import { describe, expect, test } from 'bun:test'
import { CHENNAI_ZONES, orderZones, searchZones } from './zones'

describe('the area sheet', () => {
  test('priority areas first, each group A–Z', () => {
    const ordered = orderZones(CHENNAI_ZONES)
    expect(ordered.filter((z) => z.priority)).toHaveLength(7)
    expect(ordered.slice(0, 7).every((z) => z.priority)).toBe(true)
    expect(ordered[0].name).toBe('Adyar')
    expect(ordered[7].name).toBe('Ambattur')
  })

  test('search matches the start of any word, every word typed', () => {
    expect(searchZones(CHENNAI_ZONES, 'nag').map((z) => z.name).sort()).toEqual([
      'Anna Nagar',
      'Ashok Nagar',
      'T Nagar',
    ])
    expect(searchZones(CHENNAI_ZONES, 't n').map((z) => z.name)).toEqual(['T Nagar'])
    expect(searchZones(CHENNAI_ZONES, 'VELA').map((z) => z.name)).toEqual(['Velachery'])
    expect(searchZones(CHENNAI_ZONES, 'agar')).toEqual([])
  })

  test('nothing typed is every zone, in the order given', () => {
    expect(searchZones(CHENNAI_ZONES, '  ')).toEqual([...CHENNAI_ZONES])
  })
})
