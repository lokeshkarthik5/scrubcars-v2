'use client'

import { Suspense, useEffect, useRef, useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { IconReceiptRefund } from '@tabler/icons-react'
import { EmptyState, ErrorState, SkeletonCard } from '@repo/ui/sc/empty-state'
import { ScSegmented } from '@repo/ui/sc/segmented'
import { TopBar } from '@repo/ui/sc/top-bar'
import type { AdminRefund } from '@repo/core/api/admin'
import { errorMessage, isAuthError } from '@repo/core/api/hooks/use-discounts'
import { useAdminRefunds } from '@repo/core/api/hooks/use-admin-refunds'
import { useNow } from '@repo/core/hooks/use-now'
import { MarkRefundedDialog } from '@/components/mark-refunded-dialog'
import { RefundCard } from '@/components/refund-card'
import { formatClock, formatRupees } from '@/lib/bookings'
import { latestRefund } from '@/lib/refunds'

type Tab = 'owed' | 'done'

function RefundsList() {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  // The tab lives in the URL, so a link to "what we've refunded" opens there.
  const tab: Tab = params.get('status') === 'done' ? 'done' : 'owed'
  const now = useNow(60_000)
  // The refund as it was clicked; the dialog is given its latest copy from
  // the list (latestRefund), so a refusal's refetch updates its figures.
  const [marking, setMarking] = useState<AdminRefund | null>(null)

  const { data: refunds = [], isPending, error, refetch, dataUpdatedAt } = useAdminRefunds(tab)

  // A dead admin session is a redirect, not an error message.
  useEffect(() => {
    if (isAuthError(error)) router.replace('/login')
  }, [error, router])

  // After a refund is recorded the card that opened the dialog usually
  // leaves the list, and focus would fall to the top of the page. It goes to
  // the summary above the list instead, once the dialog has closed.
  const summaryRef = useRef<HTMLDivElement>(null)
  const focusSummary = useRef(false)
  useEffect(() => {
    if (focusSummary.current && marking === null) {
      focusSummary.current = false
      summaryRef.current?.focus()
    }
  }, [marking])

  const totalOwed = refunds.reduce((sum, r) => sum + Number(r.amountOwed), 0)
  const refreshFailed = Boolean(error) && refunds.length > 0

  return (
    <>
      <TopBar title="Refunds" />

      <div ref={summaryRef} tabIndex={-1} className="flex flex-col gap-3 focus:outline-none">
        <ScSegmented
          aria-label="Refunds"
          className="w-full sm:w-72 [&_[role=radio]]:min-h-11"
          value={tab}
          onChange={(next) =>
            router.replace(next === 'done' ? `${pathname}?status=done` : pathname, {
              scroll: false,
            })
          }
          options={[
            { value: 'owed', label: 'Owed' },
            { value: 'done', label: 'Done' },
          ]}
        />

        <p className="text-[12px] text-text-secondary">
          {tab === 'owed'
            ? 'Refund each one in the Razorpay dashboard, then mark it refunded here. Oldest first.'
            : 'Refunds recorded, newest first.'}
        </p>

        {refreshFailed && (
          <p role="status" className="text-[12px] text-error">
            Couldn&apos;t refresh. Showing refunds as of{' '}
            <span className="font-numeric">{formatClock(dataUpdatedAt)}</span>.
          </p>
        )}

        {tab === 'owed' && !isPending && refunds.length > 0 && (
          <p className="text-[13px] text-text-primary">
            <span className="font-numeric font-semibold">{refunds.length}</span>{' '}
            {refunds.length === 1 ? 'refund' : 'refunds'} owed ·{' '}
            <span className="font-numeric font-semibold">{formatRupees(totalOwed)}</span>
          </p>
        )}
      </div>

      {isPending ? (
        <div className="flex flex-col gap-2">
          <SkeletonCard />
          <SkeletonCard />
        </div>
      ) : error && refunds.length === 0 ? (
        <ErrorState
          message={errorMessage(error, 'Failed to load refunds')}
          onRetry={() => void refetch()}
        />
      ) : refunds.length === 0 ? (
        <EmptyState
          icon={<IconReceiptRefund size={32} stroke={1.5} />}
          title={tab === 'owed' ? 'No refunds owed' : 'No refunds recorded yet'}
          subtitle={
            tab === 'owed'
              ? 'A paid booking that is cancelled, or a payment that became no booking, shows up here.'
              : 'Refunds show up here once they are marked refunded.'
          }
        />
      ) : (
        <ul className="flex flex-col gap-2" aria-label={tab === 'owed' ? 'Refunds owed' : 'Refunds done'}>
          {refunds.map((refund) => (
            <li key={`${refund.kind}-${refund.id}`}>
              <RefundCard refund={refund} now={now} onMark={setMarking} />
            </li>
          ))}
        </ul>
      )}

      {marking && (
        <MarkRefundedDialog
          key={`${marking.kind}-${marking.id}`}
          refund={latestRefund(refunds, marking)}
          open
          onClose={() => setMarking(null)}
          onDone={() => {
            focusSummary.current = true
          }}
        />
      )}
    </>
  )
}

export default function AdminRefundsPage() {
  // useSearchParams needs a Suspense boundary, or Next.js refuses to
  // prerender the page.
  return (
    <Suspense
      fallback={
        <div className="flex flex-col gap-2">
          <SkeletonCard />
          <SkeletonCard />
        </div>
      }
    >
      <RefundsList />
    </Suspense>
  )
}
