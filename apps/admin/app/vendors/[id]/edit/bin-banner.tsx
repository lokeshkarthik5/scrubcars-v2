'use client'

import { IconRestore } from '@tabler/icons-react'
import { ScButton } from '@repo/ui/sc/button'
import type { AdminVendorDetail } from '@repo/core/api/admin'
import { formatWhen } from '@/lib/bookings'

/**
 * What a garage in the Bin's edit page says first: since when, who moved it
 * and why, that it is off the app, and the one thing to do here, Restore.
 */
export function BinBanner({
  bin,
  onRestore,
}: {
  bin: Pick<AdminVendorDetail, 'deletedAt' | 'deletedByName' | 'deletedReason'>
  onRestore: () => void
}) {
  return (
    <section
      aria-labelledby="bin-banner-title"
      className="flex flex-col gap-3 rounded-[14px] border border-warning/40 bg-warning-muted px-4 py-3.5"
    >
      <div>
        <p
          id="bin-banner-title"
          className="text-[14px] font-semibold text-text-primary"
        >
          In the Bin, read-only
        </p>
        <p className="mt-1 text-[12.5px] leading-[18px] text-text-secondary">
          Moved there{' '}
          {bin.deletedAt && (
            <span className="font-numeric">{formatWhen(bin.deletedAt)}</span>
          )}
          {bin.deletedByName && <> by {bin.deletedByName}</>}.{' '}
          {/* Each sentence carries its own space, so a reason never runs
              into the next one ("demo.Customers"). */}
          {bin.deletedReason && (
            <>Reason: {bin.deletedReason.replace(/\.\s*$/, '')}. </>
          )}
          Customers and its team can&apos;t see it. Restore it to make changes.
        </p>
      </div>
      <ScButton
        variant="secondary"
        fullWidth={false}
        onClick={onRestore}
        className="flex min-h-11 items-center justify-center gap-1.5 self-start px-4 text-[13px]"
      >
        <IconRestore size={16} aria-hidden="true" /> Restore
      </ScButton>
    </section>
  )
}
