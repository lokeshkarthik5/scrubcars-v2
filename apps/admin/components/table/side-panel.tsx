'use client'

import { useEffect, useRef } from 'react'
import { IconX } from '@tabler/icons-react'
import { cn } from '@repo/core/utils'

/**
 * A row opened beside the list (pattern 03), so ops keeps their place. On a
 * laptop it sits to the right of the table and stays in view as the page
 * scrolls; on a phone the same element covers the screen. Escape or the
 * close button shuts it. Nothing is rendered while closed.
 */
export function SidePanel({
  open,
  label,
  title,
  onClose,
  actions,
  children,
  className,
}: {
  open: boolean
  /** What the panel is ("Garage details"), its accessible name. */
  label: string
  title: React.ReactNode
  onClose: () => void
  /** Pinned under the content: the panel's buttons. */
  actions?: React.ReactNode
  children: React.ReactNode
  className?: string
}) {
  const ref = useRef<HTMLElement>(null)

  // The latest close, read by the key handler, so a new function from the
  // page on each render neither re-adds the handler nor refocuses the panel.
  const closeRef = useRef(onClose)
  useEffect(() => {
    closeRef.current = onClose
  }, [onClose])

  useEffect(() => {
    if (!open) return
    // Into the panel, without the page jumping to it on a laptop.
    ref.current?.focus({ preventScroll: true })
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return
      // A dialog opened from the panel closes first.
      if (document.querySelector('[role="dialog"]')) return
      closeRef.current()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open])

  if (!open) return null

  return (
    <aside
      ref={ref}
      aria-label={label}
      tabIndex={-1}
      className={cn(
        'flex flex-col bg-surface focus:outline-none',
        'max-md:fixed max-md:inset-0 max-md:z-50 max-md:bg-brand-black',
        'md:sticky md:top-4 md:max-h-[calc(100dvh-2rem)] md:w-[360px] md:shrink-0 md:self-start md:overflow-hidden md:rounded-xl md:border md:border-border lg:w-[400px]',
        className
      )}
    >
      <div className="flex items-start gap-3 border-b border-border px-4 py-3">
        <div className="min-w-0 flex-1">{title}</div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close details"
          className="-mr-2 flex size-10 shrink-0 items-center justify-center rounded-lg text-text-secondary hover:bg-surface-elevated hover:text-text-primary"
        >
          <IconX size={18} aria-hidden="true" />
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">{children}</div>
      {actions && (
        <div className="flex flex-wrap gap-2 border-t border-border px-4 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] md:pb-3">
          {actions}
        </div>
      )}
    </aside>
  )
}

/** A titled block inside the side panel ("Booking", "Checklist"). */
export function SidePanelSection({
  title,
  children,
  className,
}: {
  title: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <section
      className={cn('border-b border-border py-3 last:border-b-0', className)}
    >
      <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.04em] text-text-muted">
        {title}
      </h3>
      {children}
    </section>
  )
}

/** Label and value pairs in the panel ("Car", "Hyundai i20"). */
export function SidePanelFacts({
  rows,
}: {
  rows: Array<[string, React.ReactNode]>
}) {
  return (
    <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1.5 text-[13px]">
      {rows.map(([term, value]) => (
        <div key={term} className="contents">
          <dt className="text-text-muted">{term}</dt>
          <dd className="min-w-0 break-words text-text-primary">{value}</dd>
        </div>
      ))}
    </dl>
  )
}
