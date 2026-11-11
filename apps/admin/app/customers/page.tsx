'use client'

import { Suspense, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { IconChevronRight, IconUsers } from '@tabler/icons-react'
import { EmptyState, ErrorState } from '@repo/ui/sc/empty-state'
import { ScInput } from '@repo/ui/sc/input'
import { PageHeader } from '@repo/ui/sc/page-header'
import { SkeletonList } from '@repo/ui/sc/skeleton'
import { errorMessage, isAuthError } from '@repo/core/api/hooks/use-discounts'
import { useAdminCustomerSearch } from '@repo/core/api/hooks/use-admin-customers'
import { formatWhen } from '@/lib/bookings'

/**
 * Customers (owner, 10 Nov 2026): find someone by phone or name and open
 * their page. Minimal on purpose: what they have with Detlio, and the
 * owner's Delete customer account. The search lives in the address
 * (?q=), so a found customer's Back lands on the same list.
 */
function CustomersList() {
  const router = useRouter()
  const params = useSearchParams()
  const [q, setQ] = useState(params.get('q') ?? '')
  // The address follows the box a moment after typing stops.
  const [search, setSearch] = useState(q)
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(q)
      router.replace(
        q.trim()
          ? `/customers?q=${encodeURIComponent(q.trim())}`
          : '/customers',
        { scroll: false }
      )
    }, 300)
    return () => clearTimeout(timer)
  }, [q, router])

  const { data, error, isPending, refetch } = useAdminCustomerSearch(search)
  useEffect(() => {
    if (isAuthError(error)) router.replace('/login')
  }, [error, router])
  const customers = data?.customers ?? []

  return (
    <>
      <PageHeader
        title="Customers"
        subtitle="Find a customer by phone number or name."
      />
      <ScInput
        id="customer-search"
        type="search"
        label="Phone number or name"
        placeholder="98400 12345 or Priya"
        autoComplete="off"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        className="min-h-11"
      />
      {isPending ? (
        <SkeletonList count={4} itemClassName="h-16 rounded-[14px]" />
      ) : error && customers.length === 0 ? (
        <ErrorState
          message={errorMessage(error, 'Couldn’t load customers')}
          onRetry={() => void refetch()}
        />
      ) : customers.length === 0 ? (
        <EmptyState
          icon={<IconUsers size={32} stroke={1.5} />}
          title="No customers found"
          subtitle={
            search.trim()
              ? 'Try the last few digits of their number.'
              : undefined
          }
        />
      ) : (
        <ul aria-label="Customers" className="flex flex-col gap-2">
          {customers.map((customer) => (
            <li key={customer.id}>
              <Link
                href={`/customers/${customer.id}${search.trim() ? `?back=${encodeURIComponent(search.trim())}` : ''}`}
                aria-label={`Open ${customer.name}, ${customer.phone}`}
                className="flex min-h-16 items-center gap-3 rounded-[14px] border border-border bg-surface px-4 py-3 hover:bg-surface-elevated"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[14px] font-medium text-text-primary">
                    {customer.name}
                  </p>
                  <p className="text-[12px] text-text-secondary">
                    <span className="font-numeric">{customer.phone}</span> ·
                    joined{' '}
                    <span className="font-numeric">
                      {formatWhen(customer.joinedAt)}
                    </span>
                  </p>
                </div>
                <IconChevronRight
                  size={18}
                  aria-hidden="true"
                  className="shrink-0 text-text-muted"
                />
              </Link>
            </li>
          ))}
        </ul>
      )}
      {customers.length >= 50 && (
        <p className="text-[12px] text-text-secondary">
          Showing the newest <span className="font-numeric">50</span>. Type more
          of the number or name to narrow it.
        </p>
      )}
    </>
  )
}

export default function CustomersPage() {
  // useSearchParams needs a Suspense boundary for the static build.
  return (
    <Suspense
      fallback={<SkeletonList count={4} itemClassName="h-16 rounded-[14px]" />}
    >
      <CustomersList />
    </Suspense>
  )
}
