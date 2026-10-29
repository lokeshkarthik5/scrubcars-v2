'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { toast } from 'react-toastify'
import { ConfirmSheet } from '@repo/ui/sc/confirm-sheet'
import { IconChevronRight, IconConfetti, IconGift, IconX } from '@tabler/icons-react'
import { track } from '@repo/core/analytics'
import { useAreaStatus, useLeaveAreaList, useMarkBannerSeen } from '@repo/core/api/hooks/use-area'
import { markLaunchBannerSeen, type AreaSignup } from '@repo/core/api/area'
import type { CustomerRequest } from '@repo/core/api/booking-requests'
import { countdownLabel, istClock } from '@repo/core/booking-requests'
import { useNow } from '@repo/core/hooks/use-now'
import { waitingLine } from '@repo/core/area-signups'

const DATE = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' })

/**
 * Home's live status (customer reach, part 2, 0062; mockup
 * no-bounce-funnel.png frame 6): the launch banner once, a request's yes to
 * confirm, an open request with its clock, one that ended with what next,
 * a free wash ready, and being on an area's list. Each opens where it is
 * dealt with. Nothing at all while there is nothing (or the API has no
 * such route yet).
 */
export function ReachStatusCards() {
  const status = useAreaStatus()
  const now = useNow(1000)
  const data = status.data
  if (!data) return null
  const banner = data.signups.find((s) => s.launchBanner)
  const requests = data.requests
  const ready = data.signups.filter((s) => s.freeWashReady)
  const waiting = data.signups.filter((s) => !s.live)
  if (!banner && requests.length === 0 && ready.length === 0 && waiting.length === 0) return null

  return (
    <div className="flex flex-col gap-2" data-reach-status="">
      {banner && <LaunchBanner signup={banner} />}
      {requests.map((request) => (
        <RequestStatusCard key={request.rootId} request={request} now={now} />
      ))}
      {ready.map((signup) => (
        <Link
          key={`ready-${signup.zone.slug}`}
          href="/garages?category=car_wash"
          className="press flex min-h-14 items-center gap-3 rounded-[16px] border border-[#1F5A3A] bg-[#0E2418] px-4 py-3"
        >
          <IconGift size={20} className="shrink-0 text-success" aria-hidden />
          <span className="min-w-0 flex-1">
            <span className="block text-[15px] font-medium text-text-primary">Your free wash is ready</span>
            <span className="block text-[12px] text-text-secondary">
              Up to ₹{signup.freeWashReady!.amount} off a car wash in {signup.zone.name} · use by{' '}
              {DATE.format(new Date(signup.freeWashReady!.endsAt))}
            </span>
          </span>
          <IconChevronRight size={18} className="shrink-0 text-text-secondary" aria-hidden />
        </Link>
      ))}
      {waiting.map((signup) => (
        <WaitingListCard key={`list-${signup.zone.slug}`} signup={signup} />
      ))}
    </div>
  )
}

/**
 * "On the list for <Area>", with Leave (0066): off the list, and no more
 * messages about the area. A free wash saved there goes with it, said first.
 */
function WaitingListCard({ signup }: { signup: AreaSignup }) {
  const leave = useLeaveAreaList()
  const [confirming, setConfirming] = useState(false)
  const [error, setError] = useState<string | undefined>()
  return (
    <div className="flex min-h-12 items-center justify-between gap-3 rounded-[16px] border border-border px-4 py-2">
      <span className="min-w-0">
        <span className="block text-[14px] text-text-primary">On the list for {signup.zone.name}</span>
        <span className="block text-[12px] text-text-muted">
          {signup.freeWash ? 'Free wash saved · ' : ''}
          {waitingLine(signup.zone.name, signup.waiting)}
        </span>
      </span>
      <button
        type="button"
        aria-label={`Leave the list for ${signup.zone.name}`}
        onClick={() => setConfirming(true)}
        className="min-h-11 shrink-0 px-1 text-[12px] font-medium text-text-secondary underline underline-offset-2 transition-colors hover:text-text-primary"
      >
        Leave
      </button>
      <ConfirmSheet
        open={confirming}
        onClose={() => {
          setConfirming(false)
          setError(undefined)
        }}
        onConfirm={async () => {
          try {
            await leave.mutateAsync(signup.zone.slug)
            toast.success(`You left the list for ${signup.zone.name}`)
            setConfirming(false)
          } catch (err) {
            setError(err instanceof Error ? err.message : 'Could not leave the list')
          }
        }}
        level="light"
        title={`Leave the list for ${signup.zone.name}?`}
        body={
          signup.freeWash
            ? "We'll stop sending you news about this area, and your saved free wash goes with it."
            : "We'll stop sending you news about this area. You can join again any time."
        }
        confirmLabel="Leave the list"
        cancelLabel="Stay on it"
        busy={leave.isPending}
        error={error}
      />
    </div>
  )
}

/** "Detlio is now in <Area>": shown once (marked seen as it shows), closable. */
function LaunchBanner({ signup }: { signup: AreaSignup }) {
  const seen = useMarkBannerSeen()
  const told = useRef(false)
  const [closed, setClosed] = useState(false)
  // Marked seen as it shows (without re-reading Home, so it stays on screen
  // for this visit): the next visit no longer carries it.
  useEffect(() => {
    if (told.current) return
    told.current = true
    track('banner_view', { banner: 'launch' })
    void markLaunchBannerSeen(signup.zone.slug).catch(() => undefined)
  }, [signup.zone.slug])
  if (closed) return null
  const garages = signup.launchBanner?.garages ?? 1
  return (
    <section
      aria-labelledby={`launch-${signup.zone.slug}`}
      className="flex items-start gap-3 rounded-[16px] border border-[#1F5A3A] bg-[#0E2418] p-4"
      data-launch-banner=""
    >
      <IconConfetti size={22} className="mt-0.5 shrink-0 text-success" aria-hidden />
      <div className="min-w-0 flex-1">
        <h2 id={`launch-${signup.zone.slug}`} className="text-[15px] font-medium text-text-primary">
          Detlio is now in {signup.zone.name}
        </h2>
        <p className="text-[13px] text-text-secondary">
          {garages} {garages === 1 ? 'garage' : 'garages'} near you.
          {signup.freeWashReady ? ' Your free wash is ready to book.' : ''}
        </p>
        <Link href="/garages" className="mt-2 inline-flex min-h-11 items-center text-[14px] text-text-primary underline">
          See them
        </Link>
      </div>
      <button
        type="button"
        aria-label="Close the launch banner"
        onClick={() => {
          track('banner_close', { banner: 'launch' })
          setClosed(true)
          seen.mutate(signup.zone.slug)
        }}
        className="-mr-2 -mt-2 grid size-11 shrink-0 place-items-center text-text-secondary"
      >
        <IconX size={18} aria-hidden />
      </button>
    </section>
  )
}

function RequestStatusCard({ request, now }: { request: CustomerRequest; now: number }) {
  const [title, line] =
    request.state === 'accepted' && request.confirmBy
      ? [`Accepted: confirm by ${istClock(request.confirmBy)}`, `${request.garage.name} said yes · ${request.window.label}`]
      : request.state === 'waiting'
        ? [
            'Your request',
            `${request.garage.name} · waiting · ${countdownLabel(Date.parse(request.respondBy) - now)} left`,
          ]
        : request.state === 'lapsed'
          ? ['Your request expired', `${request.garage.name}'s yes ran out · send a new one`]
          : ["Your request didn't find a garage", 'See what to do next']
  return (
    <Link
      href="/requests"
      data-request-status={request.state}
      className={
        request.state === 'accepted'
          ? 'press flex min-h-14 items-center gap-3 rounded-[16px] border border-[#1F5A3A] bg-[#0E2418] px-4 py-3'
          : 'press flex min-h-14 items-center gap-3 rounded-[16px] border border-border bg-surface px-4 py-3'
      }
    >
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-medium text-text-primary">{title}</span>
        <span className="block text-[12px] text-text-secondary">{line}</span>
      </span>
      <IconChevronRight size={18} className="shrink-0 text-text-secondary" aria-hidden />
    </Link>
  )
}
