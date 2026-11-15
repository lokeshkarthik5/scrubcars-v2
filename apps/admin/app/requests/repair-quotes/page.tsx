'use client'

import { Suspense, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { IconTool } from '@tabler/icons-react'
import { FilterChip } from '@repo/ui/sc/chip'
import { EmptyState, ErrorState } from '@repo/ui/sc/empty-state'
import { PageHeader } from '@repo/ui/sc/page-header'
import { Reveal } from '@repo/ui/sc/reveal'
import { SkeletonList } from '@repo/ui/sc/skeleton'
import { errorMessage, isAuthError } from '@repo/core/api/hooks/use-discounts'
import {
  repairQuotesOn,
  useAdminRepairRequests,
  useRepairQuotesConfig,
} from '@repo/core/api/hooks/use-repair-quotes'
import { useNow } from '@repo/core/hooks/use-now'
import { RepairRequestCard } from '@/components/requests/repair-request-card'
import { RequestsTabs } from '@/components/requests-tabs'
import { parseRepairFilter, REPAIR_FILTERS, repairQuotesHref } from '@/lib/repair-quotes'
import { replaceAddress } from '@/lib/replace-address'

const EMPTY: Record<string, { title: string; subtitle: string }> = {
  all: { title: 'No repair requests yet', subtitle: 'Customers send a dent or scratch with a video from Home.' },
  open: { title: 'No open repair requests', subtitle: 'A request garages can still quote on shows up here.' },
  booked: { title: 'No visits booked', subtitle: 'Requests a customer booked a visit from show up here.' },
  no_quote: { title: 'Nothing without a quote', subtitle: 'Requests no garage quoted on show up here.' },
  expired: { title: 'No expired requests', subtitle: 'Requests that closed with quotes but no visit show up here.' },
}

function RepairQuotesList() {
  const router = useRouter()
  const params = useSearchParams()
  // Read in the browser: the page is prerendered, so the searchParams prop
  // would be the build's empty one.
  const filter = parseRepairFilter(params.get('filter'))
  const now = useNow(30_000)
  const config = useRepairQuotesConfig()
  const on = repairQuotesOn(config.data)
  const { data, isPending, error, refetch } = useAdminRepairRequests(filter, on)

  useEffect(() => {
    if (isAuthError(error)) router.replace('/login')
  }, [error, router])

  const items = data?.items ?? []

  return (
    <>
      <RequestsTabs />
      <PageHeader
        title="Repair quotes"
        subtitle={`Customers’ dent and scratch requests, the garages asked and what they answered. Last ${data?.days ?? 30} days.`}
      />
      {config.isSuccess && !on ? (
        <EmptyState icon={<IconTool size={32} stroke={1.5} />} title="Repair quotes are off" subtitle="Set REPAIR_QUOTES_ENABLED=on on the API to turn them on." />
      ) : (
        <>
          <div role="group" aria-label="Show" className="-mx-1 flex gap-1.5 overflow-x-auto px-1">
            {REPAIR_FILTERS.map((option) => (
              <FilterChip
                key={option.value}
                label={option.label}
                count={data?.counts[option.value]}
                active={filter === option.value}
                onClick={() => replaceAddress(repairQuotesHref(option.value))}
              />
            ))}
          </div>
          {isPending ? (
            <SkeletonList count={3} itemClassName="h-36 rounded-[14px]" />
          ) : error && items.length === 0 ? (
            <ErrorState message={errorMessage(error, 'Couldn’t load repair requests')} onRetry={() => void refetch()} />
          ) : items.length === 0 ? (
            <EmptyState icon={<IconTool size={32} stroke={1.5} />} title={EMPTY[filter]!.title} subtitle={EMPTY[filter]!.subtitle} />
          ) : (
            <ul aria-label="Repair requests" className="flex flex-col gap-2">
              {items.map((request, i) => (
                <Reveal as="li" key={request.id} index={i}>
                  <RepairRequestCard request={request} now={now} />
                </Reveal>
              ))}
            </ul>
          )}
        </>
      )}
    </>
  )
}

/**
 * Requests → Repair quotes (0075): every repair quote request, All / Open /
 * Booked / No quote / Expired (`?filter=`), newest first. Read-only.
 */
export default function AdminRepairQuotesPage() {
  return (
    <Suspense fallback={<SkeletonList count={3} itemClassName="h-36" />}>
      <RepairQuotesList />
    </Suspense>
  )
}
