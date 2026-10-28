'use client'

import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { IconColumns3 } from '@tabler/icons-react'
import { cn } from '@repo/core/utils'
import {
  hiddenColumnsToSave,
  readHiddenColumns,
  toggleKey,
  type OptionalColumn,
} from '@/lib/admin-table'

/**
 * The optional columns this browser hides, remembered under `storageKey`
 * (a per-viewer convenience: private windows and blocked storage just get
 * the defaults). Read once on mount: the lists render on the client only,
 * under their Suspense boundary, so there is no server markup to match.
 */
export function useHiddenColumns(
  storageKey: string,
  optional: readonly OptionalColumn[]
): [ReadonlySet<string>, (id: string) => void] {
  const [hidden, setHidden] = useState<ReadonlySet<string>>(() => {
    let saved: string | null = null
    try {
      saved =
        typeof window === 'undefined'
          ? null
          : window.localStorage.getItem(storageKey)
    } catch {
      // Storage blocked: the defaults.
    }
    return readHiddenColumns(saved, optional)
  })
  const optionalRef = useRef(optional)
  useEffect(() => {
    optionalRef.current = optional
  }, [optional])

  const toggle = useCallback(
    (id: string) => {
      setHidden((current) => {
        const next = toggleKey(current, id)
        try {
          window.localStorage.setItem(
            storageKey,
            hiddenColumnsToSave(next, optionalRef.current)
          )
        } catch {
          // Not remembered, still applied.
        }
        return next
      })
    },
    [storageKey]
  )
  return [hidden, toggle]
}

/**
 * "Columns": a small disclosure with a tick per optional column. Laptop
 * only; a phone row shows its fixed two lines whatever is chosen here.
 * Escape and a press outside close it.
 */
export function ColumnsButton({
  columns,
  hidden,
  onToggle,
  className,
}: {
  columns: readonly OptionalColumn[]
  hidden: ReadonlySet<string>
  onToggle: (id: string) => void
  className?: string
}) {
  const [open, setOpen] = useState(false)
  const panelId = useId()
  const rootRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return
    const onPointer = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      // Closes this, not the side panel behind it.
      event.preventDefault()
      setOpen(false)
      buttonRef.current?.focus()
    }
    document.addEventListener('pointerdown', onPointer)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onPointer)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  if (columns.length === 0) return null

  return (
    <div ref={rootRef} className={cn('relative max-md:hidden', className)}>
      <button
        ref={buttonRef}
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((value) => !value)}
        className="inline-flex min-h-9 items-center gap-1.5 rounded-[8px] border border-border px-3 text-[12.5px] font-medium text-text-primary transition-colors hover:bg-surface-elevated"
      >
        <IconColumns3 size={15} aria-hidden="true" />
        Columns
      </button>
      {open && (
        <div
          id={panelId}
          role="group"
          aria-label="Columns"
          className="absolute right-0 top-full z-40 mt-1 w-52 rounded-xl border border-border bg-surface-elevated py-1 shadow-lg"
        >
          {columns.map((column) => (
            <label
              key={column.id}
              className="flex min-h-10 cursor-pointer items-center gap-2.5 px-3.5 text-[13px] text-text-primary hover:bg-surface"
            >
              <input
                type="checkbox"
                checked={!hidden.has(column.id)}
                onChange={() => onToggle(column.id)}
                className="size-4 cursor-pointer rounded border-border bg-surface accent-brand-white"
              />
              {column.header}
            </label>
          ))}
        </div>
      )}
    </div>
  )
}
