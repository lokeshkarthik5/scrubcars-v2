'use client'

import { useEffect, useMemo, useRef } from 'react'
import {
  IconArrowDown,
  IconArrowUp,
  IconArrowsSort,
  IconChevronRight,
} from '@tabler/icons-react'
import { cn } from '@repo/core/utils'
import {
  ariaSort,
  nextSort,
  selectAllState,
  sortRows,
  toggleAll,
  toggleKey,
  withGroups,
  type SortDir,
  type SortState,
  type SortValue,
} from '@/lib/admin-table'

/**
 * Where a column goes on a phone, where each row is two lines (pattern 03):
 * `title` and `subtitle` on the left, `aside` and `asideSub` on the right,
 * and an optional third line of `meta` (left) and `action` (right) for what
 * must be pressed from the row itself. Anything else is `hidden` there and
 * read in the side panel. One column per place; a column with none set is
 * hidden on a phone.
 */
export type PhonePlace =
  'title' | 'subtitle' | 'aside' | 'asideSub' | 'meta' | 'action' | 'hidden'

export interface AdminTableColumn<T> {
  id: string
  header: string
  cell: (row: T) => React.ReactNode
  /** Sortable when set: what the column sorts by. Null sorts last. */
  sortValue?: (row: T) => SortValue
  /** The first press's direction: 'desc' for counts, so the most comes first. */
  sortFirst?: SortDir
  align?: 'start' | 'end'
  /** A CSS width for the column on a laptop ("120px", "18%"). */
  width?: string
  phone?: PhonePlace
  /** The heading only for screen readers (an actions column). */
  headerHidden?: boolean
  /** A CSS class for the column's cells on a laptop (a max width). */
  cellClassName?: string
}

export interface AdminTableProps<T> {
  /** What the table lists, for screen readers ("Garages"). */
  caption: string
  rows: T[]
  columns: AdminTableColumn<T>[]
  rowKey: (r: T) => string
  /** The id of the element that names the row (its garage, its booking). */
  rowLabelId: (r: T) => string
  sort?: SortState | null
  onSortChange?: (s: SortState | null) => void
  /** A heading before each run of rows in a new group. */
  groupOf?: (r: T) => string | null
  /** A coloured edge: red-orange for late, amber for today. */
  toneOf?: (r: T) => 'urgent' | 'attention' | null
  /** The row shown in the side panel. */
  openKey?: string | null
  /** A press on a row (not on its links or buttons); null closes. */
  onOpen?: (r: T | null) => void
  /** A chevron button at the row's end that opens it, named by this. */
  openLabel?: (r: T) => string
  selection?: {
    selected: ReadonlySet<string>
    onChange: (s: ReadonlySet<string>) => void
    rowName: (r: T) => string
  }
  footer?: React.ReactNode
  empty?: React.ReactNode
  className?: string
  /** Columns turned off with the Columns button: left out entirely. */
  hiddenColumns?: ReadonlySet<string>
}

/** Each phone place, written out so Tailwind finds every class. */
const PHONE_PLACE: Record<PhonePlace, string> = {
  title: 'max-md:[grid-area:title] max-md:min-w-0',
  subtitle: 'max-md:[grid-area:subtitle] max-md:min-w-0',
  aside: 'max-md:[grid-area:aside] max-md:text-right max-md:justify-self-end',
  asideSub:
    'max-md:[grid-area:asideSub] max-md:text-right max-md:justify-self-end',
  meta: 'max-md:[grid-area:meta] max-md:min-w-0 max-md:self-center',
  action:
    'max-md:[grid-area:action] max-md:text-right max-md:justify-self-end max-md:self-center',
  hidden: 'max-md:hidden',
}

/**
 * A click on these inside a row is theirs, never the row's: controls, and
 * a dialog a cell opened (drawn inside the row unless portalled).
 */
const OWN_CLICKS =
  'a, button, input, select, textarea, label, [role="dialog"], [data-row-ignore]'

/**
 * The panel's one table (UX audit pattern 03): sortable headings, ticks for
 * bulk actions, a row that opens in the side panel, and, on a phone, the
 * same rows laid out as two lines by CSS. One DOM tree for every screen
 * size: never a second copy for phones, so a test or a screen reader finds
 * each row once. Roles are explicit because a table restyled as a grid loses
 * its implicit ones in some browsers.
 */
export function AdminTable<T>({
  caption,
  rows,
  columns: allColumns,
  rowKey,
  rowLabelId,
  sort,
  onSortChange,
  groupOf,
  toneOf,
  openKey,
  onOpen,
  openLabel,
  selection,
  footer,
  empty,
  className,
  hiddenColumns,
}: AdminTableProps<T>) {
  const columns = useMemo(
    () =>
      hiddenColumns && hiddenColumns.size > 0
        ? allColumns.filter((c) => !hiddenColumns.has(c.id))
        : allColumns,
    [allColumns, hiddenColumns]
  )
  const sorted = useMemo(() => {
    const column = sort ? columns.find((c) => c.id === sort.columnId) : null
    return column?.sortValue
      ? sortRows(rows, column.sortValue, sort!.dir)
      : rows
  }, [rows, columns, sort])
  const lines = useMemo(() => withGroups(sorted, groupOf), [sorted, groupOf])
  const keys = useMemo(() => sorted.map(rowKey), [sorted, rowKey])
  const span = columns.length + (selection ? 1 : 0) + (openLabel ? 1 : 0)

  return (
    <div
      className={cn(
        'overflow-hidden rounded-xl border border-border bg-surface/40',
        className
      )}
    >
      {rows.length === 0 ? (
        <div className="px-4 py-8 text-center text-[13px] text-text-muted">
          {empty ?? 'Nothing here.'}
        </div>
      ) : (
        // Relative, so the cells' screen-reader-only text (absolutely
        // placed) is held by this scroller instead of widening the page.
        <div className="relative overflow-x-auto max-md:overflow-visible">
          <table
            role="table"
            className="w-full border-collapse text-left text-[13px] max-md:block"
          >
            <caption className="sr-only">{caption}</caption>
            <thead role="rowgroup" className="max-md:hidden">
              <tr role="row" className="border-b border-border">
                {selection && (
                  <th
                    role="columnheader"
                    scope="col"
                    className="w-8 py-2.5 pl-3 pr-1"
                  >
                    <SelectAllBox
                      state={selectAllState(selection.selected, keys)}
                      onToggle={() =>
                        selection.onChange(toggleAll(selection.selected, keys))
                      }
                    />
                  </th>
                )}
                {columns.map((column) => (
                  <th
                    key={column.id}
                    role="columnheader"
                    scope="col"
                    aria-sort={
                      column.sortValue ? ariaSort(sort, column.id) : undefined
                    }
                    style={column.width ? { width: column.width } : undefined}
                    className={cn(
                      'whitespace-nowrap px-2 py-2.5 text-[12px] font-medium text-text-secondary',
                      column.align === 'end' && 'text-right'
                    )}
                  >
                    {column.headerHidden ? (
                      <span className="sr-only">{column.header}</span>
                    ) : column.sortValue && onSortChange ? (
                      <button
                        type="button"
                        onClick={() =>
                          onSortChange(
                            nextSort(sort, column.id, column.sortFirst ?? 'asc')
                          )
                        }
                        className={cn(
                          'inline-flex min-h-8 items-center gap-1 rounded-md hover:text-text-primary',
                          sort?.columnId === column.id && 'text-text-primary',
                          column.align === 'end' && 'flex-row-reverse'
                        )}
                      >
                        {column.header}
                        <SortIcon
                          dir={sort?.columnId === column.id ? sort.dir : null}
                        />
                      </button>
                    ) : (
                      column.header
                    )}
                  </th>
                ))}
                {openLabel && (
                  <th role="columnheader" scope="col" className="w-10">
                    <span className="sr-only">Details</span>
                  </th>
                )}
              </tr>
            </thead>
            <tbody role="rowgroup" className="max-md:block">
              {lines.map((line) => {
                if (line.kind === 'group') {
                  return (
                    <tr
                      key={line.key}
                      role="row"
                      className="border-t border-border max-md:block"
                    >
                      <td
                        role="cell"
                        colSpan={span}
                        className="px-3 pb-1.5 pt-3 text-[11px] font-semibold uppercase tracking-[0.04em] text-text-muted max-md:block"
                      >
                        {line.label}
                      </td>
                    </tr>
                  )
                }
                const row = line.row
                const key = rowKey(row)
                const open = openKey === key
                const ticked = selection?.selected.has(key) ?? false
                const tone = toneOf?.(row) ?? null
                return (
                  <tr
                    key={key}
                    role="row"
                    aria-labelledby={rowLabelId(row)}
                    data-open={open || undefined}
                    onClick={
                      onOpen
                        ? (event) => {
                            const target = event.target as HTMLElement
                            // A dialog opened from a cell is portalled out
                            // of the row, but React still bubbles its clicks
                            // here: those are never the row's.
                            if (!event.currentTarget.contains(target)) return
                            if (target.closest(OWN_CLICKS)) return
                            onOpen(open ? null : row)
                          }
                        : undefined
                    }
                    className={cn(
                      'border-t border-border transition-colors',
                      // Two lines on a phone: the tick, then the title and
                      // subtitle, then what sits on the right; a third for
                      // the row's own buttons when it has any.
                      'max-md:grid max-md:gap-x-3 max-md:gap-y-0.5 max-md:px-3 max-md:py-2.5',
                      selection
                        ? "max-md:grid-cols-[auto_minmax(0,1fr)_auto] max-md:[grid-template-areas:'check_title_aside'_'check_subtitle_asideSub'_'check_meta_action']"
                        : "max-md:grid-cols-[minmax(0,1fr)_auto] max-md:[grid-template-areas:'title_aside'_'subtitle_asideSub'_'meta_action']",
                      onOpen && 'cursor-pointer hover:bg-surface',
                      ticked && 'bg-surface',
                      open &&
                        'bg-surface-elevated/60 hover:bg-surface-elevated/60',
                      tone === 'urgent' &&
                        'shadow-[inset_3px_0_0_var(--color-tone-late-dot)]',
                      tone === 'attention' &&
                        'shadow-[inset_3px_0_0_var(--color-tone-attention-dot)]'
                    )}
                  >
                    {selection && (
                      <td
                        role="cell"
                        className="w-8 py-2.5 pl-3 pr-1 align-middle max-md:w-auto max-md:self-start max-md:p-0 max-md:pt-0.5 max-md:[grid-area:check]"
                      >
                        <input
                          type="checkbox"
                          checked={ticked}
                          onChange={() =>
                            selection.onChange(
                              toggleKey(selection.selected, key)
                            )
                          }
                          aria-label={`Select ${selection.rowName(row)}`}
                          className="tap-target size-4 cursor-pointer rounded border-border bg-surface accent-brand-white"
                        />
                      </td>
                    )}
                    {columns.map((column) => (
                      <td
                        key={column.id}
                        role="cell"
                        className={cn(
                          'px-2 py-2 align-middle text-text-primary max-md:p-0',
                          column.align === 'end' && 'text-right',
                          column.cellClassName,
                          PHONE_PLACE[column.phone ?? 'hidden']
                        )}
                      >
                        {column.cell(row)}
                      </td>
                    ))}
                    {openLabel && onOpen && (
                      <td
                        role="cell"
                        className="w-10 px-1 py-2.5 align-middle max-md:hidden"
                      >
                        <button
                          type="button"
                          aria-label={openLabel(row)}
                          aria-expanded={open}
                          onClick={() => onOpen(open ? null : row)}
                          className="flex size-9 items-center justify-center rounded-lg text-text-muted hover:bg-surface-elevated hover:text-text-primary"
                        >
                          <IconChevronRight
                            size={17}
                            aria-hidden="true"
                            className={cn(
                              'transition-transform',
                              open && 'rotate-180'
                            )}
                          />
                        </button>
                      </td>
                    )}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
      {footer && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border px-3 py-2 text-[12px] text-text-secondary">
          {footer}
        </div>
      )}
    </div>
  )
}

function SortIcon({ dir }: { dir: SortDir | null }) {
  if (dir === 'asc') return <IconArrowUp size={13} aria-hidden="true" />
  if (dir === 'desc') return <IconArrowDown size={13} aria-hidden="true" />
  return (
    <IconArrowsSort
      size={13}
      aria-hidden="true"
      className="text-text-muted/70"
    />
  )
}

function SelectAllBox({
  state,
  onToggle,
}: {
  state: 'all' | 'some' | 'none'
  onToggle: () => void
}) {
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = state === 'some'
  }, [state])
  return (
    <input
      ref={ref}
      type="checkbox"
      checked={state === 'all'}
      onChange={onToggle}
      aria-label="Select all"
      className="tap-target size-4 cursor-pointer rounded border-border bg-surface accent-brand-white"
    />
  )
}
