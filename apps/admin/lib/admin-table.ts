/**
 * The shared admin table's rules (UX audit pattern 03): sorting, selection,
 * group headings, and which pages get the wide frame. Pure, so they are
 * tested here (admin-table.test.ts) rather than read off a page. The table
 * itself is components/table/admin-table.tsx.
 */

export type SortDir = 'asc' | 'desc'
export interface SortState {
  columnId: string
  dir: SortDir
}

/** A value a column sorts by. Null always sorts last, either way. */
export type SortValue = string | number | null

/**
 * The rows in a column's order, a copy. Stable: rows that tie keep the order
 * they came in (the server's), and null or empty values go last whichever
 * way the column is sorted, so "no bookings yet" never tops the list.
 */
export function sortRows<T>(
  rows: readonly T[],
  sortValue: ((row: T) => SortValue) | undefined,
  dir: SortDir
): T[] {
  if (!sortValue) return [...rows]
  const keyed = rows.map((row, index) => ({
    row,
    index,
    value: sortValue(row),
  }))
  keyed.sort((a, b) => {
    const aMissing = a.value === null || a.value === ''
    const bMissing = b.value === null || b.value === ''
    if (aMissing || bMissing) {
      if (aMissing && bMissing) return a.index - b.index
      return aMissing ? 1 : -1
    }
    const order =
      typeof a.value === 'number' && typeof b.value === 'number'
        ? a.value - b.value
        : String(a.value).localeCompare(String(b.value), 'en-IN', {
            numeric: true,
            sensitivity: 'base',
          })
    if (order === 0) return a.index - b.index
    return dir === 'asc' ? order : -order
  })
  return keyed.map((k) => k.row)
}

/**
 * What a press on a column's heading does: a new column starts on its first
 * direction (numbers biggest first, words A to Z), the same column flips,
 * and a third press goes back to the list's own order.
 */
export function nextSort(
  current: SortState | null | undefined,
  columnId: string,
  firstDir: SortDir = 'asc'
): SortState | null {
  if (!current || current.columnId !== columnId)
    return { columnId, dir: firstDir }
  if (current.dir === firstDir)
    return { columnId, dir: firstDir === 'asc' ? 'desc' : 'asc' }
  return null
}

/** The heading's aria-sort for a column. */
export function ariaSort(
  sort: SortState | null | undefined,
  columnId: string
): 'ascending' | 'descending' | 'none' {
  if (!sort || sort.columnId !== columnId) return 'none'
  return sort.dir === 'asc' ? 'ascending' : 'descending'
}

/** One row ticked or unticked, as a new set. */
export function toggleKey(
  selected: ReadonlySet<string>,
  key: string
): ReadonlySet<string> {
  const next = new Set(selected)
  if (next.has(key)) next.delete(key)
  else next.add(key)
  return next
}

/**
 * The "select all" box over the rows on screen: ticked when all of them are,
 * mixed when some are. Rows ticked under another filter don't count.
 */
export function selectAllState(
  selected: ReadonlySet<string>,
  keys: readonly string[]
): 'all' | 'some' | 'none' {
  if (keys.length === 0) return 'none'
  const ticked = keys.filter((key) => selected.has(key)).length
  if (ticked === 0) return 'none'
  return ticked === keys.length ? 'all' : 'some'
}

/**
 * The select-all box pressed: ticks every row on screen, or, when they
 * already all are, unticks them. Rows ticked elsewhere are left as they are.
 */
export function toggleAll(
  selected: ReadonlySet<string>,
  keys: readonly string[]
): ReadonlySet<string> {
  const next = new Set(selected)
  if (selectAllState(selected, keys) === 'all') {
    for (const key of keys) next.delete(key)
  } else {
    for (const key of keys) next.add(key)
  }
  return next
}

/** Only the ticked keys that are still rows: a garage deleted meanwhile drops out. */
export function keepKnown(
  selected: ReadonlySet<string>,
  keys: readonly string[]
): ReadonlySet<string> {
  const known = new Set(keys)
  const kept = [...selected].filter((key) => known.has(key))
  return kept.length === selected.size ? selected : new Set(kept)
}

export type TableLine<T> =
  { kind: 'group'; label: string; key: string } | { kind: 'row'; row: T }

/**
 * The rows with a heading before each run of a new group ("Today · on
 * track"). Rows whose group is null get no heading of their own; a group
 * that comes back after another gets its heading again.
 */
export function withGroups<T>(
  rows: readonly T[],
  groupOf?: (row: T) => string | null
): TableLine<T>[] {
  if (!groupOf) return rows.map((row) => ({ kind: 'row', row }))
  const lines: TableLine<T>[] = []
  let last: string | null = null
  rows.forEach((row, index) => {
    const group = groupOf(row)
    if (group && group !== last) {
      lines.push({
        kind: 'group',
        label: group,
        key: `group-${index}-${group}`,
      })
    }
    last = group
    lines.push({ kind: 'row', row })
  })
  return lines
}

/**
 * Pages laid out as wide tables, where the panel's 1100px column would cut
 * the table short: Bookings, Garages and the garage editor.
 */
export function isWidePage(pathname: string | null | undefined): boolean {
  if (!pathname) return false
  const path = pathname.replace(/\/+$/, '') || '/'
  return (
    path === '/bookings' ||
    path === '/vendors' ||
    /^\/vendors\/[^/]+\/edit$/.test(path)
  )
}
