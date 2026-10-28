'use client'

import { Suspense, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { IconSend } from '@tabler/icons-react'
import { EmptyState, ErrorState } from '@repo/ui/sc/empty-state'
import { FilterChip } from '@repo/ui/sc/chip'
import { Notice } from '@repo/ui/sc/notice'
import { PageHeader } from '@repo/ui/sc/page-header'
import { Reveal } from '@repo/ui/sc/reveal'
import { SkeletonList } from '@repo/ui/sc/skeleton'
import type { AdminRequest } from '@repo/core/api/admin-requests'
import { errorMessage, isAuthError } from '@repo/core/api/hooks/use-discounts'
import { useAdminRequests } from '@repo/core/api/hooks/use-admin-requests'
import { REQUEST_RULES } from '@repo/core/booking-requests'
import { useNow } from '@repo/core/hooks/use-now'
import {
  CancelRequestDialog,
  RequestCard,
} from '@/components/requests/request-card'
import {
  parseRequestFilter,
  parseZoneSlug,
  REQUEST_FILTERS,
  requestsHref,
} from '@/lib/requests'

const EMPTY: Record<string, { title: string; subtitle: string }> = {
  open: {
    title: 'No open requests',
    subtitle:
      'A request waiting for a garage’s answer, or for the customer to confirm a yes, shows up here.',
  },
  accepted: {
    title: 'No accepted requests',
    subtitle: 'Requests a garage said yes to (booked, or lapsed) show up here.',
  },
  failed: {
    title: 'No failed requests',
    subtitle: 'Requests nobody accepted show up here.',
  },
  all: {
    title: 'No requests yet',
    subtitle:
      'Customers send “Request a visit” or “Request a pickup” to a garage just outside its area.',
  },
}

function RequestsList() {
  const router = useRouter()
  const params = useSearchParams()
  // Read in the browser: the page is prerendered, so the searchParams prop
  // would be the build's empty one.
  const filter = parseRequestFilter(params.get('filter'))
  const zone = parseZoneSlug(params.get('zone'))
  const now = useNow(30_000)
  const [cancelling, setCancelling] = useState<AdminRequest | null>(null)
  const { data, isPending, error, refetch } = useAdminRequests(filter, zone)

  // A dead admin session is a redirect, not an error message.
  useEffect(() => {
    if (isAuthError(error)) router.replace('/login')
  }, [error, router])

  const items = data?.items ?? []
  // The dialog reads the request fresh from the list.
  const cancellingNow = cancelling
    ? (items.find((item) => item.id === cancelling.id) ?? cancelling)
    : null

  return (
    <>
      <PageHeader
        title="Requests"
        subtitle={`Customers asking a garage just outside its area to come anyway. The garage has ${REQUEST_RULES.respondMinutes / 60} hours to answer, then it goes to the next one. The last ${data?.days ?? 30} days, newest first.`}
      />

      {data && !data.available ? (
        <Notice
          tone="neutral"
          title="Requests arrive with the API from this release"
        >
          Garages still see and answer them in their portal.
        </Notice>
      ) : (
        <>
          <div className="flex flex-col gap-2">
            <div
              role="group"
              aria-label="Show"
              className="-mx-1 flex gap-1.5 overflow-x-auto px-1"
            >
              {REQUEST_FILTERS.map((option) => (
                <FilterChip
                  key={option.value}
                  label={option.label}
                  count={data?.counts[option.value]}
                  active={filter === option.value}
                  onClick={() =>
                    router.replace(requestsHref(option.value, zone), {
                      scroll: false,
                    })
                  }
                />
              ))}
            </div>
            {zone && (
              <p className="flex flex-wrap items-center gap-2 text-[12.5px] text-text-secondary">
                Only requests sent from {data?.zone?.name ?? zone}.
                <Link
                  href={requestsHref(filter, null)}
                  className="inline-flex min-h-9 items-center font-medium text-text-primary underline underline-offset-4"
                >
                  Show every zone
                </Link>
              </p>
            )}
          </div>

          {isPending ? (
            <SkeletonList count={3} itemClassName="h-36 rounded-[14px]" />
          ) : error && items.length === 0 ? (
            <ErrorState
              message={errorMessage(error, 'Couldn’t load requests')}
              onRetry={() => void refetch()}
            />
          ) : items.length === 0 ? (
            <EmptyState
              icon={<IconSend size={32} stroke={1.5} />}
              title={EMPTY[filter]!.title}
              subtitle={EMPTY[filter]!.subtitle}
            />
          ) : (
            <ul aria-label="Requests" className="flex flex-col gap-2">
              {items.map((request, i) => (
                <Reveal as="li" key={request.id} index={i}>
                  <RequestCard
                    request={request}
                    now={now}
                    onCancel={setCancelling}
                  />
                </Reveal>
              ))}
            </ul>
          )}
        </>
      )}

      {cancellingNow && (
        <CancelRequestDialog
          key={cancellingNow.id}
          request={cancellingNow}
          onClose={() => setCancelling(null)}
        />
      )}
    </>
  )
}

/**
 * Requests (0064): every customer request to a garage just outside its
 * area, Open / Accepted / Failed / All (`?filter=`), one zone's
 * (`?zone=<slug>`, from Coverage). Read-only but for Cancel.
 */
export default function AdminRequestsPage() {
  return (
    <Suspense fallback={<SkeletonList count={3} itemClassName="h-36" />}>
      <RequestsList />
    </Suspense>
  )
}
