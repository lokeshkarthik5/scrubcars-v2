'use client'

import { useState } from 'react'
import { IconMapPin } from '@tabler/icons-react'
import { toast } from 'react-toastify'
import { fill, useT } from '@repo/core/i18n'
import { msg, t } from '@repo/core/i18n/translate'
import { AppShell } from '@repo/ui/sc/app-shell'
import { ScBadge } from '@repo/ui/sc/badge'
import { ScButton } from '@repo/ui/sc/button'
import { ScCard } from '@repo/ui/sc/card'
import { ConfirmSheet } from '@repo/ui/sc/confirm-sheet'
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
  useWithdrawRequest,
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

/** The car type as the garage prices it (English, shown as `t(…)`). */
const CAR_TYPE: Record<string, string> = {
  hatchback: msg('Hatchback'),
  sedan: msg('Sedan'),
  suv: msg('SUV'),
}

/** How a closed request ended, in a word (English, shown as `t(…)`). */
const CLOSED_WORD: Record<string, string> = {
  converted: msg('Booked'),
  forwarded: msg('Passed on'),
  declined: msg('Declined'),
  expired: msg('Expired'),
  cancelled: msg('Cancelled'),
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
  const t = useT()
  const [scope, setScope] = useState<'open' | 'closed'>('open')
  const requests = useGarageRequests(scope)
  const now = useNow(1000)
  const items = requests.data?.items ?? []

  return (
    <AppShell showNav navType="vendor" className="gap-4 py-4">
      <TopBar showBack backHref="/home" title={t('Requests')} />
      <p className="text-[12px] text-text-secondary">
        {t(
          'Customers just outside your area ask you to come. Nothing is paid until you say yes. Answer within {hours} hours, or we ask the next garage.',
          { hours: REQUEST_RULES.respondMinutes / 60 }
        )}
      </p>
      <ScSegmented
        aria-label={t('Which requests')}
        value={scope}
        onChange={setScope}
        options={[
          { value: 'open', label: t('Open') },
          { value: 'closed', label: t('Closed') },
        ]}
      />
      {requests.isLoading ? (
        <SkeletonList count={2} itemClassName="h-[320px]" />
      ) : requests.isError && !requests.data ? (
        <LoadError
          what={t('your requests')}
          onRetry={() => void requests.refetch()}
          retrying={requests.isFetching}
        />
      ) : items.length === 0 ? (
        <EmptyState
          icon={<IconMapPin size={28} stroke={1.5} />}
          title={t('No requests right now')}
          subtitle={t(
            'Customers just outside your area can ask you to come. Their requests show here.'
          )}
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
              {t('Saying yes often earns you more requests from this area.')}
            </p>
          )}
        </div>
      )}
    </AppShell>
  )
}

/** "Premium Car Wash · Sedan", in the language in use. */
function servicesLine(request: GarageRequest) {
  const carType = CAR_TYPE[request.vehicleType]
  return `${request.items.map((item) => item.name).join(' + ')} · ${carType ? t(carType) : request.vehicleType}`
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
  const t = useT()
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
          ? t('Accepted. The customer has until {time} to confirm.', {
              time: istClock(accepted.confirmBy),
            })
          : t('Accepted.')
      )
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : t('Could not accept. Please try again.')
      )
    }
  }

  const onDecline = async () => {
    try {
      const result = await decline.mutateAsync(request.id)
      toast.success(
        result.outcome === 'passed_on'
          ? t('Passed to the next garage')
          : t('Request closed')
      )
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : t('Could not answer. Please try again.')
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
            ? t('Passed on to you')
            : t('New request · outside your area')}
        </p>
        <p
          className="shrink-0 font-numeric text-[13px] font-semibold text-warning"
          aria-label={t('Time left to answer: {time}', { time: countdownLabel(leftMs) })}
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
          {request.beyond} · {t('{km} km from you', { km: request.distanceKm })}
        </p>
        {request.earn !== null && (
          <p className="mt-1 text-[13px] text-text-primary">
            {fill(t('You earn {amount} + any travel fee'), {
              amount: (
                <span className="font-numeric font-semibold">
                  {formatINR(request.earn)}
                </span>
              ),
            })}
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
          {t('Travel fee (the customer sees it before paying)')}
        </p>
        <div
          role="radiogroup"
          aria-label={t('Travel fee')}
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
          {t('Start time, inside {window}', { window: request.window.label.toLowerCase() })}
        </p>
        {startTimes.isLoading ? (
          <p className="text-[13px] text-text-secondary">
            {t('Finding your free times…')}
          </p>
        ) : starts.length === 0 ? (
          <p className="text-[13px] text-text-secondary">
            {t('No free start time left in this window')}
          </p>
        ) : (
          <div
            role="radiogroup"
            aria-label={t('Start time')}
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
          {t("Can't")}
        </ScButton>
        <ScButton
          variant="main"
          onClick={() => void onAccept()}
          disabled={busy || !chosen}
          className="flex-1"
        >
          {t('Accept')}
        </ScButton>
      </div>
      {!chosen && starts.length > 0 && (
        <p className="text-[12px] text-text-secondary">
          {t('Pick a start time to accept.')}
        </p>
      )}
    </ScCard>
  )
}

function AcceptedRequestCard({ request }: { request: GarageRequest }) {
  const t = useT()
  const titleId = `request-${request.id}-title`
  const withdraw = useWithdrawRequest()
  const [confirming, setConfirming] = useState(false)
  const [error, setError] = useState<string | undefined>()
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
          {t('Accepted')}
        </ScBadge>
      </div>
      <p className="text-[13px] text-text-primary">
        {t('Accepted · starts {start} · travel fee {fee} · customer confirms by {time}', {
          start: request.acceptedStartAt ? istStartLabel(request.acceptedStartAt) : '—',
          fee: formatINR(request.travelFee ?? 0),
          time: request.confirmBy ? istClock(request.confirmBy) : '—',
        })}
      </p>
      <p className="text-[12px] text-text-secondary">
        {t('It becomes a booking on your Bookings page once the customer pays.')}
      </p>
      {/* Until the customer pays (0066): the yes can be taken back. */}
      {request.canWithdraw !== false && (
        <ScButton
          variant="outline"
          size="md"
          aria-label={t('Withdraw your yes to {request}', { request: servicesLine(request) })}
          onClick={() => setConfirming(true)}
        >
          {t('Withdraw')}
        </ScButton>
      )}
      <ConfirmSheet
        open={confirming}
        onClose={() => {
          setConfirming(false)
          setError(undefined)
        }}
        onConfirm={async () => {
          try {
            await withdraw.mutateAsync(request.id)
            toast.success(t('Withdrawn. We told the customer.'))
            setConfirming(false)
          } catch (err) {
            // The customer is paying right now, or it moved on: said here.
            setError(err instanceof Error ? err.message : t('Could not withdraw it'))
          }
        }}
        level="firm"
        title={t('Withdraw your yes?')}
        body={t(
          "The customer hasn't paid yet. We tell them you can no longer come, and they can ask again."
        )}
        confirmLabel={t('Withdraw')}
        cancelLabel={t('Keep it')}
        busy={withdraw.isPending}
        error={error}
      />
    </ScCard>
  )
}

function ClosedRequestCard({ request }: { request: GarageRequest }) {
  const t = useT()
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
          {request.withdrawn
            ? t('Withdrawn')
            : CLOSED_WORD[request.status]
              ? t(CLOSED_WORD[request.status]!)
              : request.status}
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
  const t = useT()
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
      aria-label={
        coverKm === null
          ? t('Your reach (your area), the customer {km} km from you', { km: distanceKm })
          : t('Your reach {cover} km, the customer {km} km from you', {
              cover: coverKm,
              km: distanceKm,
            })
      }
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
        {t('you')} · {coverKm === null ? t('area') : `${coverKm} km`}
      </text>
      <text x={dot} y={cy - 10} textAnchor="end" fontSize="10" fill="#9CA3AF">
        {t('customer')}
      </text>
    </svg>
  )
}
