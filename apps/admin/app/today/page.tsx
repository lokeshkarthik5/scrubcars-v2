'use client'

import { Suspense, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'react-toastify'
import {
  IconAlertTriangle,
  IconArrowRight,
  IconBuildingStore,
  IconCalendar,
  IconChecks,
  IconPhone,
  IconReceiptRefund,
  IconRepeat,
  IconWallet,
} from '@tabler/icons-react'
import { acknowledgeAdminComplaint } from '@repo/core/api/admin'
import { adminComplaintKeys } from '@repo/core/api/hooks/use-admin-complaints'
import { errorMessage, isAuthError } from '@repo/core/api/hooks/use-discounts'
import { telHref } from '@repo/core/contact-links'
import { APP_TIMEZONE, cn } from '@repo/core/utils'
import { bookingStatusBadge, ScBadge } from '@repo/ui/sc/badge'
import { LoadError } from '@repo/ui/sc/load-error'
import { Skeleton } from '@repo/ui/sc/skeleton'
import { UrgencyChip } from '@/components/urgency-chip'
import { adminTodayKeys, useAdminToday } from '@/hooks/use-admin-today'
import { useNow } from '@repo/core/hooks/use-now'
import { formatCount, formatMoney, formatTime } from '@/lib/format'
import {
  filterCount,
  filterTasks,
  inboxSubtitle,
  inboxTitle,
  missingTasksLine,
  taskLine,
  TODAY_FILTERS,
  type AdminTodaySummary,
  type TodayFilter,
  type TodaySection,
  type TodayTask,
  type TodayTaskKind,
} from '@/lib/today'
import {
  CollectionLists,
  listsLine,
  MyListsBanner,
  parseTodayView,
  TodayViewSwitch,
  useTodayCollection,
  type TodayView,
} from './collection-lists'

const KIND_ICON: Record<TodayTaskKind, typeof IconCalendar> = {
  booking_waiting: IconCalendar,
  complaint: IconAlertTriangle,
  redo_claim: IconRepeat,
  bypass_report: IconAlertTriangle,
  refund_owed: IconReceiptRefund,
  payouts_due: IconWallet,
  documents: IconChecks,
  garage_blocked: IconBuildingStore,
}

const ROW_BUTTON =
  'relative z-10 inline-flex min-h-9 shrink-0 items-center justify-center gap-1.5 rounded-[8px] border border-border px-3 text-[13px] font-medium text-text-primary transition-colors hover:bg-surface-elevated disabled:cursor-not-allowed disabled:text-text-muted'

/** "Monday 19 October" in Chennai, for the top of the inbox. */
function longDate(iso: string): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: APP_TIMEZONE,
  }).formatToParts(new Date(iso))
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? ''
  return `${part('weekday')} ${part('day')} ${part('month')}`
}

function Tile({
  label,
  value,
  note,
}: {
  label: string
  value: React.ReactNode
  note?: React.ReactNode
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1 rounded-[12px] border border-border bg-surface p-3 md:p-4">
      <p className="text-[12px] text-text-secondary md:text-[13px]">{label}</p>
      <p className="font-numeric text-[22px] font-semibold leading-tight text-text-primary md:text-[28px]">
        {value}
      </p>
      {note && (
        <p className="hidden text-[12px] text-text-secondary md:block">
          {note}
        </p>
      )}
    </div>
  )
}

/** Whether a section's source failed, so it says "Couldn't load", never zero. */
const failedIn = (summary: AdminTodaySummary) => {
  const failed = new Set(summary.failed ?? [])
  return (...sections: TodaySection[]) => sections.some((s) => failed.has(s))
}

function Headline({ summary }: { summary: AdminTodaySummary }) {
  const { bookingsToday, collectedToday, garages, openIssues } =
    summary.headline
  const failed = failedIn(summary)
  const LOST = 'Couldn’t load'
  return (
    <section
      aria-label="Today in numbers"
      className="grid grid-cols-2 gap-2 md:grid-cols-4 md:gap-3"
    >
      <Tile
        label="Bookings today"
        value={failed('schedule') ? '—' : formatCount(bookingsToday.total)}
        // Test bookings are left out here and in the menu's counts, though
        // the Bookings list shows them: said, so the numbers don't look off.
        note={
          failed('schedule')
            ? LOST
            : `${bookingsToday.done} done · ${bookingsToday.toCome} to come · ${bookingsToday.waiting} waiting for garage · test bookings left out`
        }
      />
      <Tile
        label="Collected today"
        value={collectedToday === null ? '—' : formatMoney(collectedToday)}
        note={
          collectedToday === null
            ? 'Couldn’t load from Statistics'
            : 'After refunds, as Statistics counts it'
        }
      />
      <Tile
        label="Garages customers can book"
        value={
          failed('garages') ? (
            '—'
          ) : (
            <>
              {garages.live}
              <span className="text-[14px] font-medium text-text-secondary">
                {' '}
                of {garages.total}
              </span>
            </>
          )
        }
        note={
          failed('garages')
            ? LOST
            : `${summary.garages.blocked} blocked from going live`
        }
      />
      <Tile
        label="Open issues"
        value={
          failed('complaints', 'claims', 'bypassReports')
            ? '—'
            : formatCount(openIssues.total)
        }
        note={
          failed('complaints', 'claims', 'bypassReports')
            ? LOST
            : openIssues.complaintsLate === 0
              ? 'No complaint is late'
              : `${openIssues.complaintsLate} ${openIssues.complaintsLate === 1 ? 'complaint' : 'complaints'} late`
        }
      />
    </section>
  )
}

function TaskRow({ task, now }: { task: TodayTask; now: number }) {
  const line = taskLine(task, now)
  const Icon = KIND_ICON[task.kind]
  const queryClient = useQueryClient()
  const acknowledge = useMutation({
    mutationFn: (id: string) => acknowledgeAdminComplaint(id),
    onSuccess: () => {
      toast.success('Acknowledged. The customer is told the team is on it.')
      void queryClient.invalidateQueries({ queryKey: adminTodayKeys.all })
      void queryClient.invalidateQueries({ queryKey: adminComplaintKeys.all })
    },
    onError: (err) =>
      toast.error(errorMessage(err, 'Couldn’t acknowledge it. Try again.')),
  })

  const action = line.action
  const tel = action?.kind === 'call' ? telHref(action.phone) : null

  return (
    <li
      aria-label={`${line.what}: ${line.title}`}
      className="relative flex flex-col gap-2 border-b border-border px-3 py-3 last:border-b-0 md:flex-row md:items-center md:gap-3 md:px-4"
    >
      <div className="flex items-center justify-between gap-2 md:w-[150px] md:shrink-0">
        <UrgencyChip label={line.chip} />
        <span className="text-[12px] text-text-secondary md:hidden">
          {line.what}
        </span>
      </div>
      <Icon
        size={18}
        stroke={1.6}
        aria-hidden="true"
        className="hidden shrink-0 text-text-secondary md:block"
      />
      <div className="min-w-0 flex-1">
        <Link
          href={line.href}
          className="line-clamp-2 text-[14px] font-medium text-text-primary after:absolute after:inset-0 hover:underline focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-text-secondary"
        >
          {line.title}
        </Link>
        {line.detail && (
          <p className="truncate text-[12px] text-text-secondary md:text-[13px]">
            {line.detail}
          </p>
        )}
      </div>
      <div className="flex shrink-0 gap-2">
        {action?.kind === 'call' && tel && (
          <a
            href={tel}
            aria-label={`Call ${action.name}, ${action.phone}`}
            className={cn(ROW_BUTTON, 'flex-1 md:flex-none')}
          >
            <IconPhone size={15} aria-hidden="true" />
            {action.label}
          </a>
        )}
        {action?.kind === 'acknowledge' && (
          <button
            type="button"
            // Done is done: it stays off once the complaint is acknowledged,
            // until the refreshed list takes the row away.
            disabled={acknowledge.isPending || acknowledge.isSuccess}
            onClick={() => acknowledge.mutate(action.complaintId)}
            aria-label={`Acknowledge complaint ${task.kind === 'complaint' ? task.number : ''}`.trim()}
            className={cn(ROW_BUTTON, 'flex-1 md:flex-none')}
          >
            {acknowledge.isPending
              ? 'Acknowledging…'
              : acknowledge.isSuccess
                ? 'Acknowledged'
                : action.label}
          </button>
        )}
        {action?.kind === 'link' ? (
          <Link
            href={action.href}
            className={cn(ROW_BUTTON, 'flex-1 md:flex-none')}
          >
            {action.label}
          </Link>
        ) : (
          <Link
            href={line.href}
            aria-hidden="true"
            tabIndex={-1}
            className={cn(ROW_BUTTON, 'flex-1 md:flex-none')}
          >
            Open
          </Link>
        )}
      </div>
    </li>
  )
}

function NeedsAction({
  summary,
  now,
  onRetry,
  retrying,
}: {
  summary: AdminTodaySummary
  now: number
  onRetry: () => void
  retrying: boolean
}) {
  const [filter, setFilter] = useState<TodayFilter>('all')
  const tasks = filterTasks(summary.tasks, filter)
  // A source that failed is said at the top of the list, so a short list
  // never passes for a quiet day.
  const missing = missingTasksLine(summary.failed ?? [])
  const moreBookings = summary.more?.bookings ?? 0
  return (
    <section
      aria-labelledby="needs-action"
      className="min-w-0 rounded-[12px] border border-border bg-surface"
    >
      <div className="flex flex-col gap-2 border-b border-border px-3 py-3 md:flex-row md:items-center md:justify-between md:px-4">
        <h2
          id="needs-action"
          className="text-[15px] font-semibold text-text-primary"
        >
          Needs action
        </h2>
        <div
          role="group"
          aria-label="Show"
          className="-mx-1 flex gap-1 overflow-x-auto px-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {TODAY_FILTERS.map((option) => {
            const count = filterCount(summary.tasks, option.value)
            return (
              <button
                key={option.value}
                type="button"
                aria-pressed={filter === option.value}
                onClick={() => setFilter(option.value)}
                className={cn(
                  'min-h-9 shrink-0 rounded-[8px] px-2.5 text-[13px] font-medium transition-colors',
                  filter === option.value
                    ? 'bg-surface-elevated text-text-primary'
                    : 'text-text-secondary hover:text-text-primary'
                )}
              >
                {option.label} <span className="font-numeric">{count}</span>
              </button>
            )
          })}
        </div>
      </div>
      {missing && (
        <LoadError
          what={missing}
          onRetry={onRetry}
          retrying={retrying}
          className="m-3 rounded-[8px]"
        />
      )}
      {tasks.length === 0 && !missing ? (
        <p className="px-4 py-8 text-center text-[14px] text-text-secondary">
          {filter === 'all'
            ? 'Nothing is waiting on the team. Well done.'
            : 'Nothing here right now.'}
        </p>
      ) : (
        <ul aria-label="Open tasks, by deadline">
          {tasks.map((task) => (
            <TaskRow key={task.key} task={task} now={now} />
          ))}
        </ul>
      )}
      {/* The list is cut short by the API; the rest are a tap away. */}
      {moreBookings > 0 && (filter === 'all' || filter === 'bookings') && (
        <Link
          href="/bookings?status=pending"
          className="flex min-h-11 items-center justify-center gap-1 border-t border-border px-4 text-[13px] font-medium text-text-primary hover:underline"
        >
          +{formatCount(moreBookings)} more waiting for their garage
          <IconArrowRight size={14} aria-hidden="true" />
        </Link>
      )}
    </section>
  )
}

function ComingUp({
  summary,
  onRetry,
  retrying,
}: {
  summary: AdminTodaySummary
  onRetry: () => void
  retrying: boolean
}) {
  return (
    <section
      aria-labelledby="coming-up"
      className="rounded-[12px] border border-border bg-surface"
    >
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <h2
          id="coming-up"
          className="text-[15px] font-semibold text-text-primary"
        >
          Coming up today
        </h2>
        <Link
          href="/bookings"
          className="inline-flex min-h-9 items-center gap-1 text-[13px] text-text-secondary hover:text-text-primary"
        >
          All bookings <IconArrowRight size={14} aria-hidden="true" />
        </Link>
      </div>
      {failedIn(summary)('schedule') ? (
        <LoadError
          what="today’s bookings"
          onRetry={onRetry}
          retrying={retrying}
          className="m-3 rounded-[8px]"
        />
      ) : summary.schedule.length === 0 ? (
        <p className="px-4 py-6 text-[13px] text-text-secondary">
          No bookings today.
        </p>
      ) : (
        <ul className="flex max-h-[360px] flex-col overflow-y-auto">
          {summary.schedule.map((row) => {
            const badge = bookingStatusBadge(row.status)
            return (
              <li
                key={row.id}
                className="relative flex items-center gap-3 border-b border-border px-4 py-2.5 last:border-b-0"
              >
                <span className="w-[62px] shrink-0 font-numeric text-[13px] text-text-secondary">
                  {formatTime(row.scheduledAt)}
                </span>
                <Link
                  href={`/bookings/${row.id}`}
                  className="min-w-0 flex-1 truncate text-[13px] text-text-primary after:absolute after:inset-0 hover:underline"
                >
                  {row.customerName ?? `#${row.reference}`}
                  {row.services && (
                    <span className="text-text-secondary">
                      {' '}
                      · {row.services}
                    </span>
                  )}
                </Link>
                <ScBadge variant={badge.variant}>{badge.label}</ScBadge>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}

function GaragesCard({
  summary,
  onRetry,
  retrying,
}: {
  summary: AdminTodaySummary
  onRetry: () => void
  retrying: boolean
}) {
  const cells: Array<{
    label: string
    value: number
    href: string
    warn?: boolean
  }> = [
    { label: 'Live', value: summary.garages.live, href: '/vendors' },
    {
      label: 'Blocked from going live',
      value: summary.garages.blocked,
      href: '/vendors?show=notlive',
      warn: true,
    },
    {
      label: 'Paused bookings',
      value: summary.garages.paused,
      href: '/vendors?show=paused',
    },
    {
      label: 'Documents to review',
      value: summary.garages.documentsToReview,
      href: '/vendors?show=documents',
      warn: true,
    },
  ]
  return (
    <section
      aria-labelledby="garages-today"
      className="rounded-[12px] border border-border bg-surface"
    >
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <h2
          id="garages-today"
          className="text-[15px] font-semibold text-text-primary"
        >
          Garages
        </h2>
        <Link
          href="/vendors?show=all"
          className="inline-flex min-h-9 items-center gap-1 text-[13px] text-text-secondary hover:text-text-primary"
        >
          All garages <IconArrowRight size={14} aria-hidden="true" />
        </Link>
      </div>
      {failedIn(summary)('garages') ? (
        <LoadError
          what="the garages"
          onRetry={onRetry}
          retrying={retrying}
          className="m-3 rounded-[8px]"
        />
      ) : (
        <div className="grid grid-cols-2 gap-2 p-3">
          {cells.map((cell) => (
            <Link
              key={cell.label}
              href={cell.href}
              className="flex flex-col gap-0.5 rounded-[8px] border border-border p-3 transition-colors hover:bg-surface-elevated"
            >
              <span
                className={cn(
                  'font-numeric text-[20px] font-semibold',
                  cell.warn && cell.value > 0
                    ? 'text-warning'
                    : 'text-text-primary'
                )}
              >
                {cell.value}
              </span>
              <span className="text-[12px] text-text-secondary">
                {cell.label}
              </span>
            </Link>
          ))}
        </div>
      )}
    </section>
  )
}

function TodaySkeleton() {
  return (
    <div
      className="flex flex-col gap-4"
      aria-busy="true"
      aria-label="Loading today"
    >
      <Skeleton className="h-9 w-64" />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-24" />
        ))}
      </div>
      <Skeleton className="h-80" />
    </div>
  )
}

/**
 * Today: the panel's first screen (UX audit, admin mockup 02). Every open
 * task with a clock on it, from the pages' own server rules, in one list
 * ordered by deadline with its action; four headline numbers; the day's
 * schedule; and the garages' state. Refreshed every minute.
 */
export default function TodayPage() {
  // useSearchParams (?list=, ?view=) needs a Suspense boundary, or Next.js
  // refuses to prerender the page.
  return (
    <Suspense fallback={<TodaySkeleton />}>
      <TodayScreen />
    </Suspense>
  )
}

/**
 * Today's three views: the inbox (the default), Mine (my collection lists,
 * mockup 07 panel 5) and All lists (everyone's; the shared login has none of
 * its own). `?list=<id>` opens the list, in Mine when it is mine.
 */
function TodayScreen() {
  const params = useSearchParams()
  const listParam = params.get('list')
  const collection = useTodayCollection(listParam)
  const [picked, setPicked] = useState<TodayView | null>(null)
  const view =
    picked ?? parseTodayView(params.get('view')) ?? collection.defaultView

  const switcher = collection.available ? (
    <TodayViewSwitch
      value={view}
      onChange={setPicked}
      mineCount={collection.mine.data ? collection.mineLists.length : null}
      allCount={collection.all.data ? collection.all.data.lists.length : null}
    />
  ) : null

  if (view === 'inbox') {
    return (
      <TodayInbox
        switcher={switcher}
        banner={
          <MyListsBanner
            lists={collection.mineLists}
            onOpen={() => setPicked('mine')}
          />
        }
      />
    )
  }

  const query = view === 'mine' ? collection.mine : collection.all
  return (
    <>
      <header className="flex flex-col gap-1">
        <h1 className="text-[24px] font-semibold tracking-[-0.01em] text-text-primary md:text-[28px]">
          {view === 'mine' ? 'My collection lists' : 'Collection lists'}
        </h1>
        <p className="text-[13px] text-text-secondary">
          {query.data
            ? listsLine(query.data.lists)
            : 'Things to collect from garages, ticked as they come in'}
        </p>
      </header>
      {switcher}
      <CollectionLists
        view={view}
        query={query}
        highlight={listParam}
        onShowAll={() => setPicked('all')}
      />
    </>
  )
}

function TodayInbox({
  switcher,
  banner,
}: {
  switcher: React.ReactNode
  banner: React.ReactNode
}) {
  const router = useRouter()
  const { data, error, isPending, refetch, isRefetching, dataUpdatedAt } =
    useAdminToday()
  const now = useNow(30_000)

  useEffect(() => {
    if (isAuthError(error)) router.replace('/login')
  }, [error, router])

  if (isPending) return <TodaySkeleton />
  if (!data) {
    return (
      <>
        {switcher}
        <LoadError
          what="today’s tasks"
          onRetry={() => void refetch()}
          retrying={isRefetching}
        />
      </>
    )
  }

  const late = data.counts.today.late
  return (
    <>
      <header className="flex flex-wrap items-end justify-between gap-x-4 gap-y-1">
        <div className="min-w-0">
          <p className="text-[13px] text-text-secondary">
            {longDate(data.now)}
          </p>
          <h1 className="text-[24px] font-semibold tracking-[-0.01em] text-text-primary md:text-[28px]">
            {inboxTitle(data.tasks.length)}
          </h1>
          <p
            className={cn(
              'text-[13px]',
              late > 0 ? 'text-tone-late-text' : 'text-text-secondary'
            )}
          >
            {inboxSubtitle(late, data.tasks.length)}
          </p>
        </div>
        <p role="status" className="text-[12px] text-text-secondary">
          {error ? (
            <span className="text-warning">Couldn’t refresh. </span>
          ) : null}
          Updated{' '}
          <span className="font-numeric">
            {formatTime(new Date(dataUpdatedAt))}
          </span>
          {isRefetching ? ' · refreshing…' : ' · refreshes every minute'}
        </p>
      </header>

      {switcher}
      {banner}

      <Headline summary={data} />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <NeedsAction
          summary={data}
          now={now}
          onRetry={() => void refetch()}
          retrying={isRefetching}
        />
        <div className="flex flex-col gap-4">
          <ComingUp
            summary={data}
            onRetry={() => void refetch()}
            retrying={isRefetching}
          />
          <GaragesCard
            summary={data}
            onRetry={() => void refetch()}
            retrying={isRefetching}
          />
        </div>
      </div>
    </>
  )
}
