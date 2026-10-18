'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ScButton } from '@repo/ui/sc/button'
import { ScModal } from '@repo/ui/sc/modal'
import { SkeletonList } from '@repo/ui/sc/skeleton'
import type {
  AdminBookingDetail,
  DataResetPreview,
  DataResetResult,
  DataResetScope,
} from '@repo/core/api/admin'
import { errorMessage } from '@repo/core/api/hooks/use-discounts'
import { previewDataResetFully } from '@repo/core/api/hooks/use-admin-data-reset'
import {
  ChainRow,
  CheckingLine,
  ConfirmDelete,
  DryRunSummary,
  ResultSummary,
} from '@/components/data-reset-flow'

/**
 * "Delete test booking": the same dry run and confirmation as Start pilot
 * clean, for the one booking (its whole reschedule chain) whose page this
 * is. For tests the team runs during the pilot. The booking must be marked
 * Test, and real money is kept whatever: the server decides both, and the
 * dry run says so before anything can be confirmed.
 *
 * Mounted when it opens (the caller renders it then), and its dry run
 * starts with it. A dry run gone stale is run again under a new key.
 * `onDeleted` runs once the booking is gone: the page it was opened from no
 * longer exists.
 */
export function DeleteTestBookingDialog({
  booking,
  open,
  onClose,
  onDeleted,
}: {
  booking: AdminBookingDetail
  open: boolean
  onClose: () => void
  onDeleted: (result: DataResetResult) => void
}) {
  const [attempt, setAttempt] = useState(0)
  const [progress, setProgress] = useState<DataResetPreview | null>(null)
  const [downloaded, setDownloaded] = useState(false)
  // The delete is running: nothing closes the dialog until it answers, or
  // its result (and the redirect away from a booking that is gone) is lost.
  const [deleting, setDeleting] = useState(false)
  const [result, setResult] = useState<DataResetResult | null>(null)

  const scope: DataResetScope = { kind: 'chains', bookingIds: [booking.id] }
  // A query rather than a mutation, so it runs as the dialog mounts. Never
  // cached or retried: a dry run is about this moment.
  const preview = useQuery({
    queryKey: ['admin-data-reset', 'booking-dry-run', booking.id, attempt],
    queryFn: () => previewDataResetFully({ scope }, setProgress),
    enabled: open,
    gcTime: 0,
    staleTime: Infinity,
    retry: false,
    refetchOnWindowFocus: false,
  })
  const dryRun = preview.data ?? null
  const error = preview.error ? errorMessage(preview.error, "Couldn't run the dry run") : ''

  const run = () => {
    setDownloaded(false)
    setAttempt((n) => n + 1)
  }

  // Once the delete has answered there is nothing left to wait for.
  const busy = !result && (preview.isFetching || deleting)
  const close = () => {
    if (busy) return
    if (result) onDeleted(result)
    else onClose()
  }

  const deletable = dryRun && dryRun.countLines.length > 0

  return (
    <ScModal
      open={open}
      onClose={close}
      dismissible={!busy}
      aria-label={`Delete test booking #${booking.reference}`}
      className="flex max-w-[480px] flex-col gap-4"
    >
      <div>
        <h2 className="text-[15px] font-semibold text-text-primary">
          Delete test booking <span className="font-numeric">#{booking.reference}</span>
        </h2>
        <p className="mt-1 text-[12px] text-text-secondary">
          The booking, every booking it was moved to or from, and everything on them go for
          good. Nothing is deleted until you confirm.
        </p>
      </div>

      {result ? (
        <ResultSummary result={result} />
      ) : !dryRun ? (
        !error && (
          <>
            <SkeletonList count={1} itemClassName="h-20" />
            <CheckingLine preview={progress} />
          </>
        )
      ) : (
        <>
          <ul aria-label="Booking to delete" className="flex flex-col gap-1.5">
            {dryRun.chains.map((chain) => (
              <ChainRow key={chain.rootId} chain={chain} checked={chain.selected} />
            ))}
          </ul>
          {deletable ? (
            <>
              <DryRunSummary
                preview={dryRun}
                downloaded={downloaded}
                onDownloaded={() => setDownloaded(true)}
              />
              <ConfirmDelete
                preview={dryRun}
                scope={scope}
                onDone={setResult}
                onStale={run}
                onPendingChange={setDeleting}
              />
            </>
          ) : (
            <p className="text-[13px] text-text-primary">This booking is kept, so there is nothing to delete.</p>
          )}
        </>
      )}

      {error && (
        <p role="alert" className="text-[12px] text-error">
          {error}
        </p>
      )}

      <ScButton variant="secondary" onClick={close} disabled={busy} className="min-h-11">
        {result ? 'Done' : 'Go back'}
      </ScButton>
    </ScModal>
  )
}
