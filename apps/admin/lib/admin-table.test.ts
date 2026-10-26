import { describe, expect, test } from 'bun:test'
import {
  ariaSort,
  groupRows,
  hiddenColumnsToSave,
  isGarageEditor,
  isWidePage,
  keepKnown,
  nextSort,
  readHiddenColumns,
  selectAllState,
  sortRows,
  splitSelection,
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

describe('groupRows', () => {
  test("each group's rows together, in the order given, stable", () => {
    const rows = ['ok1', 'late1', 'ok2', 'none', 'late2']
    const group = (r: string) =>
      r.startsWith('late')
        ? 'Needs attention'
        : r === 'none'
          ? null
          : 'On track'
    expect(groupRows(rows, group, ['Needs attention', 'On track'])).toEqual([
      'late1',
      'late2',
      'ok1',
      'ok2',
      'none',
    ])
    // Feeding the result to withGroups gives each heading once.
    const lines = withGroups(
      groupRows(rows, group, ['Needs attention', 'On track']),
      group
    )
    expect(lines.filter((l) => l.kind === 'group')).toHaveLength(2)
  })
})

describe('splitSelection', () => {
  test('acts on the ticked rows on screen and counts the hidden ones', () => {
    expect(splitSelection(new Set(['a', 'b', 'c']), ['b', 'c', 'd'])).toEqual({
      visible: ['b', 'c'],
      hidden: 1,
    })
    expect(splitSelection(new Set(), ['a'])).toEqual({ visible: [], hidden: 0 })
  })
})

describe('optional columns', () => {
  const optional = [
    { id: 'area', header: 'Area' },
    { id: 'onboardedBy', header: 'Onboarded by', defaultHidden: true },
  ]

  test('defaults until chosen', () => {
    expect([...readHiddenColumns(null, optional)]).toEqual(['onboardedBy'])
    expect([...readHiddenColumns('', optional)]).toEqual(['onboardedBy'])
  })

  test('a saved choice wins, both ways, and round-trips', () => {
    const saved = hiddenColumnsToSave(new Set(['area']), optional)
    expect(JSON.parse(saved)).toEqual({ area: false, onboardedBy: true })
    expect([...readHiddenColumns(saved, optional)]).toEqual(['area'])
  })

  test('an unreadable or odd value falls back to the defaults', () => {
    expect([...readHiddenColumns('{nope', optional)]).toEqual(['onboardedBy'])
    expect([...readHiddenColumns('[1]', optional)]).toEqual(['onboardedBy'])
    expect([
      ...readHiddenColumns('{"area":"no","onboardedBy":1}', optional),
    ]).toEqual(['onboardedBy'])
  })
})

describe('isGarageEditor', () => {
  test('only the editor, which has its own breadcrumb', () => {
    expect(isGarageEditor('/vendors/3f2a/edit')).toBe(true)
    expect(isGarageEditor('/vendors/3f2a/edit/')).toBe(true)
    expect(isGarageEditor('/vendors')).toBe(false)
    expect(isGarageEditor('/vendors/new')).toBe(false)
    expect(isGarageEditor(null)).toBe(false)
  })
})
