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

/**
 * One open mark as a chip and its status line, a button that edits it.
 * `compact` keeps it to one line ("● Call back  Asked today"), for a table
 * row; otherwise the status sits under the chip.
 */
export function MarkChip({
  mark,
  garage,
  onEdit,
  className,
  compact = false,
}: {
  mark: OnboardingMarkBrief
  garage: string
  /** Gets the button that was pressed, for a popover to sit by. */
  onEdit?: (button: HTMLButtonElement) => void
  className?: string
  /** On one line, the label truncating first. */
  compact?: boolean
}) {
  const chase = markNeedsChase(mark)
  const body = (
    <>
      <span
        className={cn(
          'inline-flex max-w-full items-center gap-1.5 rounded-full border border-border bg-surface px-2 py-0.5 text-[12px] text-text-primary',
          compact && 'min-w-0 shrink'
        )}
      >
        <MarkDot status={mark.status} chase={chase} />
        <span className="truncate">{markLabel(mark.kind, mark.label)}</span>
      </span>
      <span
        className={cn(
          'text-[11px]',
          compact ? 'shrink-0 whitespace-nowrap' : 'pl-1',
          chase ? 'text-tone-attention-text' : 'text-text-muted'
        )}
      >
        {markStatusText(mark)}
      </span>
    </>
  )
  const layout = compact
    ? 'flex min-w-0 items-center gap-1.5'
    : 'flex flex-col items-start gap-0.5'
  if (!onEdit) {
    return <span className={cn(layout, className)}>{body}</span>
  }
  return (
    <button
      type="button"
      onClick={(event) => {
        event.stopPropagation()
        onEdit(event.currentTarget)
      }}
      aria-label={`Edit mark ${markLine(mark)}, ${garage}`}
      className={cn(
        layout,
        compact ? 'min-h-8' : 'min-h-9',
        'rounded-md text-left hover:opacity-85',
        className
      )}
    >
      {body}
    </button>
  )
}

/**
 * The Garages table's Marks column, on one line so a row stays one line:
 * the garage's first open mark ("● Waiting on owner  Asked 24 Oct"), which
 * opens it to edit, "+N" for the rest (the garage's panel lists them all),
 * and "+" to add one; or "+ Add mark" with none. Fits a phone row too.
 * Renders nothing from an API older than the marks.
 */
export function MarksCell({
  vendor,
  className,
}: {
  vendor: AdminVendor
  className?: string
}) {
  const [open, setOpen] = useState<{
    mark: OnboardingMarkBrief | 'new'
    anchor: HTMLElement
  } | null>(null)
  if (!vendor.openMarks) return null
  const marks = vendor.openMarks
  const first = marks[0]
  const more = marks.length - 1

  return (
    <div
      className={cn('flex min-w-0 max-w-full items-center gap-1.5', className)}
    >
      {first && (
        <MarkChip
          compact
          mark={first}
          garage={vendor.businessName}
          onEdit={(anchor) => setOpen({ mark: first, anchor })}
        />
      )}
      {more > 0 && (
        <span
          title={marks
            .slice(1)
            .map((mark) => markLine(mark))
            .join('\n')}
          className="shrink-0 rounded-md bg-surface-elevated px-1.5 py-0.5 font-numeric text-[11px] text-text-secondary"
        >
          <span aria-hidden>+{more}</span>
          <span className="sr-only">
            and {more} more {more === 1 ? 'mark' : 'marks'}
          </span>
        </span>
      )}
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation()
          setOpen({ mark: 'new', anchor: event.currentTarget })
        }}
        aria-label={`Add mark for ${vendor.businessName}`}
        title={first ? 'Add mark' : undefined}
        className={cn(
          'inline-flex min-h-8 shrink-0 items-center gap-1 rounded-md text-[12px] text-text-secondary hover:bg-surface hover:text-text-primary',
          first ? 'min-w-8 justify-center' : 'px-1'
        )}
      >
        <IconPlus size={13} aria-hidden />
        {!first && 'Add mark'}
      </button>
      {open && (
        <MarkPopover
          vendor={vendor}
          mark={open.mark === 'new' ? undefined : open.mark}
          anchor={open.anchor}
          onClose={() => setOpen(null)}
        />
      )}
    </div>
  )
}
