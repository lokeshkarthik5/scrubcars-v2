'use client'

import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { typedConfirmHint, typedConfirmMatches } from '@repo/core/confirm'
import { ScButton } from './button'
import { ScSheet } from './modal'

interface ConfirmSheetProps {
  open: boolean
  onClose: () => void
  /** May return a promise: the sheet shows it working and can't be closed until it settles. */
  onConfirm: () => void | Promise<void>
  /**
   * How much stands in the way (the admin audit's risky-action levels):
   *   light  a plain confirm, for what is easy to put back
   *   firm   an amber confirm and a body that names the consequence
   *   typed  the person types `typeToConfirm` first, for what can't be undone
   */
  level: 'light' | 'firm' | 'typed'
  title: string
  body?: ReactNode
  confirmLabel: string
  /** Default "Keep it". */
  cancelLabel?: string
  /** For `typed`: the name or word to type. Case and outer spaces don't count. */
  typeToConfirm?: string
  /** Working, from the caller's own state (a mutation's isPending). */
  busy?: boolean
}

/**
 * The confirm step before an action, on the bottom sheet. Focus starts on
 * Cancel, so a stray Enter keeps things as they are. Closing it after the
 * action is the caller's: onClose when onConfirm has done its work (or the
 * sheet stays up to show what went wrong).
 */
export function ConfirmSheet({
  open,
  onClose,
  onConfirm,
  level,
  title,
  body,
  confirmLabel,
  cancelLabel = 'Keep it',
  typeToConfirm = '',
  busy = false,
}: ConfirmSheetProps) {
  const [pending, setPending] = useState(false)
  const [typed, setTyped] = useState('')
  const [wasOpen, setWasOpen] = useState(open)
  const titleId = useId()
  const inputId = useId()
  const cancelRef = useRef<HTMLButtonElement>(null)
  const mounted = useRef(true)

  // Each opening starts with an empty box (adjusted in render, as the
  // overlays in modal.tsx do, rather than one frame late in an effect).
  if (wasOpen !== open) {
    setWasOpen(open)
    if (open) setTyped('')
  }

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])

  // Runs after ScSheet's own focus effect (a child's effects run first), so
  // the sheet has already noted the opener it hands focus back to.
  useEffect(() => {
    if (open) cancelRef.current?.focus()
  }, [open])

  const working = busy || pending
  const matches = level !== 'typed' || typedConfirmMatches(typed, typeToConfirm)

  const confirm = async () => {
    if (working || !matches) return
    setPending(true)
    try {
      await onConfirm()
    } finally {
      if (mounted.current) setPending(false)
    }
  }

  return (
    <ScSheet
      open={open}
      onClose={onClose}
      dismissible={!working}
      aria-label={title}
    >
      <div className="px-5 pt-1">
        <h2
          id={titleId}
          className="text-[17px] font-semibold text-text-primary"
        >
          {title}
        </h2>
        {body && (
          <div className="mt-2 text-[14px] leading-relaxed text-text-secondary">
            {body}
          </div>
        )}

        {level === 'typed' && (
          <div className="mt-4">
            <label
              htmlFor={inputId}
              className="block text-[13px] text-text-secondary"
            >
              Type{' '}
              <span className="font-semibold text-text-primary">
                {typeToConfirm.trim()}
              </span>{' '}
              to confirm
            </label>
            <input
              id={inputId}
              value={typed}
              onChange={(event) => setTyped(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') void confirm()
              }}
              disabled={working}
              autoComplete="off"
              autoCapitalize="off"
              spellCheck={false}
              className="mt-1.5 h-12 w-full rounded-[14px] border border-border bg-surface px-3.5 text-[16px] text-text-primary outline-none focus:border-text-primary"
            />
          </div>
        )}

        <div className="mt-5 flex flex-col gap-2.5">
          <ScButton
            type="button"
            variant={level === 'light' ? 'main' : 'danger-outline'}
            onClick={() => void confirm()}
            disabled={working || !matches}
            disabledReason={
              !working && !matches ? typedConfirmHint(typeToConfirm) : undefined
            }
            aria-busy={working || undefined}
          >
            {working && <Spinner />}
            {confirmLabel}
          </ScButton>
          <ScButton
            ref={cancelRef}
            type="button"
            variant="outline"
            onClick={onClose}
            disabled={working}
          >
            {cancelLabel}
          </ScButton>
        </div>
      </div>
    </ScSheet>
  )
}

function Spinner() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="size-4 shrink-0 animate-spin motion-reduce:animate-none"
      fill="none"
    >
      <circle
        cx="12"
        cy="12"
        r="9"
        stroke="currentColor"
        strokeOpacity="0.3"
        strokeWidth="3"
      />
      <path
        d="M21 12a9 9 0 0 0-9-9"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  )
}
