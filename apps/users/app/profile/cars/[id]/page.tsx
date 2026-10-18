'use client'

import { use, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  IconCalendarCheck,
  IconCar,
  IconChevronRight,
  IconFileInvoice,
  IconHistory,
  IconPhoto,
  IconSparkles,
} from '@tabler/icons-react'
import { toast } from 'react-toastify'
import { ScButton } from '@repo/ui/sc/button'
import { ScButtonLink } from '@repo/ui/sc/button-link'
import { ScCard } from '@repo/ui/sc/card'
import { Chip } from '@repo/ui/sc/chip'
import { EmptyState, ErrorState, SkeletonCard } from '@repo/ui/sc/empty-state'
import { StatTile } from '@repo/ui/sc/stat-tile'
import { TopBar } from '@repo/ui/sc/top-bar'
import { ApiError } from '@repo/core/api/client'
import type { CarHistoryItem, ServiceReminder } from '@repo/core/api/car-history'
import { useCarHistory, useServiceReminderAction } from '@repo/core/api/hooks/use-car-history'
import {
  canSnoozeReminder,
  historyDateLabel,
  reminderBookHref,
  reminderDueLine,
  servicesLine,
  sinceLabel,
  washCount,
} from '@repo/core/car-history'
import { categoryLabel } from '@repo/core/categories'
import { formatRupees } from '@repo/core/job-records'
import { useAuthStore } from '@repo/core/stores/auth-store'
import { usePendingCheckoutStore } from '@repo/core/stores/pending-checkout-store'
import type { ServiceCategory } from '@repo/core/types'
import { cn } from '@repo/core/utils'
import { CustomerShell } from '@/components/customer-shell'
import { isHomeHubEnabled } from '@/lib/home-hub'

/**
 * The card's own link, stretched over the whole card (as on My bookings), so
 * a tap anywhere opens the booking while Receipt and Photos stay their own
 * targets above it.
 */
const CARD_LINK = cn(
  'focus-visible:outline-none',
  "after:absolute after:-inset-px after:rounded-[14px] after:content-['']",
  'focus-visible:after:ring-2 focus-visible:after:ring-text-primary/70'
)

/** Quiet text links in a card's foot: Receipt, Photos. 44px tall to the thumb. */
const FOOT_LINK =
  'relative z-10 inline-flex min-h-11 items-center gap-1.5 rounded-[8px] px-2 text-[12px] font-semibold text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-text-primary/70'

const money = (amount: string) => formatRupees(Number(amount))

/**
 * Profile → My cars → a car (also the history button on Home's car): every
 * job done on it, newest first, each booking once however often it was
 * moved, with what was paid and links to the booking, its receipt and its
 * before & after photos; this year's washes and spend; a filter by service;
 * and the car's next coating or detailing follow-up (API 0046), with Book,
 * Remind me in 2 weeks and Dismiss.
 *
 * Cancelled bookings are left out on purpose: nothing was done to the car,
 * and My bookings already has them with their refunds. The page says how
 * many and links there.
 */
export default function CarHistoryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()
  const user = useAuthStore((s) => s.user)
  const ready = useAuthStore((s) => s.isSessionReady)
  const rememberCar = usePendingCheckoutStore((s) => s.rememberCar)
  const [category, setCategory] = useState<ServiceCategory | null>(null)
  const history = useCarHistory(id, category, { enabled: !!user })
  const now = new Date()

  // Checkout opens with this car chosen.
  const chooseThisCar = () => {
    if (user) rememberCar({ userId: user.id, vehicleId: id })
  }

  if (ready && !user) {
    return (
      <CustomerShell showNav showBrand className="gap-4 py-4">
        <TopBar title="Car history" showBack backHref="/profile" large={isHomeHubEnabled()} />
        <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
          <p className="text-[15px] font-semibold text-text-primary">Sign in to see your car&apos;s history</p>
          <ScButton
            className="mt-2 w-auto px-8"
            onClick={() => router.push(`/login?next=${encodeURIComponent(`/profile/cars/${id}`)}`)}
          >
            Sign in
          </ScButton>
        </div>
      </CustomerShell>
    )
  }

  const data = history.data
  const notFound = history.error instanceof ApiError && history.error.status === 404
  const carName = data ? `${data.car.make} ${data.car.model}` : 'Car history'

  return (
    <CustomerShell showNav showBrand className="gap-4 py-4">
      <TopBar title={carName} showBack backHref="/profile#vehicles" large={isHomeHubEnabled()} />

      {!ready || history.isPending ? (
        <div className="flex flex-col gap-3" aria-busy="true">
          <SkeletonCard />
          <SkeletonCard />
        </div>
      ) : notFound ? (
        <EmptyState
          icon={<IconCar size={32} stroke={1.5} />}
          title="This car isn't in your garage"
          subtitle="It may have been removed. Your cars are in Profile."
          actionLabel="Go to Profile"
          onAction={() => router.push('/profile#vehicles')}
        />
      ) : !data ? (
        <ErrorState
          message="Couldn't load this car's history. Check your connection."
          onRetry={() => void history.refetch()}
        />
      ) : (
        <>
          <p className="-mt-2 flex items-center gap-1.5 text-[12px] text-text-secondary">
            <IconHistory size={14} aria-hidden="true" />
            Service history{data.car.licensePlate ? ` · ${data.car.licensePlate}` : ''}
          </p>

          {data.reminder && (
            <ReminderCard reminder={data.reminder} now={now} onBook={chooseThisCar} />
          )}

          {/* Totals of what is listed: with a filter on, of that service.
              A car with no history has the empty state instead of zeros. */}
          {(data.items.length > 0 || category) && (
            <div className="grid grid-cols-2 gap-2">
              <StatTile label="Washes this year" value={data.totals.washesThisYear} />
              <StatTile label="Spent this year" value={money(data.totals.spentThisYear)} />
            </div>
          )}
          {data.totals.since && (
            <p className="-mt-2 text-[11px] text-text-secondary">
              <span className="font-numeric font-medium text-text-primary">{money(data.totals.spentTotal)}</span>{' '}
              on {washCount(data.totals.washesTotal)} since {sinceLabel(data.totals.since)}
            </p>
          )}

          {data.categories.length > 1 && (
            <div role="group" aria-label="Filter by service" className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
              <Chip label="All" selected={category === null} onClick={() => setCategory(null)} />
              {data.categories.map((each) => (
                <Chip
                  key={each}
                  label={categoryLabel(each)}
                  selected={category === each}
                  onClick={() => setCategory(each)}
                />
              ))}
            </div>
          )}

          {data.items.length === 0 ? (
            category ? (
              <ScCard>
                <p className="text-[12px] text-text-secondary">
                  No {categoryLabel(category).toLowerCase()} jobs for this car yet.
                </p>
              </ScCard>
            ) : (
              <EmptyState
                icon={<IconHistory size={32} stroke={1.5} />}
                title="No washes yet"
                subtitle="Every job done on this car will be listed here, with its receipt and photos."
                actionLabel="Book a wash"
                onAction={() => {
                  chooseThisCar()
                  router.push('/garages')
                }}
              />
            )
          ) : (
            <ul aria-label={`Jobs on your ${carName}, newest first`} className="flex flex-col gap-2">
              {data.items.map((item) => (
                <li key={item.bookingId}>
                  <HistoryCard item={item} now={now} />
                </li>
              ))}
            </ul>
          )}

          {data.cancelledCount > 0 && (
            <p className="text-[11px] text-text-secondary">
              {data.cancelledCount === 1
                ? '1 cancelled booking for this car isn’t listed here.'
                : `${data.cancelledCount} cancelled bookings for this car aren’t listed here.`}{' '}
              <Link href="/bookings?tab=past" className="font-medium text-text-primary underline underline-offset-2">
                See My bookings
              </Link>
            </p>
          )}
        </>
      )}
    </CustomerShell>
  )
}

function HistoryCard({ item, now }: { item: CarHistoryItem; now: Date }) {
  const date = historyDateLabel(item.doneAt, now)
  const services = servicesLine(item.services)
  const photos = item.photos.before + item.photos.after
  return (
    <ScCard className="press relative flex flex-col gap-2">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[13px] font-semibold text-text-primary">
            <Link
              href={`/bookings/${item.bookingId}`}
              aria-label={`${services} at ${item.vendorName}, ${date}, ${money(item.amountPaid)}`}
              className={CARD_LINK}
            >
              {services}
            </Link>
          </p>
          <p className="truncate text-[11px] text-text-secondary">{item.vendorName}</p>
        </div>
        <span className="shrink-0 font-numeric text-[13px] font-bold text-text-primary">{money(item.amountPaid)}</span>
      </div>
      <div className="-mb-2 flex items-center justify-between border-t border-border pt-0.5">
        <span className="font-numeric text-[11px] font-medium text-text-secondary">{date}</span>
        <span className="-mr-2 flex items-center">
          {item.receiptAvailable && (
            <Link
              href={`/bookings/${item.bookingId}/receipt`}
              aria-label={`Receipt: ${services}, ${date}`}
              className={FOOT_LINK}
            >
              <IconFileInvoice size={14} aria-hidden="true" />
              Receipt
            </Link>
          )}
          {photos > 0 && (
            <Link
              href={`/bookings/${item.bookingId}#job-photos`}
              aria-label={`Before and after photos: ${services}, ${date}`}
              className={FOOT_LINK}
            >
              <IconPhoto size={14} aria-hidden="true" />
              Photos
            </Link>
          )}
        </span>
      </div>
    </ScCard>
  )
}

/**
 * The car's next coating or detailing follow-up. Book searches the service
 * that answers it, with this car chosen; booking it marks it done. Remind me
 * in 2 weeks shows once it is close (within a week, or overdue).
 */
function ReminderCard({ reminder, now, onBook }: { reminder: ServiceReminder; now: Date; onBook: () => void }) {
  const action = useServiceReminderAction()
  const run = (kind: 'dismiss' | 'snooze') =>
    action.mutate(
      { reminderId: reminder.id, action: kind },
      {
        onSuccess: () => toast.success(kind === 'dismiss' ? 'Reminder dismissed' : 'Snoozed for 2 weeks'),
        onError: (err) => toast.error(err instanceof Error ? err.message : 'Something went wrong'),
      }
    )
  const booked = reminder.state === 'booked' && reminder.booked
  const due = reminder.state === 'due' || reminder.state === 'overdue'

  return (
    <ScCard aria-label={`Reminder: ${reminder.title}`} role="region" className="flex flex-col gap-3">
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[8px] bg-surface-elevated">
          {booked ? (
            <IconCalendarCheck size={18} className="text-text-primary" aria-hidden="true" />
          ) : (
            <IconSparkles size={18} className="text-text-primary" aria-hidden="true" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-semibold text-text-primary">{reminder.title}</p>
          <p className={cn('text-[12px]', due ? 'text-warning' : 'text-text-secondary')}>
            {reminderDueLine(reminder, now)}
          </p>
          <p className="text-[11px] text-text-secondary">{reminder.reason}</p>
        </div>
      </div>
      {booked ? (
        <Link
          href={`/bookings/${reminder.booked!.bookingId}`}
          className="-my-1 inline-flex min-h-11 items-center gap-1 self-start text-[12px] font-semibold text-text-primary"
        >
          See the booking
          <IconChevronRight size={14} aria-hidden="true" />
        </Link>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <ScButtonLink
            href={reminderBookHref(reminder)}
            variant="secondary"
            fullWidth={false}
            className="px-5"
            onClick={onBook}
          >
            Book
          </ScButtonLink>
          {canSnoozeReminder(reminder) && (
            <button
              type="button"
              disabled={action.isPending}
              onClick={() => run('snooze')}
              className="min-h-11 px-2 text-[12px] font-medium text-text-secondary transition-colors hover:text-text-primary disabled:opacity-40"
            >
              Remind me in 2 weeks
            </button>
          )}
          <button
            type="button"
            disabled={action.isPending}
            onClick={() => run('dismiss')}
            aria-label={`Dismiss reminder: ${reminder.title}`}
            className="min-h-11 px-2 text-[12px] font-medium text-text-secondary transition-colors hover:text-text-primary disabled:opacity-40"
          >
            Dismiss
          </button>
        </div>
      )}
    </ScCard>
  )
}
