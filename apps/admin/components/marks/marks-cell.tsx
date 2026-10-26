'use client'

import { useState } from 'react'
import { IconPlus } from '@tabler/icons-react'
import type { AdminVendor } from '@repo/core/api/admin'
import type { OnboardingMarkBrief } from '@repo/core/api/admin-marks'
import { markLabel, type MarkStatus } from '@repo/core/onboarding-marks'
import { cn } from '@repo/core/utils'
import {
  markLine,
  markNeedsChase,
  markStatusText,
} from '@/lib/onboarding-marks'
import { MarkPopover } from './mark-popover'

/**
 * A mark's status as a dot: hollow To ask, blue Asked, green Received; amber
 * when an ask is old enough to chase.
 */
export function MarkDot({
  status,
  chase = false,
}: {
  status: MarkStatus
  chase?: boolean
}) {
  return (
    <span
      aria-hidden
      className={cn(
        'inline-block size-2 shrink-0 rounded-full',
        status === 'to_ask' && 'border border-text-secondary',
        status === 'asked' &&
          (chase ? 'bg-tone-attention-dot' : 'bg-tone-progress-dot'),
        status === 'received' && 'bg-tone-done-dot'
      )}
    />
  )
}

/** One open mark as a chip and its status line, a button that edits it. */
export function MarkChip({
  mark,
  garage,
  onEdit,
  className,
}: {
  mark: OnboardingMarkBrief
  garage: string
  onEdit?: () => void
  className?: string
}) {
  const chase = markNeedsChase(mark)
  const body = (
    <>
      <span className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-border bg-surface px-2 py-0.5 text-[12px] text-text-primary">
        <MarkDot status={mark.status} chase={chase} />
        <span className="truncate">{markLabel(mark.kind, mark.label)}</span>
      </span>
      <span
        className={cn(
          'pl-1 text-[11px]',
          chase ? 'text-tone-attention-text' : 'text-text-muted'
        )}
      >
        {markStatusText(mark)}
      </span>
    </>
  )
  if (!onEdit) {
    return (
      <span className={cn('flex flex-col items-start gap-0.5', className)}>
        {body}
      </span>
    )
  }
  return (
    <button
      type="button"
      onClick={(event) => {
        event.stopPropagation()
        onEdit()
      }}
      aria-label={`Edit mark ${markLine(mark)}, ${garage}`}
      className={cn(
        'flex min-h-9 flex-col items-start gap-0.5 rounded-md text-left hover:opacity-85',
        className
      )}
    >
      {body}
    </button>
  )
}

/** Marks shown in a row before "+N". */
const CELL_MAX = 2

/**
 * The Garages table's Marks column: the garage's open marks ("Waiting on
 * owner · Asked 24 Oct"), each opening the mark to edit, or "+ Add mark".
 * Renders nothing from an API older than the marks.
 */
export function MarksCell({ vendor }: { vendor: AdminVendor }) {
  const [open, setOpen] = useState<OnboardingMarkBrief | 'new' | null>(null)
  if (!vendor.openMarks) return null
  const marks = vendor.openMarks
  const shown = marks.slice(0, CELL_MAX)
  const more = marks.length - shown.length

  return (
    <div className="flex flex-col items-start gap-1">
      {shown.map((mark) => (
        <MarkChip
          key={mark.id}
          mark={mark}
          garage={vendor.businessName}
          onEdit={() => setOpen(mark)}
        />
      ))}
      <span className="flex items-center gap-2">
        {more > 0 && (
          <span className="text-[11px] text-text-muted">+{more} more</span>
        )}
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation()
            setOpen('new')
          }}
          aria-label={`Add mark for ${vendor.businessName}`}
          className="inline-flex min-h-8 items-center gap-1 rounded-md px-1 text-[12px] text-text-secondary hover:text-text-primary"
        >
          <IconPlus size={13} aria-hidden />
          {marks.length === 0 ? 'Add mark' : 'Add'}
        </button>
      </span>
      {open && (
        <MarkPopover
          vendor={vendor}
          mark={open === 'new' ? undefined : open}
          onClose={() => setOpen(null)}
        />
      )}
    </div>
  )
}
