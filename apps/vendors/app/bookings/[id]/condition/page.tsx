'use client'

import { useParams } from 'next/navigation'
import { useT } from '@repo/core/i18n'
import { AppShell } from '@repo/ui/sc/app-shell'
import { EmptyState } from '@repo/ui/sc/empty-state'
import { LoadError } from '@repo/ui/sc/load-error'
import { SkeletonList } from '@repo/ui/sc/skeleton'
import { BackToJob, CheckTheMarks } from '@/components/check-the-marks'
import { useConditionReader } from '@/lib/condition-reader'
import { useVendorBookings } from '@/lib/use-vendor-bookings'

/**
 * "Check the marks" (0075): opened from the job page once a car-check photo
 * is taken; the screen itself is components/check-the-marks.tsx. Detlio
 * keeps looking at any photo it has not read yet while it is open.
 *
 * The URL carries only the job's id (useParams), never a query, so the
 * page works the same whether it is prerendered or not.
 */
export default function CheckTheMarksPage() {
  const t = useT()
  const { id } = useParams<{ id: string }>()
  const { bookings, loaded, failed, retrying, reload } = useVendorBookings()
  const booking = bookings.find((b) => b.id === id)
  useConditionReader(booking, reload)

  if (!booking || !booking.conditionCheck) {
    return (
      <AppShell navType="vendor" className="gap-4 py-4">
        <BackToJob id={id} />
        {!loaded ? (
          <SkeletonList count={3} itemClassName="h-32" />
        ) : failed ? (
          <LoadError what={t('this job')} onRetry={reload} retrying={retrying} />
        ) : (
          <EmptyState
            title={t("This job isn't on your list")}
            subtitle={t('It may belong to another garage, or the link is old.')}
          />
        )}
      </AppShell>
    )
  }

  return <CheckTheMarks booking={booking} onChanged={reload} />
}
