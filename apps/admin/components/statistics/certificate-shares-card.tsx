'use client'

import { ScCard } from '@repo/ui/sc/card'
import { ErrorState } from '@repo/ui/sc/empty-state'
import { Skeleton } from '@repo/ui/sc/skeleton'
import { StatTile } from '@repo/ui/sc/stat-tile'
import { useCertificateShareTotals } from '@repo/core/api/hooks/use-certificate'

/**
 * Service History certificates (API 0053): how many customers have shared
 * their car's record and how often the links were opened, all time. Counts
 * only (GET /admin/stats/certificates); never a car or a customer. Follows
 * none of the page's filters, and says so.
 */
export function CertificateSharesCard() {
  const totals = useCertificateShareTotals()

  return (
    <ScCard className="flex flex-col gap-4 px-4 py-4">
      <div>
        <h2 className="text-[15px] font-semibold text-text-primary">Service history certificates</h2>
        <p className="mt-0.5 text-[12px] text-text-secondary">All time, not the filters above</p>
      </div>
      {totals.data ? (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <StatTile variant="plain" label="Shared now" value={totals.data.liveNow} hint={`${totals.data.liveWithPhotos} with photos`} />
          <StatTile variant="plain" label="Cars ever shared" value={totals.data.carsShared} />
          <StatTile variant="plain" label="Links made" value={totals.data.linksMade} hint="New links and re-shares" />
          <StatTile variant="plain" label="Times opened" value={totals.data.views} hint="Public page views, all links" />
        </div>
      ) : totals.isError ? (
        <ErrorState message="Couldn't load the certificate numbers." onRetry={() => void totals.refetch()} />
      ) : (
        <div role="status" aria-busy="true" className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <span className="sr-only">Loading</span>
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-[72px]" />
          ))}
        </div>
      )}
    </ScCard>
  )
}
