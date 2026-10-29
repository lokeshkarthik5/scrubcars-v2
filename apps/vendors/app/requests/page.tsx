'use client'

import { useState } from 'react'
import { IconMapPin } from '@tabler/icons-react'
import { toast } from 'react-toastify'
import { AppShell } from '@repo/ui/sc/app-shell'
import { ScBadge } from '@repo/ui/sc/badge'
import { ScButton } from '@repo/ui/sc/button'
import { ScCard } from '@repo/ui/sc/card'
import { EmptyState } from '@repo/ui/sc/empty-state'
import { LoadError } from '@repo/ui/sc/load-error'
import { ScSegmented } from '@repo/ui/sc/segmented'
import { SkeletonList } from '@repo/ui/sc/skeleton'
import { TopBar } from '@repo/ui/sc/top-bar'
import type { GarageRequest } from '@repo/core/api/booking-requests'
import {
  useAcceptRequest,
  useDeclineRequest,
  useGarageRequests,
  useRequestStartTimes,
} from '@repo/core/api/hooks/use-booking-requests'
import {
  REQUEST_RULES,
  countdownLabel,
  istClock,
  istStartLabel,
  travelFeeLabel,
  type TravelFee,
} from '@repo/core/booking-requests'
import { formatINR } from '@repo/core/format'
import { useNow } from '@repo/core/hooks/use-now'
import { cn } from '@repo/core/utils'

/** The car type as the garage prices it. */
const CAR_TYPE: Record<string, string> = {
  hatchback: 'Hatchback',
  sedan: 'Sedan',
  suv: 'SUV',
}

/** How a closed request ended, in a word. */
const CLOSED_WORD: Record<string, string> = {
  converted: 'Booked',
  forwarded: 'Passed on',
  declined: 'Declined',
  expired: 'Expired',
  cancelled: 'Cancelled',
}

/**
 * Requests (customer reach, 0062): customers just outside this garage's
 * reach asking it to come (or collect) anyway. Nothing is paid until the
 * garage says yes, with a start time inside the customer's window and an
 * optional travel fee it keeps whole. "Can't" passes it to the next nearest
 * garage. Two hours to answer; Detlio phones after 30 minutes with no
 * answer. Only this garage's requests ever reach the page (resolveTenant);
 * what one earns shows to the owner seat only.
 */
export default function RequestsPage() {
  const [scope, setScope] = useState<'open' | 'closed'>('open')
  const requests = useGarageRequests(scope)
  const now = useNow(1000)
  const items = requests.data?.items ?? []

  return (
    <AppShell showNav navType="vendor" className="gap-4 py-4">
      <TopBar showBack backHref="/home" title="Requests" />
      <p className="text-[12px] text-text-secondary">
        Customers just outside your area ask you to come. Nothing is paid until
        you say yes. Answer within {REQUEST_RULES.respondMinutes / 60} hours, or
        we ask the next garage.
      </p>
      <ScSegmented
        aria-label="Which requests"
        value={scope}
        onChange={setScope}
        options={[
          { value: 'open', label: 'Open' },
          { value: 'closed', label: 'Closed' },
        ]}
      />
      {requests.isLoading ? (
        <SkeletonList count={2} itemClassName="h-[320px]" />
      ) : requests.isError && !requests.data ? (
        <LoadError
          what="your requests"
          onRetry={() => void requests.refetch()}
          retrying={requests.isFetching}
        />
      ) : items.length === 0 ? (
        <EmptyState
          icon={<IconMapPin size={28} stroke={1.5} />}
          title="No requests right now"
          subtitle="Customers just outside your area can ask you to come. Their requests show here."
        />
      ) : (
        <div className="flex flex-col gap-3">
          {items.map((request) =>
            scope === 'closed' ? (
              <ClosedRequestCard key={request.id} request={request} />
            ) : request.status === 'pending' ? (
              <WaitingRequestCard
                key={request.id}
                request={request}
                now={now}
              />
            ) : (
              <AcceptedRequestCard key={request.id} request={request} />
            )
          )}
          {scope === 'open' && (
            <p className="text-center text-[12px] text-text-secondary">
              Saying yes often earns you more requests from this area.
            </p>
          )}
        </div>
      )}
    </AppShell>
  )
}

/** "Premium Car Wash · Sedan". */
function servicesLine(request: GarageRequest) {
  return `${request.items.map((item) => item.name).join(' + ')} · ${CAR_TYPE[request.vehicleType] ?? request.vehicleType}`
}

/** "Tomorrow 9–12 · Velachery". */
function whenWhereLine(request: GarageRequest) {
  return request.area
    ? `${request.window.label} · ${request.area}`
    : request.window.label
}

function WaitingRequestCard({
  request,
  now,
}: {
  request: GarageRequest
  now: number
}) {
  const titleId = `request-${request.id}-title`
  const [fee, setFee] = useState<TravelFee>(0)
  const [startAt, setStartAt] = useState<string | null>(null)
  const startTimes = useRequestStartTimes(request.id)
  const accept = useAcceptRequest()
  const decline = useDeclineRequest()
  const starts = startTimes.data?.starts ?? []
  const leftMs = Date.parse(request.respondBy) - now
  const busy = accept.isPending || decline.isPending
  const chosen = startAt && starts.includes(startAt) ? startAt : null

  const onAccept = async () => {
    if (!chosen) return
    try {
      const accepted = await accept.mutateAsync({
        id: request.id,
        startAt: chosen,
        travelFee: fee,
      })
      toast.success(
        accepted.confirmBy
          ? `Accepted. The customer has until ${istClock(accepted.confirmBy)} to confirm.`
          : 'Accepted.'
      )
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : 'Could not accept. Please try again.'
      )
    }
  }

  const onDecline = async () => {
    try {
      const result = await decline.mutateAsync(request.id)
      toast.success(
        result.outcome === 'passed_on'
          ? 'Passed to the next garage'
          : 'Request closed'
      )
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : 'Could not answer. Please try again.'
      )
    }
  }

  return (
    <ScCard
      id={`request-${request.id}`}
      role="region"
      aria-labelledby={titleId}
      data-request-card=""
      className="flex flex-col gap-3 border-warning/40"
    >
      <div className="flex items-start justify-between gap-3">
        <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-warning">
          {request.passedOn
            ? 'Passed on to you'
            : 'New request · outside your area'}
        </p>
        <p
          className="shrink-0 font-numeric text-[13px] font-semibold text-warning"
          aria-label={`Time left to answer: ${countdownLabel(leftMs)}`}
        >
          {countdownLabel(leftMs)}
        </p>
      </div>
      <div>
        <h2
          id={titleId}
          className="text-[17px] font-semibold text-text-primary"
        >
          {servicesLine(request)}
        </h2>
        <p className="mt-1 text-[13px] text-text-primary">
          {whenWhereLine(request)}
        </p>
        <p className="text-[13px] text-text-secondary">
          {request.beyond} · {request.distanceKm} km from you
        </p>
        {request.earn !== null && (
          <p className="mt-1 text-[13px] text-text-primary">
            You earn{' '}
            <span className="font-numeric font-semibold">
              {formatINR(request.earn)}
            </span>{' '}
            + any travel fee
          </p>
        )}
      </div>

      <ReachSketch
        coverKm={request.coverKm}
        distanceKm={request.distanceKm}
        outsideKm={request.outsideKm}
      />

      <div className="flex flex-col gap-2">
        <p id={`${titleId}-fee`} className="text-[12px] text-text-secondary">
          Travel fee (the customer sees it before paying)
        </p>
        <div
          role="radiogroup"
          aria-label="Travel fee"
          className="grid grid-cols-3 gap-2"
        >
          {REQUEST_RULES.travelFees.map((value) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={fee === value}
              disabled={busy}
              onClick={() => setFee(value)}
              className={cn(
                'min-h-11 rounded-[12px] border text-[14px] font-medium transition-colors',
                fee === value
                  ? 'border-brand-white bg-brand-white text-brand-black'
                  : 'border-border bg-surface text-text-primary'
              )}
            >
              {travelFeeLabel(value)}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <p className="text-[12px] text-text-secondary">
          Start time, inside {request.window.label.toLowerCase()}
        </p>
        {startTimes.isLoading ? (
          <p className="text-[13px] text-text-secondary">
            Finding your free times…
          </p>
        ) : starts.length === 0 ? (
          <p className="text-[13px] text-text-secondary">
            No free start time left in this window
          </p>
        ) : (
          <div
            role="radiogroup"
            aria-label="Start time"
            className="flex flex-wrap gap-2"
          >
            {starts.map((iso) => (
              <button
                key={iso}
                type="button"
                role="radio"
                aria-checked={chosen === iso}
                disabled={busy}
                onClick={() => setStartAt(iso)}
                className={cn(
                  'min-h-11 rounded-[12px] border px-3 font-numeric text-[14px] transition-colors',
                  chosen === iso
                    ? 'border-brand-white bg-brand-white text-brand-black'
                    : 'border-border bg-surface text-text-primary'
                )}
              >
                {istClock(iso)}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="flex gap-2">
        <ScButton
          variant="outline"
          onClick={() => void onDecline()}
          disabled={busy}
          className="flex-1"
        >
          Can&apos;t
        </ScButton>
        <ScButton
          variant="main"
          onClick={() => void onAccept()}
          disabled={busy || !chosen}
          className="flex-1"
        >
          Accept
        </ScButton>
      </div>
      {!chosen && starts.length > 0 && (
        <p className="text-[12px] text-text-secondary">
          Pick a start time to accept.
        </p>
      )}
    </ScCard>
  )
}

function AcceptedRequestCard({ request }: { request: GarageRequest }) {
  const titleId = `request-${request.id}-title`
  return (
    <ScCard
      role="region"
      aria-labelledby={titleId}
      data-request-card=""
      className="flex flex-col gap-2"
    >
      <div className="flex items-start justify-between gap-3">
        <h2
          id={titleId}
          className="min-w-0 text-[15px] font-semibold text-text-primary"
        >
          {servicesLine(request)}
        </h2>
        <ScBadge variant="success" className="shrink-0">
          Accepted
        </ScBadge>
      </div>
      <p className="text-[13px] text-text-primary">
        Accepted · starts{' '}
        {request.acceptedStartAt ? istStartLabel(request.acceptedStartAt) : '—'}{' '}
        · travel fee {formatINR(request.travelFee ?? 0)} · customer confirms by{' '}
        {request.confirmBy ? istClock(request.confirmBy) : '—'}
      </p>
      <p className="text-[12px] text-text-secondary">
        It becomes a booking on your Bookings page once the customer pays.
      </p>
    </ScCard>
  )
}

function ClosedRequestCard({ request }: { request: GarageRequest }) {
  const titleId = `request-${request.id}-title`
  return (
    <ScCard
      role="region"
      aria-labelledby={titleId}
      data-request-card=""
      className="flex flex-col gap-1"
    >
      <div className="flex items-start justify-between gap-3">
        <h2
          id={titleId}
          className="min-w-0 text-[15px] font-semibold text-text-primary"
        >
          {servicesLine(request)}
        </h2>
        <ScBadge
          variant={request.status === 'converted' ? 'success' : 'muted'}
          className="shrink-0"
        >
          {CLOSED_WORD[request.status] ?? request.status}
        </ScBadge>
      </div>
      <p className="text-[13px] text-text-secondary">
        {whenWhereLine(request)}
      </p>
    </ScCard>
  )
}

/**
 * A sketch, not a map: the garage at the centre of its reach and the
 * customer as a dot at their distance, to scale. No location is sent to the
 * garage before a booking, so none is drawn.
 */
function ReachSketch({
  coverKm,
  distanceKm,
  outsideKm,
}: {
  coverKm: number | null
  distanceKm: number
  outsideKm: number
}) {
  const width = 300
  const height = 96
  const cy = height / 2
  const cx = 40
  // The cover radius in km: the stated one, or (a drawn area) the distance
  // less how far outside it the customer is.
  const cover = Math.max(0.5, coverKm ?? distanceKm - outsideKm)
  const scale = (width - cx - 24) / Math.max(distanceKm, cover)
  const r = Math.max(10, cover * scale)
  const dot = cx + distanceKm * scale
  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="h-24 w-full rounded-[12px] bg-surface-elevated"
      role="img"
      aria-label={`Your reach ${coverKm === null ? '(your area)' : `${coverKm} km`}, the customer ${distanceKm} km from you`}
    >
      <circle
        cx={cx}
        cy={cy}
        r={r}
        fill="rgba(34,197,94,0.12)"
        stroke="rgba(34,197,94,0.6)"
        strokeDasharray="4 3"
      />
      <circle cx={cx} cy={cy} r={4} fill="#22C55E" />
      <line
        x1={cx}
        y1={cy}
        x2={dot}
        y2={cy}
        stroke="rgba(255,255,255,0.45)"
        strokeDasharray="3 3"
      />
      <circle cx={dot} cy={cy} r={5} fill="#E4002B" />
      <text x={cx} y={cy + 18} textAnchor="middle" fontSize="10" fill="#9CA3AF">
        you · {coverKm === null ? 'area' : `${coverKm} km`}
      </text>
      <text x={dot} y={cy - 10} textAnchor="end" fontSize="10" fill="#9CA3AF">
        customer
      </text>
    </svg>
  )
}
