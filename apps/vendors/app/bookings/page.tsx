'use client'

import {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import {
  IconAlarm,
  IconCalendarCheck,
  IconCalendarEvent,
  IconChevronRight,
  IconCircleCheck,
  IconInbox,
} from '@tabler/icons-react'
import { GraphiteSwitch } from '@repo/ui/finish/graphite-switch'
import { AppShell } from '@repo/ui/sc/app-shell'
import { EmptyState } from '@repo/ui/sc/empty-state'
import { LoadError } from '@repo/ui/sc/load-error'
import { SkeletonList } from '@repo/ui/sc/skeleton'
import { useNow } from '@repo/core/hooks/use-now'
import { BookingsCalendar } from '@/components/bookings-calendar'
import { GarageStatus } from '@/components/garage-status'
import { JobRow } from '@/components/job-row'
import { NewBookingCard } from '@/components/new-booking-card'
import { PushBanner } from '@/components/push-banner'
import { useVendorBookings } from '@/lib/use-vendor-bookings'
import {
  bookingsTabFromQuery,
  bookingsTabLines,
  calendarDate,
  doneJobs,
  doneTodayCount,
  laterDays,
  LIST_TABS,
  sortByUrgency,
  todayView,
  waitingSummary,
  type BookingsTab,
  type ListTab,
} from '@/lib/jobs'

const TAB_LABELS: Record<ListTab, string> = {
  today: 'Today',
  new: 'New',
  later: 'Later',
  done: 'Done',
}

/** What an empty list says, in the garage's words. */
const EMPTY: Record<
  ListTab,
  { icon: React.ReactNode; title: string; subtitle: string }
> = {
  today: {
    icon: <IconCalendarCheck size={28} stroke={1.5} />,
    title: 'Nothing on today',
    subtitle: 'Jobs you accept for today show here, in time order.',
  },
  new: {
    icon: <IconInbox size={28} stroke={1.5} />,
    title: 'No new bookings',
    subtitle: 'New requests from customers show up here for you to accept.',
  },
  later: {
    icon: <IconCalendarEvent size={28} stroke={1.5} />,
    title: 'Nothing later',
    subtitle: 'Jobs you accept for another day wait here.',
  },
  done: {
    icon: <IconCircleCheck size={28} stroke={1.5} />,
    title: 'Nothing done yet',
    subtitle: 'Finished jobs, and bookings that were cancelled, are kept here.',
  },
}

// useSearchParams needs a Suspense boundary for the page to prerender.
export default function VendorBookingsPage() {
  return (
    <Suspense fallback={null}>
      <VendorBookings />
    </Suspense>
  )
}

/**
 * Bookings (UX audit, garage findings 1, 4 and 9; mockup 02): Today first,
 * with the job under way on top and the day in time order, one short row
 * each; New, the bookings waiting for an answer, most urgent first; Later,
 * accepted jobs on other days under day headings; Done. Each job opens its
 * own page. Bookings still waiting for an answer stay pinned on top of every
 * other list, as one red row with the shortest deadline. The fifth,
 * icon-only segment is the Calendar (Month and Day) of the same jobs. The
 * switch is the customer app's graphite one (owner, 10 Nov 2026), each list
 * with its count as a quiet second line.
 */
function VendorBookings() {
  const router = useRouter()
  const searchParams = useSearchParams()
  // The list follows ?tab= whenever it changes (a link or a notification
  // to /bookings?tab=new while the page is open), not only on the first
  // render; a tap sets it at once and writes it to the address.
  const queryTab = bookingsTabFromQuery(searchParams.get('tab')) ?? 'today'
  const [tab, setTab] = useState<BookingsTab>(queryTab)
  const [seenQueryTab, setSeenQueryTab] = useState(queryTab)
  if (queryTab !== seenQueryTab) {
    setSeenQueryTab(queryTab)
    setTab(queryTab)
  }
  const { bookings, loaded, failed, reload } = useVendorBookings()
  const now = useNow(10_000)

  // A notification for an accepted job opens that job's page; one for a
  // new booking opens New, scrolled to it (0044): /bookings?tab=…#job-<id>.
  const scrolledTo = useRef<string | null>(null)
  useEffect(() => {
    const hash = window.location.hash
    if (!hash.startsWith('#job-') || scrolledTo.current === hash) return
    const id = hash.slice('#job-'.length)
    const job = bookings.find((b) => b.id === id)
    if (job && job.status !== 'pending') {
      scrolledTo.current = hash
      router.replace(`/bookings/${id}`)
      return
    }
    const card = document.getElementById(hash.slice(1))
    if (!card) return
    scrolledTo.current = hash
    card.scrollIntoView({ block: 'start' })
  }, [bookings, router, tab])

  const pending = useMemo(
    () =>
      sortByUrgency(
        bookings.filter((b) => b.status === 'pending'),
        now
      ),
    [bookings, now]
  )
  const waiting = useMemo(() => waitingSummary(pending, now), [pending, now])
  const today = useMemo(() => todayView(bookings, now), [bookings, now])
  const later = useMemo(() => laterDays(bookings, now), [bookings, now])
  const done = useMemo(() => doneJobs(bookings), [bookings])

  // A failed read is not an empty list: until one succeeds, counts are
  // unknown and none is shown.
  const unknown = failed && bookings.length === 0
  const counts: Record<ListTab, number> = {
    today: today.working.length + today.next.length,
    new: waiting.count,
    later: later.reduce((sum, group) => sum + group.jobs.length, 0),
    done: done.length,
  }
  // The second lines wait for the first read: until then every count is
  // unknown, and "0 jobs" would be a guess.
  const lines =
    unknown || (!loaded && bookings.length === 0)
      ? null
      : bookingsTabLines(counts, doneTodayCount(done, now))

  const pickTab = useCallback(
    (next: BookingsTab) => {
      setTab(next)
      router.replace(`/bookings?tab=${next}`, { scroll: false })
    },
    [router]
  )

  const isEmpty =
    tab === 'calendar'
      ? false
      : tab === 'today'
        ? counts.today === 0
        : tab === 'new'
          ? pending.length === 0
          : tab === 'later'
            ? counts.later === 0
            : counts.done === 0

  return (
    <AppShell
      showNav
      navType="vendor"
      showBrand
      brandRight={<GarageStatus />}
      className="gap-4 py-4"
    >
      <h1 className="sr-only">Bookings</h1>
      <PushBanner />

      <GraphiteSwitch<BookingsTab>
        aria-label="Bookings"
        value={tab}
        onChange={pickTab}
        options={[
          ...LIST_TABS.map((key) => ({
            value: key as BookingsTab,
            label: TAB_LABELS[key],
            quiet: lines?.[key],
            // What waits on the garage, in red, where the red badge was.
            quietTone:
              key === 'new' && waiting.count > 0 ? ('red' as const) : undefined,
          })),
          // The calendar: its icon, with the word small under it.
          {
            value: 'calendar' as const,
            label: 'Calendar',
            icon: <IconCalendarEvent stroke={1.9} />,
            iconOnly: true,
          },
        ]}
      />

      {tab !== 'new' && waiting.count > 0 && (
        <button
          type="button"
          onClick={() => pickTab('new')}
          className="press flex min-h-14 items-center gap-3 rounded-[20px] border border-brand-red/40 bg-brand-red/10 px-4 py-3 text-left"
        >
          <IconAlarm
            size={22}
            aria-hidden="true"
            className="shrink-0 text-brand-red"
          />
          <span className="min-w-0 flex-1 text-[16px] leading-snug text-text-primary">
            {waiting.count === 1
              ? '1 booking to answer'
              : `${waiting.count} bookings to answer`}
            {waiting.soonestMs !== null && (
              <>
                {' · '}
                <span className="font-numeric font-semibold text-warning">
                  {Math.max(1, Math.ceil(waiting.soonestMs / 60_000))} min
                </span>{' '}
                left{waiting.count > 1 ? ' on one' : ''}
              </>
            )}
          </span>
          <IconChevronRight
            size={20}
            aria-hidden="true"
            className="shrink-0 text-text-secondary"
          />
        </button>
      )}

      <div className="flex flex-col gap-3">
        {!loaded && bookings.length === 0 ? (
          <SkeletonList count={3} itemClassName="h-28" />
        ) : unknown ? (
          <LoadError what="your bookings" onRetry={reload} />
        ) : tab === 'calendar' ? (
          <BookingsCalendar bookings={bookings} now={now} />
        ) : isEmpty ? (
          <>
            <EmptyState {...EMPTY[tab]} />
            {tab === 'today' && today.tomorrow > 0 && (
              <TomorrowRow
                count={today.tomorrow}
                onOpen={() => pickTab('later')}
              />
            )}
          </>
        ) : tab === 'today' ? (
          <>
            {today.working.length > 0 && (
              <section
                aria-labelledby="today-now"
                className="flex flex-col gap-3"
              >
                <div className="flex items-baseline justify-between">
                  <h2
                    id="today-now"
                    className="text-[17px] font-semibold text-text-primary"
                  >
                    Now
                  </h2>
                  <p className="font-numeric text-[14px] text-text-secondary">
                    {calendarDate(now)}
                  </p>
                </div>
                {today.working.map((b) => (
                  <JobRow key={b.id} booking={b} now={now} showStep emphasis />
                ))}
              </section>
            )}
            {today.next.length > 0 && (
              <section
                aria-labelledby="today-next"
                className="flex flex-col gap-3"
              >
                <h2
                  id="today-next"
                  className="text-[17px] font-semibold text-text-primary"
                >
                  Next
                </h2>
                {today.next.map((b) => (
                  <JobRow key={b.id} booking={b} now={now} showStep />
                ))}
              </section>
            )}
            {today.tomorrow > 0 && (
              <TomorrowRow
                count={today.tomorrow}
                onOpen={() => pickTab('later')}
              />
            )}
          </>
        ) : tab === 'new' ? (
          pending.map((b) => (
            <NewBookingCard
              key={b.id}
              booking={b}
              now={now}
              onChanged={reload}
            />
          ))
        ) : tab === 'later' ? (
          later.map((group) => (
            <section
              key={group.day}
              aria-label={group.day}
              className="flex flex-col gap-3"
            >
              <h2 className="text-[17px] font-semibold text-text-primary">
                {group.day}
              </h2>
              {group.jobs.map((b) => (
                <JobRow key={b.id} booking={b} now={now} />
              ))}
            </section>
          ))
        ) : (
          done.map((b) => <JobRow key={b.id} booking={b} now={now} />)
        )}
      </div>
    </AppShell>
  )
}

/** Tomorrow, folded into one row that opens Later. */
function TomorrowRow({ count, onOpen }: { count: number; onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="press flex min-h-14 items-center justify-between rounded-[20px] border border-border bg-surface px-4 py-3 text-left text-[17px] text-text-primary"
    >
      <span>
        Tomorrow · <span className="font-numeric">{count}</span>{' '}
        {count === 1 ? 'job' : 'jobs'}
      </span>
      <IconChevronRight
        size={20}
        aria-hidden="true"
        className="text-text-secondary"
      />
    </button>
  )
}
