'use client'

import { useEffect, useState } from 'react'
import { ScButton } from '@repo/ui/sc/button'
import { ScSheet } from '@repo/ui/sc/modal'
import {
  deleteMyAccount,
  getAccountDeletionPreview,
  type AccountDeletionPreview,
} from '@repo/core/api/account'
import { ACCOUNT_DELETION_CONFIRM, ACCOUNT_DELETION_WORDS } from '@repo/core/account-deletion'
import { typedConfirmMatches } from '@repo/core/confirm'

type Phase =
  | { kind: 'checking' }
  | { kind: 'failed'; message: string }
  | { kind: 'ready'; preview: AccountDeletionPreview }
  | { kind: 'deleted' }

/**
 * Profile → Delete account (0066; Apple 5.1.1(v)). Reads first what would
 * stop it (an open booking, a refund still owed, credit left…) and lists
 * each with what to do. Otherwise it says what is deleted, what is kept and
 * why, and asks for the word typed before the button works. Once deleted
 * the session is over on the server; `onDeleted` clears this browser.
 */
export function DeleteAccountSheet({
  open,
  onClose,
  onDeleted,
}: {
  open: boolean
  onClose: () => void
  /** After the account is gone and the person pressed Done: clear the session here and leave. */
  onDeleted: () => void
}) {
  const [phase, setPhase] = useState<Phase>({ kind: 'checking' })
  const [typed, setTyped] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    let cancelled = false
    setPhase({ kind: 'checking' })
    setTyped('')
    setError(null)
    getAccountDeletionPreview()
      .then((preview) => {
        if (!cancelled) setPhase({ kind: 'ready', preview })
      })
      .catch((err: unknown) => {
        if (!cancelled)
          setPhase({ kind: 'failed', message: err instanceof Error ? err.message : 'Could not check your account.' })
      })
    return () => {
      cancelled = true
    }
  }, [open])

  const close = () => {
    if (busy) return
    if (phase.kind === 'deleted') onDeleted()
    else onClose()
  }

  const remove = async () => {
    if (!typedConfirmMatches(typed, ACCOUNT_DELETION_CONFIRM)) return
    setBusy(true)
    setError(null)
    try {
      await deleteMyAccount()
      setPhase({ kind: 'deleted' })
    } catch (err) {
      // Something opened meanwhile (a booking, a payment): say it here.
      setError(err instanceof Error ? err.message : 'Could not delete your account.')
    } finally {
      setBusy(false)
    }
  }

  const words = ACCOUNT_DELETION_WORDS

  return (
    <ScSheet open={open} onClose={close} dismissible={!busy} aria-label="Delete account">
      <div className="flex flex-col gap-3 px-5 pt-1">
        {phase.kind === 'deleted' ? (
          <>
            <h2 className="text-[17px] font-semibold text-text-primary">{words.doneTitle}</h2>
            <p role="status" className="text-[14px] text-text-secondary">
              {words.doneBody}
            </p>
            <ScButton variant="main" onClick={onDeleted}>
              Done
            </ScButton>
          </>
        ) : (
          <>
            <h2 className="text-[17px] font-semibold text-text-primary">{words.title}</h2>
            {phase.kind === 'checking' && (
              <p role="status" className="text-[14px] text-text-secondary">
                Checking your account…
              </p>
            )}
            {phase.kind === 'failed' && (
              <p role="alert" className="text-[14px] text-error">
                {phase.message}
              </p>
            )}
            {phase.kind === 'ready' && !phase.preview.canDelete && (
              <>
                <p className="text-[14px] text-text-secondary">{words.blockedIntro}</p>
                <ul aria-label="Before you can delete" className="flex flex-col gap-2">
                  {phase.preview.blockers.map((blocker) => (
                    <li
                      key={blocker.code}
                      className="rounded-[12px] border border-border bg-surface px-3 py-2.5 text-[14px] text-text-primary"
                    >
                      {blocker.message}
                    </li>
                  ))}
                </ul>
              </>
            )}
            {phase.kind === 'ready' && phase.preview.canDelete && (
              <>
                <section aria-label="What is deleted">
                  <p className="text-[13px] font-semibold text-text-primary">{words.deletedHeading}</p>
                  <ul className="mt-1 list-disc pl-5 text-[13px] text-text-secondary">
                    {words.deleted.map((line) => (
                      <li key={line}>{line}</li>
                    ))}
                  </ul>
                </section>
                <section aria-label="What is kept">
                  <p className="text-[13px] font-semibold text-text-primary">{words.keptHeading}</p>
                  <ul className="mt-1 list-disc pl-5 text-[13px] text-text-secondary">
                    {words.kept.map((line) => (
                      <li key={line}>{line}</li>
                    ))}
                  </ul>
                </section>
                <p className="text-[13px] text-text-secondary">{words.final}</p>
                <label className="flex flex-col gap-1.5 text-[13px] text-text-secondary">
                  <span>
                    Type <span className="font-semibold text-text-primary">{ACCOUNT_DELETION_CONFIRM}</span> to confirm
                  </span>
                  <input
                    value={typed}
                    onChange={(event) => setTyped(event.target.value)}
                    disabled={busy}
                    autoComplete="off"
                    autoCapitalize="characters"
                    spellCheck={false}
                    className="h-12 w-full rounded-[14px] border border-border bg-surface px-3.5 text-[16px] text-text-primary outline-none focus:border-text-primary"
                  />
                </label>
              </>
            )}
            {error && (
              <p role="alert" className="text-[14px] text-error">
                {error}
              </p>
            )}
            <div className="mt-2 flex flex-col gap-2.5">
              {phase.kind === 'ready' && phase.preview.canDelete && (
                <ScButton
                  variant="danger-outline"
                  onClick={() => void remove()}
                  disabled={busy || !typedConfirmMatches(typed, ACCOUNT_DELETION_CONFIRM)}
                >
                  {busy ? 'Deleting…' : 'Delete my account'}
                </ScButton>
              )}
              <ScButton variant="outline" onClick={close} disabled={busy}>
                {phase.kind === 'ready' && phase.preview.canDelete ? 'Keep my account' : 'Close'}
              </ScButton>
            </div>
          </>
        )}
      </div>
    </ScSheet>
  )
}
