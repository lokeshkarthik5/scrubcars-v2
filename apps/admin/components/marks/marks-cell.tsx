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
 * One open mark as a chip with its status under it, a button that edits it
 * (the garage's side panel lists every mark this way).
 */
export function MarkChip({
  mark,
  garage,
  onEdit,
  className,
}: {
  mark: OnboardingMarkBrief
  garage: string
  /** Gets the button that was pressed, for a popover to sit by. */
  onEdit?: (button: HTMLButtonElement) => void
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
  const layout = 'flex flex-col items-start gap-0.5'
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
        'min-h-9 rounded-md text-left hover:opacity-85',
        className
      )}
    >
      {body}
    </button>
  )
}

/**
 * The Garages table's Marks column (mockup 06): the garage's first open
 * mark by name ("● Waiting on owner"), a button that edits it, then its
 * status ("Asked 24 Oct"), "+N" for the rest (the garage's panel lists them
 * all) and "+" to add one; or "+ Add mark" with none. They wrap as whole
 * pieces, never on top of each other: the name keeps the first line,
 * truncated only when it is too long for one, and the status goes on the
 * same line when it fits or under it. On a phone the row's second line has
 * room for the dot and the status only; the name stays in the button's
 * name and the side panel. Renders nothing from an API older than the
 * marks.
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
  const chase = first ? markNeedsChase(first) : false

  return (
    <div
      className={cn(
        'flex min-w-0 max-w-full flex-wrap items-center gap-x-1.5 gap-y-0.5 max-md:flex-nowrap max-md:justify-end',
        className
      )}
    >
      {first && (
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation()
            setOpen({ mark: first, anchor: event.currentTarget })
          }}
          aria-label={`Edit mark ${markLine(first)}, ${vendor.businessName}`}
          title={markLine(first)}
          className="tap-target inline-flex min-w-0 max-w-full items-center gap-1.5 rounded-full border border-border bg-surface px-2 py-0.5 text-left text-[12px] text-text-primary transition-colors hover:bg-surface-elevated max-md:shrink-0 max-md:border-0 max-md:bg-transparent max-md:px-0"
        >
          <MarkDot status={first.status} chase={chase} />
          <span className="truncate max-md:hidden">
            {markLabel(first.kind, first.label)}
          </span>
          <span
            aria-hidden="true"
            className={cn(
              'whitespace-nowrap text-[11.5px] md:hidden',
              chase ? 'text-tone-attention-text' : 'text-text-secondary'
            )}
          >
            {markStatusText(first)}
          </span>
        </button>
      )}
      {/* The status, "+N" and "+" keep together: beside the name when
          they fit, else on the line under it. */}
      <span className="inline-flex shrink-0 items-center gap-1.5">
        {first && (
          <span
            className={cn(
              'whitespace-nowrap text-[11px] max-md:hidden',
              chase ? 'text-tone-attention-text' : 'text-text-muted'
            )}
          >
            {markStatusText(first)}
          </span>
        )}
        {more > 0 && (
          <span
            title={marks
              .slice(1)
              .map((mark) => markLine(mark))
              .join('\n')}
            className="rounded-md bg-surface-elevated px-1.5 py-0.5 font-numeric text-[11px] leading-none text-text-secondary"
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
            'tap-target inline-flex items-center gap-1 rounded-md text-[12px] text-text-secondary hover:bg-surface hover:text-text-primary max-md:hidden',
            first ? 'size-5 justify-center' : 'min-h-7 px-1'
          )}
        >
          <IconPlus size={13} aria-hidden />
          {!first && 'Add mark'}
        </button>
      </span>
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
