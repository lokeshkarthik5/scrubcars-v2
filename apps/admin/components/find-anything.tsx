'use client'

import { useEffect, useId, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { IconSearch } from '@tabler/icons-react'
import { cn } from '@repo/core/utils'
import { ScSheet } from '@repo/ui/sc/modal'
import { findTargets } from '@/lib/find'

/**
 * "Find booking, phone, garage": one box at the top of the menu that opens
 * the Bookings or Garages search already filled in. Enter opens the first
 * (bookings, which also matches a garage's name); the second line opens the
 * garage list instead. `/` focuses it from anywhere but a text field.
 */
function FindForm({
  autoFocus,
  onDone,
}: {
  autoFocus?: boolean
  onDone?: () => void
}) {
  const router = useRouter()
  const [text, setText] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const listId = useId()
  const targets = findTargets(text)

  useEffect(() => {
    if (autoFocus) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== '/' || event.metaKey || event.ctrlKey || event.altKey)
        return
      const target = event.target as HTMLElement | null
      if (
        target &&
        (target.isContentEditable ||
          ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))
      )
        return
      event.preventDefault()
      inputRef.current?.focus()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [autoFocus])

  const go = (href: string) => {
    router.push(href)
    setText('')
    inputRef.current?.blur()
    onDone?.()
  }

  return (
    <form
      role="search"
      onSubmit={(event) => {
        event.preventDefault()
        if (targets[0]) go(targets[0].href)
      }}
      className="relative"
    >
      <label className="relative block">
        <span className="sr-only">Find a booking, phone or garage</span>
        <IconSearch
          size={16}
          aria-hidden="true"
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-muted"
        />
        <input
          ref={inputRef}
          type="search"
          value={text}
          autoFocus={autoFocus}
          autoComplete="off"
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              setText('')
              inputRef.current?.blur()
            }
          }}
          aria-controls={targets.length > 0 ? listId : undefined}
          placeholder="Find anything"
          className="min-h-10 w-full rounded-[8px] border border-border bg-surface pl-9 pr-8 text-[14px] text-text-primary placeholder:text-text-muted focus:border-text-muted focus:outline-none"
        />
        {!autoFocus && (
          <kbd
            aria-hidden="true"
            className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 rounded-[4px] border border-border px-1.5 text-[12px] text-text-muted"
          >
            /
          </kbd>
        )}
      </label>
      {targets.length > 0 && (
        <ul
          id={listId}
          className={cn(
            'z-50 mt-1 flex flex-col overflow-hidden rounded-[8px] border border-border bg-surface',
            autoFocus ? 'relative' : 'absolute left-0 right-0'
          )}
        >
          {targets.map((target) => (
            <li key={target.href}>
              <button
                type="button"
                onClick={() => go(target.href)}
                className="flex min-h-11 w-full items-center px-3 text-left text-[13px] text-text-primary hover:bg-surface-elevated"
              >
                {target.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </form>
  )
}

export function FindAnything({ compact = false }: { compact?: boolean }) {
  const [open, setOpen] = useState(false)
  if (!compact) return <FindForm />
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Find a booking, phone or garage"
        className="flex min-h-11 min-w-11 items-center justify-center rounded-[8px] text-text-secondary hover:bg-surface hover:text-text-primary"
      >
        <IconSearch size={18} aria-hidden="true" />
      </button>
      <ScSheet
        open={open}
        onClose={() => setOpen(false)}
        aria-label="Find a booking, phone or garage"
      >
        <div className="px-4 pb-2">
          {open && <FindForm autoFocus onDone={() => setOpen(false)} />}
        </div>
      </ScSheet>
    </>
  )
}
