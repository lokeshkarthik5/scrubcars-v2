'use client'

import { Suspense, useEffect } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { IconAlertTriangle, IconShieldCheck } from '@tabler/icons-react'
import { ScBadge } from '@repo/ui/sc/badge'
import { ScCard } from '@repo/ui/sc/card'
import { FilterChip } from '@repo/ui/sc/chip'
import { EmptyState, ErrorState } from '@repo/ui/sc/empty-state'
import { PageHeader } from '@repo/ui/sc/page-header'
import { IssuesTabs } from '@/components/issues-tabs'
import { Reveal } from '@repo/ui/sc/reveal'
import { SkeletonList } from '@repo/ui/sc/skeleton'
import type { AdminClaim } from '@repo/core/api/guarantee'
import { errorMessage, isAuthError } from '@repo/core/api/hooks/use-discounts'
import {
  useAdminClaims,
  useAdminGuaranteeConfig,
} from '@repo/core/api/hooks/use-guarantee'
import { CLAIM_STATUS_LABELS, GUARANTEE_RULES } from '@repo/core/guarantee'
import { cn } from '@repo/core/utils'
import { Meta } from '@/components/meta'
import { formatWhen } from '@/lib/bookings'
import {
  CLAIM_TABS,
  CLAIM_TAB_LABELS,
  claimClockLine,
  claimTabHref,
  customerFiguresLine,
  customerFlags,
  parseClaimTab,
} from '@/lib/guarantee'
import { deadlineText, URGENCY_TEXT } from '@/lib/format'
import { StatusChip } from '@repo/ui/sc/status-chip'
import { useNow } from '@repo/core/hooks/use-now'

function ClaimRow({
  claim,
  back,
  now,
}: {
  claim: AdminClaim
  back: string
  now: number
}) {
  const clock = claimClockLine(claim)
  const flags = customerFlags(claim.customerFigures)
  // The clock line on the panel's one scale (quick win 1).
  const due =
    claim.status === 'needs_detlio'
      ? claim.detlioDecideBy
      : claim.garageRespondBy
  const urgency = claim.overdue
    ? 'late'
    : due && !claim.closed
      ? deadlineText(due, now).urgency
      : 'neutral'
  return (
    <ScCard
      className={cn(
        'relative flex flex-col gap-2.5 transition-colors hover:border-text-muted',
        claim.overdue && 'border-tone-late-text/60'
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1.5">
        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
          <Link
            href={`/guarantee/${claim.id}?back=${encodeURIComponent(back)}`}
            aria-label={`Open the claim on booking ${claim.bookingRef} from ${claim.customer.name}`}
            className="font-numeric text-[14px] font-semibold text-text-primary after:absolute after:inset-0 after:rounded-[14px] focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-text-secondary"
          >
            #{claim.bookingRef}
          </Link>
          <ScBadge variant={claim.closed ? 'muted' : 'pending'}>
            {CLAIM_STATUS_LABELS[claim.status]}
          </ScBadge>
          {claim.overdue && (
            <StatusChip tone="late" dot={false}>
              <IconAlertTriangle size={12} aria-hidden />
              Overdue
            </StatusChip>
          )}
          {flags.map((flag) => (
            <ScBadge key={flag} variant="accent">
              {flag}
            </ScBadge>
          ))}
        </div>
        {clock && (
          <p className={cn('font-numeric text-[12px]', URGENCY_TEXT[urgency])}>
            {clock}
          </p>
        )}
      </div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-2 md:grid-cols-4">
        <Meta label="What's wrong">
          {claim.issues.map((issue) => issue.label).join(', ')}
        </Meta>
        <Meta label="Customer" truncate>
          {claim.customer.name}
        </Meta>
        <Meta label="Garage" truncate>
          {claim.garageName}
        </Meta>
        <Meta label="Made">
          <span className="font-numeric">{formatWhen(claim.createdAt)}</span>
          <span className="block text-[12px] text-text-muted">
            {claim.routeReasons.map((reason) => reason.label).join(' · ')}
          </span>
        </Meta>
      </div>
      <p className="text-[12px] text-text-muted">
        {customerFiguresLine(claim.customerFigures)}
      </p>
    </ScCard>
  )
}

function ClaimsList() {
  const router = useRouter()
  const params = useSearchParams()
  const tab = parseClaimTab(params.get('tab'))
  const back = claimTabHref(tab)
  const config = useAdminGuaranteeConfig()
  const on = config.data?.enabled === true
  const { data, isPending, error, refetch } = useAdminClaims(tab, on)
  const now = useNow(30_000)

  useEffect(() => {
    if (isAuthError(error)) router.replace('/login')
  }, [error, router])

  if (config.isPending) return <SkeletonList count={3} itemClassName="h-36" />
  if (!on) {
    return (
      <>
        <IssuesTabs />
        <PageHeader title="Redo claims" />
        <p className="text-[13px] text-text-secondary">
          The Detlio Guarantee is switched off (GUARANTEE_ENABLED).
        </p>
      </>
    )
  }

  const items = data?.items ?? []
  return (
    <>
      <IssuesTabs />
      <PageHeader
        title="Redo claims"
        subtitle={
          <>
            Detlio Guarantee: decide disputes within{' '}
            <span className="font-numeric">
              {GUARANTEE_RULES.detlioDecideHours}
            </span>{' '}
            hours, comparing the customer&apos;s photos with the garage&apos;s
            before and after.
          </>
        }
      />
      <div
        role="group"
        aria-label="Show"
        className="-mx-4 flex gap-2 overflow-x-auto px-4 [scrollbar-width:none] md:mx-0 md:flex-wrap md:px-0 [&::-webkit-scrollbar]:hidden"
      >
        {CLAIM_TABS.map((value) => (
          <FilterChip
            key={value}
            label={CLAIM_TAB_LABELS[value]}
            count={data?.counts[value]}
            active={tab === value}
            onClick={() =>
              router.replace(claimTabHref(value), { scroll: false })
            }
            className={cn(
              'min-h-11 rounded-[10px] text-[13px]',
              value === 'needs_decision' &&
                (data?.counts.needs_decision ?? 0) > 0 &&
                tab !== value &&
                'border-warning/60 text-warning'
            )}
          />
        ))}
      </div>

      {isPending ? (
        <SkeletonList count={3} itemClassName="h-36" />
      ) : error && items.length === 0 ? (
        <ErrorState
          message={errorMessage(error, 'Failed to load claims')}
          onRetry={() => void refetch()}
        />
      ) : items.length === 0 ? (
        <EmptyState
          icon={<IconShieldCheck size={32} stroke={1.5} />}
          title={
            tab === 'needs_decision'
              ? 'Nothing to decide'
              : tab === 'open'
                ? 'No open claims'
                : 'No closed claims'
          }
          subtitle="Claims customers make for a free redo show up here and in the team’s Telegram group."
        />
      ) : (
        <ul
          className="flex flex-col gap-2"
          aria-label={`${CLAIM_TAB_LABELS[tab]} claims`}
        >
          {items.map((claim, i) => (
            <Reveal as="li" key={claim.id} index={i}>
              <ClaimRow claim={claim} back={back} now={now} />
            </Reveal>
          ))}
        </ul>
      )}
    </>
  )
}

export default function AdminRedoClaimsPage() {
  return (
    <Suspense fallback={<SkeletonList count={3} itemClassName="h-36" />}>
      <ClaimsList />
    </Suspense>
  )
}
