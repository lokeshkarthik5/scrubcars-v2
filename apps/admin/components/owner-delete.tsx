'use client'

import { useState, type ReactNode } from 'react'
import { toast } from 'react-toastify'
import { ScButton } from '@repo/ui/sc/button'
import { ConfirmSheet } from '@repo/ui/sc/confirm-sheet'
import { errorMessage } from '@repo/core/api/hooks/use-discounts'
import { useAdminMe } from '@repo/core/api/hooks/use-admin-logins'
import { cn } from '@repo/core/utils'

/**
 * Whether the signed-in admin may delete anything (owner, 10 Nov 2026): the
 * owner's login or the shared break-glass login, as GET /admin/me says. The
 * API refuses anyone else (403); the panel just doesn't show them the button.
 */
export function useCanDeleteAnything(): boolean {
  const { data: me } = useAdminMe()
  return me?.canDeleteAnything === true
}

/**
 * The owner's "Delete…" beside the soft action the team has (Hide, Void,
 * End…): a danger-outline button, never the red one, and a confirm sheet
 * saying what goes and that it can't be undone. Anything with money or a
 * customer asks for a name or number to be typed (`typeToConfirm`), which
 * the server checks again. Shown only to the owner.
 */
export function OwnerDeleteButton({
  label,
  title,
  body,
  confirmLabel,
  typeToConfirm,
  onDelete,
  done,
  ariaLabel,
  className,
}: {
  /** "Delete review…" */
  label: string
  /** When the label alone doesn't say which row ("Delete OWNERDEL50 anyway"). */
  ariaLabel?: string
  title: string
  body: ReactNode
  /** "Delete review" */
  confirmLabel: string
  /** The name or number to type, for a delete that touches money or a customer. */
  typeToConfirm?: string
  /** Runs the delete; a throw keeps the sheet open with the reason. */
  onDelete: () => Promise<unknown>
  /** The toast once it is gone; the caller's onDelete navigates away if it must. */
  done: string
  className?: string
}) {
  const canDelete = useCanDeleteAnything()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  if (!canDelete) return null

  const confirm = async () => {
    setError('')
    setBusy(true)
    try {
      await onDelete()
      setOpen(false)
      toast.success(done)
    } catch (err) {
      setError(errorMessage(err, "Couldn't delete it. Nothing was deleted."))
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <ScButton
        type="button"
        variant="danger-outline"
        fullWidth={false}
        aria-label={ariaLabel}
        onClick={() => {
          setError('')
          setOpen(true)
        }}
        className={cn('min-h-11 px-4 text-[13px]', className)}
      >
        {label}
      </ScButton>
      <ConfirmSheet
        open={open}
        onClose={() => setOpen(false)}
        onConfirm={confirm}
        busy={busy}
        error={error || undefined}
        level={typeToConfirm ? 'typed' : 'firm'}
        typeToConfirm={typeToConfirm}
        title={title}
        confirmLabel={confirmLabel}
        body={
          <div className="flex flex-col gap-2.5">
            {body}
            <p>This can&apos;t be undone.</p>
          </div>
        }
      />
    </>
  )
}
