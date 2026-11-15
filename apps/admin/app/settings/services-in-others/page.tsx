'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { IconArrowBackUp, IconCheck } from '@tabler/icons-react'
import { PageHeader } from '@repo/ui/sc/page-header'
import { FilterChip } from '@repo/ui/sc/chip'
import { EmptyState, ErrorState } from '@repo/ui/sc/empty-state'
import { SkeletonList } from '@repo/ui/sc/skeleton'
import {
  listAdminOthersServices,
  moveAdminServiceCategory,
  setAdminCategoryHint,
} from '@repo/core/api/admin'
import { errorMessage, isAuthError } from '@repo/core/api/hooks/use-discounts'
import { CATEGORY_LABELS } from '@repo/core/categories'
import {
  CATEGORY_HINT_KEYWORDS,
  CATEGORY_HINT_NEVER,
  type HintCategory,
} from '@repo/core/category-hints'
import { cn } from '@repo/core/utils'
import { CategoryIcon } from '@/components/category-icon'
import {
  OTHERS_PAGE_SIZE,
  OTHERS_TABS,
  othersCounts,
  othersPriceLabel,
  othersRows,
  rowsForTab,
  type OthersRow,
  type OthersTab,
} from '@/lib/services-in-others'

const ROW_GRID =
  'grid grid-cols-1 gap-x-4 gap-y-1.5 md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,0.8fr)_minmax(0,1fr)_auto] md:items-center'

/** A copy of a record without one key. */
function without<T>(record: Record<string, T>, key: string): Record<string, T> {
  const next = { ...record }
  delete next[key]
  return next
}

const QUIET_BUTTON =
  'inline-flex min-h-11 items-center gap-1.5 rounded-full px-3.5 text-[13px] font-medium text-text-secondary transition-colors hover:text-text-primary disabled:opacity-50'

/**
 * Settings → Services in Others (0080, the option in admin screen 6): the
 * "Looks like … · Move" suggestions for every garage on one page, for the
 * first sort after launch. Here Move saves straight away, with Undo beside
 * it, since the page has no Save changes; Not this hides the hint for good,
 * here and in the garage's editor.
 */
export default function ServicesInOthersPage() {
  const router = useRouter()
  const { data, error, isPending, refetch } = useQuery({
    queryKey: ['admin', 'service-categories', 'others'],
    queryFn: listAdminOthersServices,
    // Read once while the page is open: a moved service leaves the API's
    // list, so a refetch (coming back to the tab after opening a garage)
    // would drop the rows moved here, and their Undo, from To check and
    // Moved. The page keeps its own record of what it did instead.
    refetchOnWindowFocus: false,
  })
  useEffect(() => {
    if (isAuthError(error)) router.replace('/login')
  }, [error, router])

  const [tab, setTab] = useState<OthersTab>('check')
  const [shown, setShown] = useState(OTHERS_PAGE_SIZE)
  // What this page did since it opened, over what the API said.
  const [moved, setMoved] = useState<Record<string, HintCategory>>({})
  const [movedHere, setMovedHere] = useState<ReadonlySet<string>>(new Set())
  const [dismissed, setDismissed] = useState<Record<string, boolean>>({})
  const [busyId, setBusyId] = useState<string | null>(null)
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({})
  const [note, setNote] = useState('')

  const rows = useMemo(() => othersRows(data?.services ?? [], moved, dismissed), [data, moved, dismissed])
  const counts = othersCounts(rows)
  const listed = rowsForTab(rows, tab, movedHere)

  const run = async (row: OthersRow, work: () => Promise<void>) => {
    setBusyId(row.service.id)
    setRowErrors((prev) => without(prev, row.service.id))
    try {
      await work()
    } catch (err) {
      if (isAuthError(err)) return router.replace('/login')
      setRowErrors((prev) => ({ ...prev, [row.service.id]: errorMessage(err, 'Couldn’t save that. Try again.') }))
    } finally {
      setBusyId(null)
    }
  }

  const move = (row: OthersRow) =>
    run(row, async () => {
      await moveAdminServiceCategory(row.service.id, { from: 'others', category: row.category })
      setMoved((prev) => ({ ...prev, [row.service.id]: row.category }))
      setMovedHere((prev) => new Set(prev).add(row.service.id))
      setNote(`“${row.service.name}” moved to ${CATEGORY_LABELS[row.category]}.`)
    })

  const undo = (row: OthersRow) =>
    run(row, async () => {
      await moveAdminServiceCategory(row.service.id, { from: row.category, category: 'others' })
      setMoved((prev) => without(prev, row.service.id))
      setNote(`“${row.service.name}” is back in Others.`)
    })

  const setHint = (row: OthersRow, dismiss: boolean) =>
    run(row, async () => {
      await setAdminCategoryHint(row.service.id, dismiss)
      setDismissed((prev) => ({ ...prev, [row.service.id]: dismiss }))
      setNote(dismiss ? `“${row.service.name}” stays in Others.` : `“${row.service.name}” is back in To check.`)
    })

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Services in Others"
        subtitle="Services filed under Others, across every garage, whose names look like servicing, repairs or dent work. Nothing moves until you tap Move."
        backHref="/settings"
      />

      {/* Always mounted, so each Move, Undo and Not this is announced. */}
      <p role="status" className="sr-only">
        {note}
      </p>

      {isPending ? (
        <SkeletonList count={4} itemClassName="h-16" />
      ) : error ? (
        <ErrorState
          message={errorMessage(error, 'Failed to load the services in Others')}
          onRetry={() => void refetch()}
        />
      ) : (
        <>
          <div className="flex flex-wrap gap-2">
            {OTHERS_TABS.map((t) => (
              <FilterChip
                key={t.key}
                label={t.label}
                count={counts[t.key]}
                active={tab === t.key}
                onClick={() => {
                  setTab(t.key)
                  setShown(OTHERS_PAGE_SIZE)
                }}
              />
            ))}
          </div>

          <section
            aria-label={OTHERS_TABS.find((t) => t.key === tab)!.label}
            className="overflow-hidden rounded-[16px] border border-border bg-surface"
          >
            {listed.length === 0 ? (
              <EmptyState
                title={
                  tab === 'check'
                    ? 'Nothing to check'
                    : tab === 'moved'
                      ? 'Nothing moved yet'
                      : 'Nothing turned down'
                }
                subtitle={
                  tab === 'check'
                    ? 'No service in Others looks like servicing, repairs or dent work.'
                    : tab === 'moved'
                      ? 'Services you move on this page are listed here, with Undo.'
                      : 'Services you mark Not this stay in Others, with no hint.'
                }
              />
            ) : (
              <>
                <div
                  aria-hidden="true"
                  className={cn(ROW_GRID, 'hidden border-b border-border px-4 py-3 text-[12px] font-medium text-text-muted md:grid')}
                >
                  <span>Service</span>
                  <span>Garage</span>
                  <span>Matched</span>
                  <span>Looks like</span>
                  <span className="w-[176px]" />
                </div>
                <ul>
                  {listed.slice(0, shown).map((row) => (
                    <OthersRowItem
                      key={row.service.id}
                      row={row}
                      busy={busyId === row.service.id}
                      disabled={busyId !== null}
                      error={rowErrors[row.service.id]}
                      onMove={() => void move(row)}
                      onUndo={() => void undo(row)}
                      onDismiss={() => void setHint(row, true)}
                      onShowAgain={() => void setHint(row, false)}
                    />
                  ))}
                </ul>
                <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border px-4 py-3">
                  <p className="text-[12.5px] text-text-muted">
                    Showing <span className="font-numeric">{Math.min(shown, listed.length)}</span> of{' '}
                    <span className="font-numeric">{listed.length}</span> · each Move saves at once, with Undo; the
                    garage sees the service under its new category.
                  </p>
                  {listed.length > shown && (
                    <button
                      type="button"
                      onClick={() => setShown((n) => n + OTHERS_PAGE_SIZE)}
                      className={QUIET_BUTTON}
                    >
                      Show more
                    </button>
                  )}
                </div>
              </>
            )}
          </section>
        </>
      )}

      <KeywordsCard />
    </div>
  )
}

function OthersRowItem({
  row,
  busy,
  disabled,
  error,
  onMove,
  onUndo,
  onDismiss,
  onShowAgain,
}: {
  row: OthersRow
  busy: boolean
  disabled: boolean
  error?: string
  onMove: () => void
  onUndo: () => void
  onDismiss: () => void
  onShowAgain: () => void
}) {
  const { service } = row
  const label = CATEGORY_LABELS[row.category]
  return (
    <li
      aria-label={`${service.name}, ${service.vendorName}`}
      className="border-b border-line px-4 py-3 last:border-b-0"
    >
      <div className={ROW_GRID}>
        <div className="min-w-0">
          <p className="truncate text-[14.5px] font-medium text-text-primary">{service.name}</p>
          <p className="font-numeric text-[12.5px] text-text-muted">{othersPriceLabel(service)}</p>
        </div>
        <Link
          href={`/vendors/${service.vendorId}/edit?tab=services`}
          className="w-fit truncate text-[13.5px] text-text-secondary underline decoration-border underline-offset-4 hover:text-text-primary"
        >
          {service.vendorName}
        </Link>
        <p className="text-[13px] text-text-secondary">
          <span className="md:hidden">Matched </span>“
          <span className="font-medium text-tone-attention-text">{row.keyword}</span>”
        </p>
        <p className="flex items-center gap-1.5 text-[13.5px] text-text-primary">
          <CategoryIcon category={row.category} size={16} className="text-text-secondary" />
          <span className="md:hidden text-text-secondary">Looks like </span>
          {label}
        </p>
        <div className="-mr-2 flex items-center justify-start gap-1 md:w-[176px] md:justify-end">
          {row.state === 'moved' ? (
            <>
              <span className="inline-flex items-center gap-1 px-2 text-[13px] font-medium text-tone-done-text">
                <IconCheck size={15} aria-hidden="true" /> Moved
              </span>
              <button
                type="button"
                disabled={disabled}
                onClick={onUndo}
                aria-label={`Undo, put ${service.name} back in Others`}
                className={QUIET_BUTTON}
              >
                <IconArrowBackUp size={15} aria-hidden="true" />
                {busy ? 'Working…' : 'Undo'}
              </button>
            </>
          ) : row.state === 'dismissed' ? (
            <button
              type="button"
              disabled={disabled}
              onClick={onShowAgain}
              aria-label={`Show the hint for ${service.name} again`}
              className={QUIET_BUTTON}
            >
              {busy ? 'Working…' : 'Show again'}
            </button>
          ) : (
            <>
              <button
                type="button"
                disabled={disabled}
                onClick={onMove}
                aria-label={`Move ${service.name} to ${label}`}
                className="inline-flex min-h-11 items-center rounded-full border border-border px-4 text-[13px] font-medium text-text-primary transition-colors hover:bg-surface-elevated disabled:opacity-50"
              >
                {busy ? 'Moving…' : 'Move'}
              </button>
              <button
                type="button"
                disabled={disabled}
                onClick={onDismiss}
                aria-label={`Not this: keep ${service.name} in Others`}
                className={QUIET_BUTTON}
              >
                Not this
              </button>
            </>
          )}
        </div>
      </div>
      {error && (
        <p role="alert" className="mt-1.5 text-[12.5px] text-error">
          {error}
        </p>
      )}
    </li>
  )
}

/** The words the hint looks for, so the admin can see why a row is here. */
function KeywordsCard() {
  const columns: Array<{ category: HintCategory | null; title: string; words: readonly string[] }> = [
    { category: 'general_service', title: CATEGORY_LABELS.general_service, words: CATEGORY_HINT_KEYWORDS.general_service },
    { category: 'repairs', title: CATEGORY_LABELS.repairs, words: CATEGORY_HINT_KEYWORDS.repairs },
    { category: 'dent_paint', title: CATEGORY_LABELS.dent_paint, words: CATEGORY_HINT_KEYWORDS.dent_paint },
    { category: null, title: 'Never suggested when the name says', words: CATEGORY_HINT_NEVER },
  ]
  return (
    <section aria-labelledby="others-keywords" className="rounded-[16px] border border-border bg-surface p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="others-keywords" className="text-[15px] font-medium text-text-primary">
          Words we look for
        </h2>
        <span className="text-[12.5px] text-text-muted">Whole words, any case</span>
      </div>
      <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {columns.map((column) => (
          <div key={column.title} className="border-t border-border pt-3">
            <h3 className="flex items-center gap-1.5 text-[14px] font-medium text-text-primary">
              {column.category && <CategoryIcon category={column.category} size={16} className="text-text-secondary" />}
              {column.title}
            </h3>
            <p className="mt-1 text-[12.5px] leading-relaxed text-text-secondary">{column.words.join(', ')}</p>
          </div>
        ))}
      </div>
    </section>
  )
}
