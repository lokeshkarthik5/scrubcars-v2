'use client'

import { IconAlertTriangle, IconRestore, IconTrash } from '@tabler/icons-react'
import { Figures } from '@repo/ui/sc/figures'
import type { AdminVendor } from '@repo/core/api/admin'
import { useAdminVendorDeletePreview } from '@repo/core/api/hooks/use-admin-vendors'
import type { AdminTableColumn } from '@/components/table'
import { formatWhen } from '@/lib/bookings'
import { binDeleteLine, bookingParts, garageArea } from '@/lib/vendor-list'

const BIN_BUTTON =
  'inline-flex min-h-9 items-center gap-1.5 rounded-[9px] border border-border px-2.5 text-[12px] font-medium text-text-primary transition-colors hover:bg-surface-elevated'

/**
 * The Bin as a table (approved Bin mockup, in the table pattern): the
 * garage, when it went there, who moved it and why, how many bookings would
 * be deleted with it (amber, from the same preview Delete forever shows),
 * and its two ways out. On a phone: the name and the reason, with when on
 * the right.
 */
export function binColumns({
  onRestore,
  onDelete,
}: {
  onRestore: (v: AdminVendor) => void
  onDelete: (v: AdminVendor) => void
}): AdminTableColumn<AdminVendor>[] {
  return [
    {
      id: 'garage',
      header: 'Garage',
      phone: 'title',
      width: '240px',
      sortValue: (v) => v.businessName,
      cell: (v) => {
        const modes = bookingParts(v)
          .map((part) => [part.text, part.quiet].filter(Boolean).join(' '))
          .join(' · ')
        return (
          <div className="min-w-0">
            <p
              id={`vendor-${v.id}-name`}
              className="truncate text-[13.5px] font-semibold tracking-[-0.01em] text-text-primary"
            >
              {v.businessName}
            </p>
            <p className="truncate text-[12px] text-text-secondary">
              <Figures
                text={[garageArea(v), modes].filter(Boolean).join(' · ')}
              />
            </p>
          </div>
        )
      },
    },
    {
      id: 'binned',
      header: 'Binned',
      phone: 'aside',
      sortValue: (v) => v.deletedAt ?? null,
      cell: (v) =>
        v.deletedAt ? (
          <span className="whitespace-nowrap text-[12.5px]">
            <Figures text={formatWhen(v.deletedAt)} />
          </span>
        ) : null,
    },
    {
      id: 'by',
      header: 'By',
      sortValue: (v) => v.deletedByName ?? null,
      cell: (v) =>
        v.deletedByName ?? <span className="text-text-muted">—</span>,
    },
    {
      id: 'reason',
      header: 'Reason',
      phone: 'subtitle',
      cell: (v) =>
        v.deletedReason ? (
          <span className="line-clamp-2 text-[12.5px] max-md:text-[12px] max-md:text-text-secondary">
            {v.deletedReason}
          </span>
        ) : (
          <span className="text-text-muted">—</span>
        ),
    },
    {
      id: 'deletes',
      header: 'Deleted with it',
      cell: (v) => <DeleteLine vendorId={v.id} />,
    },
    {
      id: 'actions',
      header: 'Actions',
      headerHidden: true,
      align: 'end',
      phone: 'asideSub',
      cell: (v) => (
        <div className="flex items-center justify-end gap-1.5">
          <button
            type="button"
            onClick={() => onRestore(v)}
            aria-label={`Restore ${v.businessName}`}
            className={BIN_BUTTON}
          >
            <IconRestore size={15} aria-hidden="true" /> Restore
          </button>
          <button
            type="button"
            onClick={() => onDelete(v)}
            aria-label={`Delete ${v.businessName} forever`}
            className={BIN_BUTTON}
          >
            <IconTrash size={15} aria-hidden="true" />
            <span className="max-md:sr-only">Delete forever</span>
          </button>
        </div>
      ),
    },
  ]
}

/** "1 booking will be deleted with it", from the Delete forever preview. */
function DeleteLine({ vendorId }: { vendorId: string }) {
  const preview = useAdminVendorDeletePreview(vendorId)
  const line = preview.data
    ? binDeleteLine(preview.data.bookings.deleted)
    : null
  if (!line) return <span className="text-text-muted">—</span>
  return (
    <span className="flex items-center gap-1.5 text-[12.5px] text-warning">
      <IconAlertTriangle
        size={15}
        stroke={1.7}
        aria-hidden="true"
        className="shrink-0"
      />
      <Figures text={line} />
    </span>
  )
}
