'use client'

import { useEffect, useId, useRef, useState } from 'react'
import Link from 'next/link'
import { toast } from 'react-toastify'
import {
  IconArrowRight,
  IconMapPin,
  IconNote,
  IconPhone,
} from '@tabler/icons-react'
import type {
  CollectionGarageBrief,
  CollectionItem,
  CollectionList,
} from '@repo/core/api/admin-collection'
import { ApiError } from '@repo/core/api/client'
import {
  useCloseCollectionList,
  useDeleteCollectionList,
  useReopenCollectionList,
  useCollectionLists,
  useUpdateCollectionItem,
} from '@repo/core/api/hooks/use-admin-collection'
import { errorMessage } from '@repo/core/api/hooks/use-discounts'
import { useAdminMe } from '@repo/core/api/hooks/use-admin-logins'
import { telHref } from '@repo/core/contact-links'
import { COLLECTION_LIMITS } from '@repo/core/onboarding-marks'
import type { StatusTone } from '@repo/core/status-tone'
import { cn } from '@repo/core/utils'
import { ConfirmSheet } from '@repo/ui/sc/confirm-sheet'
import { LoadError } from '@repo/ui/sc/load-error'
import { Skeleton } from '@repo/ui/sc/skeleton'
import { StatusChip } from '@repo/ui/sc/status-chip'
import {
  displayPhone,
  dueChip,
  dueDate,
  garageBriefArea,
  garageProgress,
  itemsOf,
  itemState,
  plural,
  progressPercent,
  saveToGarageHref,
} from '@/lib/collection'

/** Today's views: the inbox, my collection lists, everyone's. */
export type TodayView = 'inbox' | 'mine' | 'all'

export function parseTodayView(value: string | null): TodayView | null {
  return value === 'inbox' || value === 'mine' || value === 'all' ? value : null
}

const BUTTON =
  'relative z-10 inline-flex min-h-9 shrink-0 items-center justify-center gap-1.5 rounded-[8px] border border-border px-3 text-[13px] font-medium text-text-primary transition-colors hover:bg-surface-elevated disabled:cursor-not-allowed disabled:text-text-muted'

const DUE_TONE: Record<'late' | 'attention' | 'neutral', StatusTone> = {
  late: 'late',
  attention: 'attention',
  neutral: 'closed',
}

/** A 4xx (404 from an API older than the lists) is "not there", not a failure to retry. */
function notAvailable(error: unknown): boolean {
  return error instanceof ApiError && error.status < 500
}

/**
 * The lists Today needs: mine (for the Mine view, its count and the inbox's
 * banner) and everyone's. `?list=<id>` opens Mine when the list is mine,
 * else All lists.
 */
export function useTodayCollection(listParam: string | null) {
  const mine = useCollectionLists('mine')
  const all = useCollectionLists('all')
  const mineLists = mine.data?.lists ?? []
  const available = !(mine.isError && all.isError)
  let defaultView: TodayView = 'inbox'
  if (listParam) {
    defaultView =
      mine.isPending || mineLists.some((l) => l.id === listParam)
        ? 'mine'
        : 'all'
  }
  return { mine, all, mineLists, available, defaultView }
}

/** Inbox · Mine N · All lists N. */
export function TodayViewSwitch({
  value,
  onChange,
  mineCount,
  allCount,
}: {
  value: TodayView
  onChange: (view: TodayView) => void
  mineCount: number | null
  allCount: number | null
}) {
  const options: Array<{
    value: TodayView
    label: string
    count: number | null
  }> = [
    { value: 'inbox', label: 'Inbox', count: null },
    { value: 'mine', label: 'Mine', count: mineCount },
    { value: 'all', label: 'All lists', count: allCount },
  ]
  return (
    <div
      role="group"
      aria-label="Today view"
      className="flex gap-1 self-start rounded-[10px] border border-border bg-surface p-1"
    >
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={value === option.value}
          onClick={() => onChange(option.value)}
          className={cn(
            'min-h-9 rounded-[8px] px-3 text-[13px] font-medium transition-colors',
            value === option.value
              ? 'bg-surface-elevated text-text-primary'
              : 'text-text-secondary hover:text-text-primary'
          )}
        >
          {option.label}
          {option.count !== null && (
            <span className="font-numeric"> {option.count}</span>
          )}
        </button>
      ))}
    </div>
  )
}

/** On the inbox: "You have a collection list · 3 of 11 collected · Open". */
export function MyListsBanner({
  lists,
  onOpen,
}: {
  lists: CollectionList[]
  onOpen: () => void
}) {
  if (lists.length === 0) return null
  const done = lists.reduce((sum, l) => sum + l.progress.done, 0)
  const total = lists.reduce((sum, l) => sum + l.progress.total, 0)
  const due = lists
    .map((l) => l.dueOn)
    .filter((d): d is string => Boolean(d))
    .sort()[0]
  const chip = dueChip(due ?? null)
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-[12px] border border-border bg-surface px-4 py-3">
      <div className="min-w-0 flex-1">
        <p className="text-[14px] font-medium text-text-primary">
          {lists.length === 1
            ? 'You have a collection list'
            : `You have ${lists.length} collection lists`}
        </p>
        <p className="font-numeric text-[12px] text-text-secondary">
          {done} of {total} collected
        </p>
      </div>
      {chip && (
        <StatusChip tone={DUE_TONE[chip.tone]} size="sm">
          {chip.text}
        </StatusChip>
      )}
      <button type="button" onClick={onOpen} className={BUTTON}>
        Open my list{lists.length === 1 ? '' : 's'}
        <IconArrowRight size={14} aria-hidden="true" />
      </button>
    </div>
  )
}

/**
 * The Mine and All lists views (mockup 07, panel 5): each open list with
 * its garages, Call, Map and Note, and the things to collect as tick boxes.
 */
export function CollectionLists({
  view,
  query,
  highlight,
  onShowAll,
}: {
  view: 'mine' | 'all'
  query: ReturnType<typeof useCollectionLists>
  highlight: string | null
  onShowAll: () => void
}) {
  const { data: me } = useAdminMe()
  if (query.isPending) {
    return (
      <div className="flex flex-col gap-3" aria-busy="true">
        <Skeleton className="h-40" />
        <Skeleton className="h-40" />
      </div>
    )
  }
  if (query.isError || !query.data) {
    if (notAvailable(query.error)) {
      return (
        <p className="rounded-[12px] border border-border bg-surface px-4 py-6 text-[14px] text-text-secondary">
          Collection lists aren’t on this server yet.
        </p>
      )
    }
    return (
      <LoadError
        what="the collection lists"
        onRetry={() => void query.refetch()}
        retrying={query.isRefetching}
      />
    )
  }
  const lists = query.data.lists
  const missingHighlight =
    highlight !== null && !lists.some((l) => l.id === highlight)
  return (
    <div className="flex flex-col gap-4">
      {missingHighlight && (
        <p
          role="status"
          className="rounded-[12px] border border-border bg-surface px-4 py-3 text-[13px] text-text-secondary"
        >
          That list isn’t open any more: it was closed, or everything on it is
          collected.
        </p>
      )}
      {lists.length === 0 ? (
        view === 'mine' && me?.kind !== 'personal' ? (
          <div className="flex flex-col items-start gap-2 rounded-[12px] border border-border bg-surface px-4 py-5">
            <p className="text-[14px] text-text-secondary">
              You’re on the shared login, which has no lists of its own.
            </p>
            <button type="button" className={BUTTON} onClick={onShowAll}>
              See all lists
            </button>
          </div>
        ) : (
          <p className="rounded-[12px] border border-border bg-surface px-4 py-6 text-[14px] text-text-secondary">
            {view === 'mine' ? (
              'Nothing to collect. Lists sent to you show up here.'
            ) : (
              <>
                No open lists. To send one, tick garages on{' '}
                <Link href="/vendors" className="underline">
                  Garages
                </Link>{' '}
                and press Send to team.
              </>
            )}
          </p>
        )
      ) : (
        lists.map((list) => (
          <CollectionListCard
            key={list.id}
            list={list}
            mine={view === 'mine'}
            highlighted={list.id === highlight}
          />
        ))
      )}
      <ClosedLists view={view} />
    </div>
  )
}

/**
 * The closed and finished lists (0065), on request: each can be deleted, and
 * one closed by hand with things left on it reopened.
 */
function ClosedLists({ view }: { view: 'mine' | 'all' }) {
  const [shown, setShown] = useState(false)
  const query = useCollectionLists(view, false, shown)
  if (!shown) {
    return (
      <button
        type="button"
        className={cn(BUTTON, 'self-start')}
        onClick={() => setShown(true)}
      >
        Show closed lists
      </button>
    )
  }
  return (
    <section aria-label="Closed lists" className="flex flex-col gap-3">
      <h2 className="text-[15px] font-semibold text-text-primary">
        Closed lists
      </h2>
      {query.isPending ? (
        <Skeleton className="h-24" />
      ) : query.isError || !query.data ? (
        <LoadError
          what="the closed lists"
          onRetry={() => void query.refetch()}
          retrying={query.isRefetching}
        />
      ) : query.data.lists.length === 0 ? (
        <p className="text-[13px] text-text-secondary">No closed lists.</p>
      ) : (
        query.data.lists.map((list) => (
          <CollectionListCard
            key={list.id}
            list={list}
            mine={view === 'mine'}
            highlighted={false}
          />
        ))
      )}
    </section>
  )
}

export function CollectionListCard({
  list,
  mine,
  highlighted,
}: {
  list: CollectionList
  mine: boolean
  highlighted: boolean
}) {
  const headingId = useId()
  const ref = useRef<HTMLElement>(null)
  const close = useCloseCollectionList()
  const [closing, setClosing] = useState(false)
  const [closeError, setCloseError] = useState('')
  // Reopen and Delete list (0065).
  const reopen = useReopenCollectionList()
  const remove = useDeleteCollectionList()
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState('')
  // Closed by hand with things left: worth opening again.
  const somethingLeft = list.progress.done < list.progress.total
  const chip = dueChip(list.dueOn)
  const title = mine
    ? 'My collection list'
    : `${list.assigneeName}’s collection list`

  // ?list=<id>: bring it into view once, when it first shows.
  useEffect(() => {
    if (highlighted) ref.current?.scrollIntoView({ block: 'start' })
  }, [highlighted])

  const confirmDelete = async () => {
    setDeleteError('')
    try {
      await remove.mutateAsync(list.id)
      setDeleting(false)
      toast.success('List deleted')
    } catch (err) {
      setDeleteError(errorMessage(err, 'Couldn’t delete the list'))
    }
  }

  const reopenList = async () => {
    try {
      await reopen.mutateAsync(list.id)
      toast.success('List reopened')
    } catch (err) {
      toast.error(errorMessage(err, 'Couldn’t reopen the list'))
    }
  }

  const confirmClose = async () => {
    setCloseError('')
    try {
      await close.mutateAsync(list.id)
      setClosing(false)
      toast.success('List closed')
    } catch (err) {
      setCloseError(errorMessage(err, 'Couldn’t close the list'))
    }
  }

  return (
    <section
      ref={ref}
      id={`collection-list-${list.id}`}
      aria-labelledby={headingId}
      className={cn(
        'scroll-mt-4 rounded-[12px] border bg-surface',
        highlighted
          ? 'border-text-secondary ring-1 ring-text-secondary'
          : 'border-border'
      )}
    >
      <div className="flex flex-col gap-2 border-b border-border px-4 py-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2
              id={headingId}
              className="text-[15px] font-semibold text-text-primary"
            >
              {title}
            </h2>
            <p className="text-[12px] text-text-secondary">
              From {list.createdByName}
              {list.dueOn ? ` · by ${dueDate(list.dueOn)}` : ''}
              {!mine && list.assigneeLoginId === null ? ' · no login' : ''}
            </p>
          </div>
          {chip && (
            <StatusChip tone={DUE_TONE[chip.tone]} size="sm">
              {chip.text}
            </StatusChip>
          )}
        </div>
        <div className="flex items-center gap-3">
          <div
            role="progressbar"
            aria-label="Collected"
            aria-valuemin={0}
            aria-valuemax={list.progress.total}
            aria-valuenow={list.progress.done}
            className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-elevated"
          >
            <div
              className="h-full rounded-full bg-tone-done-dot transition-[width] duration-300 motion-reduce:transition-none"
              style={{ width: `${progressPercent(list.progress)}%` }}
            />
          </div>
          <span className="shrink-0 font-numeric text-[12px] text-text-primary">
            {list.progress.done} of {list.progress.total} collected
          </span>
        </div>
        {list.note && (
          <p className="text-[12px] italic text-text-secondary">
            “{list.note}” · {list.createdByName}
          </p>
        )}
      </div>

      <ul className="flex flex-col divide-y divide-border">
        {list.garages.map((garage) => (
          <li key={garage.id}>
            <GarageBlock
              garage={garage}
              items={itemsOf(list, garage.id)}
              readOnly={!list.open}
            />
          </li>
        ))}
      </ul>

      <div className="flex flex-wrap justify-end gap-2 border-t border-border px-4 py-2.5">
        <button
          type="button"
          className={BUTTON}
          onClick={() => {
            setDeleteError('')
            setDeleting(true)
          }}
        >
          Delete list
        </button>
        {!list.open && list.closedAt && somethingLeft && (
          <button
            type="button"
            className={BUTTON}
            disabled={reopen.isPending}
            onClick={() => void reopenList()}
          >
            {reopen.isPending ? 'Reopening…' : 'Reopen'}
          </button>
        )}
        {list.open && (
          <button
            type="button"
            className={BUTTON}
            onClick={() => {
              setCloseError('')
              setClosing(true)
            }}
          >
            Close list
          </button>
        )}
      </div>

      <ConfirmSheet
        open={deleting}
        onClose={() => setDeleting(false)}
        onConfirm={confirmDelete}
        level="firm"
        title={`Delete ${mine ? 'your' : `${list.assigneeName}’s`} list?`}
        body="The list and its ticks go for good. The garages and what they filled in stay as they are."
        confirmLabel="Delete list"
        busy={remove.isPending}
        error={deleteError || undefined}
      />

      <ConfirmSheet
        open={closing}
        onClose={() => setClosing(false)}
        onConfirm={confirmClose}
        level="light"
        title={`Close ${mine ? 'your' : `${list.assigneeName}’s`} list?`}
        body="It leaves the Today inbox and the Garages page. What was ticked stays ticked."
        confirmLabel="Close list"
        busy={close.isPending}
        error={closeError || undefined}
      />
    </section>
  )
}

function GarageBlock({
  garage,
  items,
  readOnly,
}: {
  garage: CollectionGarageBrief
  items: CollectionItem[]
  readOnly: boolean
}) {
  const update = useUpdateCollectionItem()
  const progress = garageProgress(items)
  const tel = telHref(garage.ownerPhone)
  const notes = items.filter((item) => item.note)
  const first = items[0]
  const [noting, setNoting] = useState(false)
  const [note, setNote] = useState(first?.note ?? '')
  const noteId = useId()

  const saveNote = () => {
    if (!first) return
    update.mutate(
      {
        id: first.id,
        input: { status: first.status, note: note.trim() || null },
      },
      {
        onSuccess: () => setNoting(false),
        onError: (err) =>
          toast.error(errorMessage(err, 'Couldn’t save the note')),
      }
    )
  }

  return (
    <article
      aria-label={garage.businessName}
      className="flex flex-col gap-2 px-4 py-3"
    >
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="min-w-0 truncate text-[14px] font-semibold text-text-primary">
          {garage.businessName}
          {/* "Adyar", not "Chennai"; the city from an older API. */}
          {garageBriefArea(garage) && (
            <span className="font-normal text-text-secondary">
              {' '}
              · {garageBriefArea(garage)}
            </span>
          )}
        </h3>
        <span className="shrink-0 font-numeric text-[12px] text-text-secondary">
          {progress.done}/{progress.total}
        </span>
      </div>
      <div className="flex flex-wrap gap-2">
        {tel && (
          <a
            href={tel}
            aria-label={`Call ${garage.ownerName ?? garage.businessName}, ${displayPhone(garage.ownerPhone)}`}
            className={BUTTON}
          >
            <IconPhone size={14} aria-hidden="true" />
            {garage.ownerName?.split(' ')[0] || 'Call'}
          </a>
        )}
        {garage.mapsUrl && (
          <a
            href={garage.mapsUrl}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`Map of ${garage.businessName}`}
            className={BUTTON}
          >
            <IconMapPin size={14} aria-hidden="true" />
            Map
          </a>
        )}
        {!readOnly && first && (
          <button
            type="button"
            aria-expanded={noting}
            aria-controls={noteId}
            aria-label={`Note on ${garage.businessName}`}
            onClick={() => setNoting((v) => !v)}
            className={BUTTON}
          >
            <IconNote size={14} aria-hidden="true" />
            Note
          </button>
        )}
      </div>

      {noting && (
        <div id={noteId} className="flex flex-col gap-2">
          <textarea
            aria-label={`Note on ${garage.businessName}`}
            value={note}
            maxLength={COLLECTION_LIMITS.noteMax}
            rows={2}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Owner asked to come after 4"
            className="w-full rounded-[10px] border border-border bg-surface px-3 py-2 text-[13px] text-text-primary outline-none focus:border-text-secondary"
          />
          <div className="flex gap-2">
            <button
              type="button"
              className={BUTTON}
              onClick={saveNote}
              disabled={update.isPending}
            >
              {update.isPending ? 'Saving…' : 'Save note'}
            </button>
            <button
              type="button"
              className={BUTTON}
              onClick={() => setNoting(false)}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
      {!noting &&
        notes.map((item) => (
          <p key={item.id} className="text-[12px] text-text-secondary">
            Note: {item.note}
          </p>
        ))}

      <ul className="flex flex-col">
        {items.map((item) => (
          <li key={item.id}>
            <ItemRow
              item={item}
              garageName={garage.businessName}
              readOnly={readOnly}
            />
          </li>
        ))}
      </ul>
    </article>
  )
}

function ItemRow({
  item,
  garageName,
  readOnly,
}: {
  item: CollectionItem
  garageName: string
  readOnly: boolean
}) {
  const update = useUpdateCollectionItem()
  const state = itemState(item)
  const save = state === 'collected' ? saveToGarageHref(item) : null
  return (
    <div className="flex items-start justify-between gap-3 py-1">
      <label
        className={cn(
          'flex min-h-11 min-w-0 flex-1 items-start gap-2.5 py-1.5',
          state === 'cleared' || readOnly ? 'cursor-default' : 'cursor-pointer'
        )}
      >
        <input
          type="checkbox"
          checked={state !== 'to_collect'}
          disabled={state === 'cleared' || readOnly}
          onChange={(e) =>
            update.mutate(
              {
                id: item.id,
                input: {
                  status: e.target.checked ? 'collected' : 'to_collect',
                },
              },
              {
                onError: (err) =>
                  toast.error(errorMessage(err, 'Couldn’t save the tick')),
              }
            )
          }
          className="mt-0.5 size-[18px] shrink-0 accent-brand-white"
        />
        <span className="flex min-w-0 flex-col">
          <span
            className={cn(
              'text-[14px] text-text-primary',
              state !== 'to_collect' && 'text-text-secondary'
            )}
          >
            {item.label}
          </span>
          {state === 'cleared' && (
            <span className="text-[12px] text-tone-done-text">
              Saved on the garage, cleared
            </span>
          )}
          {state === 'collected' && (
            <span className="text-[12px] text-text-secondary">
              Collected
              {item.collectedByName ? ` by ${item.collectedByName}` : ''} · not
              saved yet
            </span>
          )}
        </span>
      </label>
      {save && (
        <Link
          href={save}
          aria-label={`Save ${item.label} to ${garageName}`}
          className={cn(BUTTON, 'mt-1')}
        >
          Save to garage
        </Link>
      )}
    </div>
  )
}

/** "1 list · 3 of 11 collected", for the views' subtitle. */
export function listsLine(lists: CollectionList[]): string {
  const done = lists.reduce((sum, l) => sum + l.progress.done, 0)
  const total = lists.reduce((sum, l) => sum + l.progress.total, 0)
  return `${plural(lists.length, 'open list')} · ${done} of ${total} collected`
}
