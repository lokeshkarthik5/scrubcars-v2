import { describe, expect, test } from 'bun:test'
import {
  ariaSort,
  isWidePage,
  keepKnown,
  nextSort,
  selectAllState,
  sortRows,
  toggleAll,
  toggleKey,
  withGroups,
} from './admin-table'

type Row = { id: string; n: number | null; name: string }
const rows: Row[] = [
  { id: 'a', n: 3, name: 'Shine' },
  { id: 'b', n: null, name: 'adyar' },
  { id: 'c', n: 10, name: 'Car 2' },
  { id: 'd', n: 3, name: 'Car 10' },
]
const ids = (list: Row[]) => list.map((r) => r.id)

describe('sortRows', () => {
  test('numbers, either way, with missing values last', () => {
    expect(ids(sortRows(rows, (r) => r.n, 'asc'))).toEqual(['a', 'd', 'c', 'b'])
    expect(ids(sortRows(rows, (r) => r.n, 'desc'))).toEqual([
      'c',
      'a',
      'd',
      'b',
    ])
  })

  test('words ignore case and read numbers as numbers', () => {
    expect(ids(sortRows(rows, (r) => r.name, 'asc'))).toEqual([
      'b',
      'c',
      'd',
      'a',
    ])
  })

  test('no sort value keeps the order given, as a copy', () => {
    const sorted = sortRows(rows, undefined, 'asc')
    expect(ids(sorted)).toEqual(['a', 'b', 'c', 'd'])
    expect(sorted).not.toBe(rows)
  })

  test('an empty string counts as missing', () => {
    const list = [
      { id: 'x', n: null, name: '' },
      { id: 'y', n: null, name: 'Raga' },
    ]
    expect(ids(sortRows(list, (r) => r.name, 'desc'))).toEqual(['y', 'x'])
  })
})

describe('nextSort and ariaSort', () => {
  test('first direction, then the other, then the list order', () => {
    const first = nextSort(null, 'bookings', 'desc')
    expect(first).toEqual({ columnId: 'bookings', dir: 'desc' })
    const second = nextSort(first, 'bookings', 'desc')
    expect(second).toEqual({ columnId: 'bookings', dir: 'asc' })
    expect(nextSort(second, 'bookings', 'desc')).toBeNull()
  })

  test('another column starts over', () => {
    expect(nextSort({ columnId: 'a', dir: 'desc' }, 'b')).toEqual({
      columnId: 'b',
      dir: 'asc',
    })
  })

  test('aria-sort names the sorted column only', () => {
    expect(ariaSort({ columnId: 'a', dir: 'asc' }, 'a')).toBe('ascending')
    expect(ariaSort({ columnId: 'a', dir: 'desc' }, 'a')).toBe('descending')
    expect(ariaSort({ columnId: 'a', dir: 'desc' }, 'b')).toBe('none')
    expect(ariaSort(null, 'a')).toBe('none')
  })
})

describe('selection', () => {
  test('toggles one key', () => {
    const one = toggleKey(new Set(), 'a')
    expect([...one]).toEqual(['a'])
    expect([...toggleKey(one, 'a')]).toEqual([])
  })

  test('select all reads the rows on screen only', () => {
    expect(selectAllState(new Set(), ['a'])).toBe('none')
    expect(selectAllState(new Set(['a']), ['a', 'b'])).toBe('some')
    expect(selectAllState(new Set(['a', 'b', 'z']), ['a', 'b'])).toBe('all')
    expect(selectAllState(new Set(['z']), [])).toBe('none')
  })

  test('select all ticks every row, and a second press unticks them, leaving the rest', () => {
    const all = toggleAll(new Set(['z', 'a']), ['a', 'b'])
    expect([...all].sort()).toEqual(['a', 'b', 'z'])
    expect([...toggleAll(all, ['a', 'b'])]).toEqual(['z'])
  })

  test('keepKnown drops rows that are gone, and keeps the same set when none are', () => {
    const selected = new Set(['a', 'b'])
    expect(keepKnown(selected, ['a', 'b', 'c'])).toBe(selected)
    expect([...keepKnown(selected, ['b'])]).toEqual(['b'])
  })
})

describe('withGroups', () => {
  test('a heading before each new run, none for ungrouped rows', () => {
    const lines = withGroups(['x1', 'x2', 'n', 'y1', 'x3'], (r) =>
      r === 'n' ? null : r.startsWith('x') ? 'X' : 'Y'
    )
    expect(
      lines.map((l) => (l.kind === 'group' ? `#${l.label}` : l.row))
    ).toEqual(['#X', 'x1', 'x2', 'n', '#Y', 'y1', '#X', 'x3'])
  })

  test('no groupOf: just the rows', () => {
    expect(withGroups([1, 2])).toEqual([
      { kind: 'row', row: 1 },
      { kind: 'row', row: 2 },
    ])
  })
})

describe('isWidePage', () => {
  test('Bookings, Garages and the garage editor are wide', () => {
    expect(isWidePage('/bookings')).toBe(true)
    expect(isWidePage('/vendors')).toBe(true)
    expect(isWidePage('/vendors/')).toBe(true)
    expect(isWidePage('/vendors/3f2a/edit')).toBe(true)
  })

  test('everything else keeps the reading column', () => {
    expect(isWidePage('/bookings/3f2a')).toBe(false)
    expect(isWidePage('/vendors/new')).toBe(false)
    expect(isWidePage('/today')).toBe(false)
    expect(isWidePage(null)).toBe(false)
  })
})
