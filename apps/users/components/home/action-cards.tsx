'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  IconArrowUpRight,
  IconBuildingStore,
  IconCalendarOff,
  IconCalendarQuestion,
  IconMessageCheck,
  IconCar,
  IconReceipt,
  IconSparkles,
  IconStar,
  IconTool,
  IconX,
} from '@tabler/icons-react'
import { ScButtonLink } from '@repo/ui/sc/button-link'
import type { HomeActionCard } from '@repo/core/api/home'
import { reminderBookHref, reminderDueLine } from '@repo/core/car-history'
import { bookingDayLabel, istClock } from '@repo/core/home-display'
import { formatRupees } from '@repo/core/job-records'
import { cn } from '@repo/core/utils'

type BillCard = Extract<HomeActionCard, { kind: 'bill_due' }>
type ProposalCard = Extract<HomeActionCard, { kind: 'time_proposal' }>
type ExtraWorkDueCard = Extract<HomeActionCard, { kind: 'extra_work_due' }>
type ClosedCard = Extract<HomeActionCard, { kind: 'garage_closed' }>
type RateCard = Extract<HomeActionCard, { kind: 'rate' }>
type ComplaintCard = Extract<HomeActionCard, { kind: 'complaint_resolved' }>
type ServiceReminderCardData = Extract<HomeActionCard, { kind: 'service_reminder' }>

/** Profile's My complaints, where the team's answer is (lib/home-updates.ts MY_COMPLAINTS_PATH). */
export const MY_COMPLAINTS_PATH = '/profile#my-complaints'

/**
 * Where each card's buttons go: the booking's own page, which already does
 * the paying, moving and helping. `then` opens the right part of it.
 */
export const bookingActionPath = (
  bookingId: string,
  then?: 'pay' | 'reschedule' | 'help' | 'times' | 'extra'
) =>
  `/bookings/${bookingId}${then ? `?then=${then}` : ''}`

function Eyebrow({ vendorName, icon: Icon }: { vendorName: string; icon: typeof IconReceipt }) {
  return (
    <div className="flex h-5 items-center justify-between gap-3">
      <span className="flex min-w-0 items-center gap-1.5 text-[13px] text-dim">
        <IconBuildingStore size={15} stroke={1.5} aria-hidden className="shrink-0 text-text-muted" />
        <span className="truncate">{vendorName}</span>
      </span>
      <Icon size={20} stroke={1.5} aria-hidden className="shrink-0 text-dim" />
    </div>
  )
}

/** "Today", or the IST day the bill was raised. */
function raisedLabel(iso: string, now: Date): string {
  const day = bookingDayLabel(iso)
  return day === bookingDayLabel(now.toISOString()) ? 'Today' : day
}

/**
 * A final bill to pay. Must-act: it sits above the offers and cannot be
 * closed. "Pay ₹X" is the screen's one red action while it shows, so Book a
 * wash steps down to an outline (CarHero). Paying happens on the booking's
 * page, through the bill flow that already exists there.
 */
export function BillDueCard({
  card,
  now,
  quiet = false,
}: {
  card: BillCard
  now: Date
  /** Another bill above already carries the screen's one red button. */
  quiet?: boolean
}) {
  const amount = formatRupees(Number(card.amountDue))
  return (
    <section aria-label={`Final bill from ${card.vendorName}`} className="hub-card p-5">
      <Eyebrow vendorName={card.vendorName} icon={IconReceipt} />
      <div className="mt-3.5 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[17px] font-medium tracking-[-0.012em] text-text-primary">Final bill</p>
          <p className="mt-1 truncate text-[13px] text-dim">
            {card.serviceName} · {raisedLabel(card.raisedAt, now)}
          </p>
        </div>
        {quiet ? (
          <OutlineLink href={bookingActionPath(card.bookingId, 'pay')} className="shrink-0">
            Pay&nbsp;<span className="font-numeric">{amount}</span>
          </OutlineLink>
        ) : (
          <ScButtonLink
            href={bookingActionPath(card.bookingId, 'pay')}
            variant="hero"
            className="h-12 shrink-0 px-5"
            aria-label={`Pay ${amount}`}
          >
            <span>
              Pay <span className="font-numeric">{amount}</span>
            </span>
            <IconArrowUpRight size={17} stroke={1.5} aria-hidden />
          </ScButtonLink>
        )}
      </div>
      {card.moreDue > 0 && (
        <Link
          href="/updates"
          className="mt-2 inline-flex min-h-11 items-center text-[13px] text-text-muted underline underline-offset-2"
        >
          +{card.moreDue} more to pay
        </Link>
      )}
    </section>
  )
}

/**
 * The garage can't do the booked time and suggested others (0041). Must-act,
 * first of all: unanswered by the time it shows, the booking is cancelled
 * with a full refund. "Pick a time" is the screen's one red action; the
 * times themselves are chosen on the booking's page, which also has "None of
 * these work".
 */
export function TimeProposalHomeCard({ card }: { card: ProposalCard }) {
  return (
    <section aria-label={`${card.vendorName} suggested other times`} className="hub-card p-5">
      <Eyebrow vendorName={card.vendorName} icon={IconCalendarQuestion} />
      <p className="mt-3.5 text-[17px] font-medium tracking-[-0.012em] text-text-primary">
        Can&apos;t do <span className="font-numeric">{istClock(new Date(card.scheduledAt))}</span> — pick another time
      </p>
      <p className="mt-1 text-[13px] text-dim">
        {card.options.length === 1 ? '1 time' : `${card.options.length} times`} offered · answer by{' '}
        <span className="font-numeric">
          {bookingDayLabel(card.expiresAt)}, {istClock(new Date(card.expiresAt))}
        </span>
      </p>
      <div className="mt-4">
        <ScButtonLink
          href={bookingActionPath(card.bookingId, 'times')}
          variant="hero"
          className="h-12 px-5"
        >
          <span>Pick a time</span>
          <IconArrowUpRight size={17} stroke={1.5} aria-hidden />
        </ScButtonLink>
      </div>
    </section>
  )
}

/**
 * Extra work the garage asks for (0041), waiting for "Approve & pay". The
 * garage has the car and is waiting, so it comes before a bill. Approving
 * and paying happen on the booking's page, with the photos.
 */
export function ExtraWorkHomeCard({ card, now }: { card: ExtraWorkDueCard; now: Date }) {
  const amount = formatRupees(Number(card.amount))
  return (
    <section aria-label={`Extra work from ${card.vendorName}`} className="hub-card p-5">
      <Eyebrow vendorName={card.vendorName} icon={IconTool} />
      <div className="mt-3.5 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[17px] font-medium tracking-[-0.012em] text-text-primary">Extra work to approve</p>
          <p className="mt-1 truncate text-[13px] text-dim">
            {card.description} · {raisedLabel(card.raisedAt, now)}
          </p>
        </div>
        <ScButtonLink
          href={bookingActionPath(card.bookingId, 'extra')}
          variant="hero"
          className="h-12 shrink-0 px-5"
          aria-label={`Review ${amount}`}
        >
          <span>
            Review <span className="font-numeric">{amount}</span>
          </span>
          <IconArrowUpRight size={17} stroke={1.5} aria-hidden />
        </ScButtonLink>
      </div>
      {card.moreDue > 0 && (
        <Link
          href="/updates"
          className="mt-2 inline-flex min-h-11 items-center text-[13px] text-text-muted underline underline-offset-2"
        >
          +{card.moreDue} more to answer
        </Link>
      )}
    </section>
  )
}

/**
 * The garage is shut on the day of an upcoming booking (a holiday, or its
 * weekly day off). Change time only while the booking can still be moved —
 * the server says so, and says no while the garage is paused, since a paused
 * garage refuses every move. Get help is always there. Both outlined: the
 * screen's red is still Book a wash.
 */
export function GarageClosedCard({ card }: { card: ClosedCard }) {
  const at = new Date(card.scheduledAt)
  return (
    <section aria-label={`${card.vendorName} is closed on your booking day`} className="hub-card p-5">
      <Eyebrow vendorName={card.vendorName} icon={IconCalendarOff} />
      <p className="mt-3.5 text-[17px] font-medium tracking-[-0.012em] text-text-primary">
        Closed on {bookingDayLabel(card.scheduledAt)}
      </p>
      <p className="mt-1 text-[13px] text-dim">
        {card.reason === 'holiday' ? 'A holiday' : 'Its weekly day off'}, the day of your{' '}
        <span className="font-numeric">{istClock(at)}</span> booking.
        {card.canChangeTime ? ' Pick another time, or ask us for help.' : ' Ask us for help with it.'}
      </p>
      <div className="mt-4 flex gap-2">
        {card.canChangeTime && (
          <OutlineLink href={bookingActionPath(card.bookingId, 'reschedule')}>Change time</OutlineLink>
        )}
        <OutlineLink href={bookingActionPath(card.bookingId, 'help')}>Get help</OutlineLink>
      </div>
    </section>
  )
}

/** Button style 2 of 3: the outlined pill. */
export function OutlineLink({
  href,
  children,
  className,
  onClick,
}: {
  href: string
  children: React.ReactNode
  className?: string
  onClick?: () => void
}) {
  return (
    <Link
      href={href}
      onClick={onClick}
      className={cn(
        'press inline-flex h-11 items-center justify-center rounded-pill border border-stroke bg-white/[0.015] px-5 text-[15px] font-medium tracking-[-0.005em] text-text-primary',
        className
      )}
    >
      {children}
    </Link>
  )
}

/**
 * "Rate your wash": a soft card, below the offers, only when nothing is
 * must-act, and on Updates' To do. It asks "How was your wash at <garage>?"
 * for a job done in the last 14 days with no review yet (the server decides:
 * lib/home-cards.ts rateCards). A star opens the booking's own rating form
 * with that many stars already chosen, so one stray tap never posts a
 * review. × closes it for good, on every device (the booking's
 * review_prompt_dismissed_at). The region keeps its name, "Rate your wash".
 */
export function RateWashCard({
  card,
  onDismiss,
  dismissing,
}: {
  card: RateCard
  onDismiss: () => void
  dismissing?: boolean
}) {
  const router = useRouter()
  return (
    <section aria-label="Rate your wash" className="hub-card pt-1 pr-1.5 pb-2 pl-5">
      <div className="flex items-center gap-2">
        <div className="min-w-0 flex-1 pt-3">
          {/* Two lines at most: a long garage name wraps rather than losing
              the question mark. */}
          <p className="line-clamp-2 text-[15px] font-medium tracking-[-0.01em] text-text-primary">
            How was your wash at {card.vendorName}?
          </p>
          <p className="truncate text-[13px] text-dim">{card.vehicleName} · Rate it</p>
        </div>
        <button
          type="button"
          aria-label="Hide Rate your wash"
          disabled={dismissing}
          onClick={onDismiss}
          className="grid size-11 shrink-0 place-items-center self-start text-dim"
        >
          <IconX size={20} stroke={1.5} aria-hidden />
        </button>
      </div>
      {/* Their own row, so each star is a full 44pt target. */}
      <div className="-ml-2.5 mt-1 flex text-[#C9C9CF]">
        {[1, 2, 3, 4, 5].map((stars) => (
          <button
            key={stars}
            type="button"
            aria-label={`Rate ${stars} star${stars === 1 ? '' : 's'}`}
            onClick={() => router.push(`/bookings/${card.bookingId}?rate=${stars}`)}
            className="grid size-11 place-items-center"
          >
            <IconStar size={24} stroke={1.3} aria-hidden />
          </button>
        ))}
      </div>
    </section>
  )
}

/**
 * "Complaint C-000123 resolved": a soft card, in Rate your wash's place,
 * only when that place is free (no must-act card, no rating to ask), for a
 * week after the answer while it is unread in Updates. Opening Updates reads
 * it and the card goes; the answer stays in My complaints. Outlined: the
 * screen's red is still Book a wash.
 */
export function ComplaintAnswerCard({ card }: { card: ComplaintCard }) {
  return (
    <section aria-label={`Complaint ${card.number} resolved`} className="hub-card p-5">
      <div className="flex h-5 items-center justify-between gap-3">
        <span className="font-numeric text-[13px] text-dim">{card.number}</span>
        <IconMessageCheck size={20} stroke={1.5} aria-hidden className="shrink-0 text-dim" />
      </div>
      <div className="mt-3.5 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[17px] font-medium tracking-[-0.012em] text-text-primary">Complaint resolved</p>
          <p className="mt-1 truncate text-[13px] text-dim">We&apos;ve answered it.</p>
        </div>
        <OutlineLink href={MY_COMPLAINTS_PATH} className="shrink-0">
          See our answer
        </OutlineLink>
      </div>
    </section>
  )
}

/**
 * A coating or detailing follow-up coming due on one of their cars (API
 * 0046): the softest card, in Rate your wash's place only when nothing else
 * wants it (the server decides: lib/home-cards.ts softCardWithReminder).
 * Book searches the service that answers it, with that car chosen (booking
 * it marks it done); "In 2 weeks" snoozes it; × dismisses it for good. All
 * outlined or plain: the screen's red is still Book a wash. The car's page
 * has the rest.
 */
export function ServiceReminderHomeCard({
  card,
  now,
  onBook,
  onSnooze,
  onDismiss,
  busy,
}: {
  card: ServiceReminderCardData
  now: Date
  onBook: () => void
  onSnooze: () => void
  onDismiss: () => void
  busy?: boolean
}) {
  return (
    <section aria-label={card.title} className="hub-card pt-1 pr-1.5 pb-4 pl-5">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1 pt-4">
          <Link
            href={`/profile/cars/${card.vehicleId}`}
            className="flex h-5 min-w-0 items-center gap-1.5 text-[13px] text-dim"
          >
            <IconCar size={15} stroke={1.5} aria-hidden className="shrink-0 text-text-muted" />
            <span className="truncate">{card.vehicleName}</span>
          </Link>
          <p className="mt-3 text-[17px] font-medium tracking-[-0.012em] text-text-primary">{card.title}</p>
          <p className="mt-1 text-[13px] text-dim">
            {reminderDueLine({ ...card, booked: null }, now)} · {card.reason}
          </p>
        </div>
        <button
          type="button"
          aria-label={`Dismiss reminder: ${card.title}`}
          disabled={busy}
          onClick={onDismiss}
          className="grid size-11 shrink-0 place-items-center text-dim"
        >
          <IconX size={20} stroke={1.5} aria-hidden />
        </button>
      </div>
      <div className="mt-4 flex items-center gap-2 pr-3.5">
        <OutlineLink href={reminderBookHref(card)} onClick={onBook}>
          <IconSparkles size={16} stroke={1.5} aria-hidden className="mr-1.5" />
          Book
        </OutlineLink>
        <button
          type="button"
          disabled={busy}
          onClick={onSnooze}
          aria-label="Remind me in 2 weeks"
          className="inline-flex h-11 items-center px-3 text-[15px] text-dim disabled:opacity-40"
        >
          In 2 weeks
        </button>
      </div>
    </section>
  )
}
