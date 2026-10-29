'use client'

import { useEffect, useState } from 'react'
import { toast } from 'react-toastify'
import { ConfirmSheet } from '@repo/ui/sc/confirm-sheet'
import { ScButton } from '@repo/ui/sc/button'
import { ScCard } from '@repo/ui/sc/card'
import { ScTextarea } from '@repo/ui/sc/input'
import { ScSheet } from '@repo/ui/sc/modal'
import { SectionHeader } from '@repo/ui/sc/section-header'
import {
  deleteMyAccount,
  getAccountDeletionPreview,
  type AccountDeletionPreview,
} from '@repo/core/api/account'
import { subscribeToSupportSession } from '@repo/core/api/client'
import {
  cancelGarageClosure,
  getMyClosureRequest,
  requestGarageClosure,
  type ClosureRequest,
} from '@repo/core/api/garage-closure'
import { leaveGarage } from '@repo/core/api/members'
import { ACCOUNT_DELETION_CONFIRM } from '@repo/core/account-deletion'
import { typedConfirmMatches } from '@repo/core/confirm'
import { useAuthStore } from '@repo/core/stores/auth-store'
import { useBookingsStore } from '@repo/core/stores/bookings-store'
import { useUserStore } from '@repo/core/stores/user-store'

const DATE = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' })

/**
 * The account's way out of a garage, in one place (0066), on Settings →
 * Account (owner and admin seats) and on /account (every seat):
 *
 *   the owner: "Close my garage" (a request with a reason Detlio acts on;
 *     cancellable until then)
 *   any other seat: "Leave <garage>", and "Delete my account"
 *
 * Nothing here in a Detlio support session: those are the garage's people's
 * own decisions.
 */
export function AccountActions() {
  const isOwner = useAuthStore((s) => s.isOwner)
  const vendor = useAuthStore((s) => s.vendor)
  const [support, setSupport] = useState(false)
  useEffect(() => subscribeToSupportSession(setSupport), [])

  if (support || !vendor) return null

  return isOwner ? (
    <CloseGarage key={vendor.id} garageName={vendor.businessName} />
  ) : (
    <>
      <LeaveGarage garageName={vendor.businessName} />
      <DeleteMyAccount />
    </>
  )
}

/** Signed out here and back to the login, once the session is over on the server. */
function endSessionHere() {
  useAuthStore.getState().clearSession()
  useUserStore.getState().reset()
  useBookingsStore.getState().reset()
  window.location.href = '/login'
}

function CloseGarage({ garageName }: { garageName: string }) {
  const [request, setRequest] = useState<ClosureRequest | null | undefined>(undefined)
  const [asking, setAsking] = useState(false)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [cancelling, setCancelling] = useState(false)

  useEffect(() => {
    let cancelled = false
    getMyClosureRequest()
      .then((open) => {
        if (!cancelled) setRequest(open)
      })
      .catch(() => {
        // An API without the route yet: the card stays hidden.
        if (!cancelled) setRequest(undefined)
      })
    return () => {
      cancelled = true
    }
  }, [])

  if (request === undefined) return null

  const send = async () => {
    if (reason.trim().length < 3) {
      setError('Say why you want to close the garage.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      setRequest(await requestGarageClosure(reason.trim()))
      setAsking(false)
      setReason('')
      toast.success('Request sent. Detlio will call you.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send the request')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="flex flex-col gap-3">
      <SectionHeader title="Close my garage" />
      <ScCard className="flex flex-col gap-3">
        {request ? (
          <>
            <p role="status" className="text-[14px] text-text-primary">
              You asked to close {garageName} on {DATE.format(new Date(request.createdAt))}. Detlio will call you
              before anything changes.
            </p>
            <p className="text-[13px] text-text-secondary">“{request.reason}”</p>
            <ScButton variant="outline" size="md" onClick={() => setCancelling(true)}>
              Cancel the request
            </ScButton>
          </>
        ) : (
          <>
            <p className="text-[13px] text-text-secondary">
              Stopping for good? Ask Detlio to close {garageName}. We call you first; your bookings still to come are
              cancelled and refunded, and the garage leaves Detlio. You can cancel the request until we act.
            </p>
            <ScButton variant="danger-outline" size="md" onClick={() => setAsking(true)}>
              Close my garage
            </ScButton>
          </>
        )}
      </ScCard>

      <ScSheet open={asking} onClose={() => !busy && setAsking(false)} dismissible={!busy} aria-label="Close my garage">
        <div className="flex flex-col gap-3 px-5 pt-1">
          <h2 className="text-[17px] font-semibold text-text-primary">Close {garageName}?</h2>
          <p className="text-[14px] text-text-secondary">
            This asks Detlio to close the garage. Nothing changes until we call you.
          </p>
          <ScTextarea
            label="Why are you closing?"
            rows={3}
            maxLength={500}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
          {error && (
            <p role="alert" className="text-[14px] text-error">
              {error}
            </p>
          )}
          <div className="mt-2 flex flex-col gap-2.5">
            <ScButton variant="danger-outline" onClick={() => void send()} disabled={busy}>
              {busy ? 'Sending…' : 'Send request'}
            </ScButton>
            <ScButton variant="outline" onClick={() => setAsking(false)} disabled={busy}>
              Keep the garage open
            </ScButton>
          </div>
        </div>
      </ScSheet>

      <ConfirmSheet
        open={cancelling}
        onClose={() => setCancelling(false)}
        onConfirm={async () => {
          try {
            await cancelGarageClosure()
            setRequest(null)
            setCancelling(false)
            toast.success('Request cancelled. Your garage stays open.')
          } catch (err) {
            toast.error(err instanceof Error ? err.message : 'Could not cancel the request')
            setCancelling(false)
            setRequest(await getMyClosureRequest().catch(() => null))
          }
        }}
        level="light"
        title="Keep your garage open?"
        body="This cancels your request to close the garage."
        confirmLabel="Cancel the request"
        cancelLabel="Back"
      />
    </section>
  )
}

function LeaveGarage({ garageName }: { garageName: string }) {
  const [confirming, setConfirming] = useState(false)
  const [error, setError] = useState<string | undefined>()

  return (
    <section className="flex flex-col gap-3">
      <SectionHeader title="Leave this garage" />
      <ScCard className="flex flex-col gap-3">
        <p className="text-[13px] text-text-secondary">
          Stop working with {garageName} on Detlio. You lose access to its bookings; the owner can add you again.
        </p>
        <ScButton variant="outline" size="md" onClick={() => setConfirming(true)}>
          Leave {garageName}
        </ScButton>
      </ScCard>
      <ConfirmSheet
        open={confirming}
        onClose={() => {
          setConfirming(false)
          setError(undefined)
        }}
        onConfirm={async () => {
          try {
            await leaveGarage()
            toast.success(`You left ${garageName}`)
            // Another garage of theirs stays; none left, they sign out.
            const store = useAuthStore.getState()
            const others = store.vendors.filter((v) => v.id !== store.activeVendorId)
            if (others.length === 0) {
              endSessionHere()
              return
            }
            await store.restoreSession()
            window.location.href = '/home'
          } catch (err) {
            setError(err instanceof Error ? err.message : 'Could not leave the garage')
          }
        }}
        level="firm"
        title={`Leave ${garageName}?`}
        body="You'll no longer see its bookings or act for it."
        confirmLabel="Leave garage"
        cancelLabel="Stay"
        error={error}
      />
    </section>
  )
}

function DeleteMyAccount() {
  const [open, setOpen] = useState(false)
  const [preview, setPreview] = useState<AccountDeletionPreview | null>(null)
  const [typed, setTyped] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const start = async () => {
    setOpen(true)
    setPreview(null)
    setTyped('')
    setError(null)
    try {
      setPreview(await getAccountDeletionPreview())
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not check your account')
    }
  }

  const remove = async () => {
    setBusy(true)
    setError(null)
    try {
      await deleteMyAccount()
      toast.success('Your account is deleted')
      endSessionHere()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete your account')
      setBusy(false)
    }
  }

  return (
    <section className="flex flex-col gap-3">
      <SectionHeader title="Delete my account" />
      <ScCard className="flex flex-col gap-3">
        <p className="text-[13px] text-text-secondary">
          Deletes your login on Detlio: your name, number and every garage you can open here. Jobs you did stay on the
          garages&apos; records, without your name.
        </p>
        <ScButton variant="danger-outline" size="md" onClick={() => void start()}>
          Delete my account
        </ScButton>
      </ScCard>
      <ScSheet open={open} onClose={() => !busy && setOpen(false)} dismissible={!busy} aria-label="Delete my account">
        <div className="flex flex-col gap-3 px-5 pt-1">
          <h2 className="text-[17px] font-semibold text-text-primary">Delete your account?</h2>
          {!preview && !error && (
            <p role="status" className="text-[14px] text-text-secondary">
              Checking your account…
            </p>
          )}
          {preview && !preview.canDelete && (
            <ul aria-label="Before you can delete" className="flex flex-col gap-2">
              {preview.blockers.map((blocker) => (
                <li
                  key={blocker.code}
                  className="rounded-[12px] border border-border bg-surface px-3 py-2.5 text-[14px] text-text-primary"
                >
                  {blocker.message}
                </li>
              ))}
            </ul>
          )}
          {preview?.canDelete && (
            <>
              <p className="text-[14px] text-text-secondary">
                You leave every garage, and you&apos;re signed out on every device. This can&apos;t be undone.
              </p>
              <label className="flex flex-col gap-1.5 text-[13px] text-text-secondary">
                <span>
                  Type <span className="font-semibold text-text-primary">{ACCOUNT_DELETION_CONFIRM}</span> to confirm
                </span>
                <input
                  value={typed}
                  onChange={(event) => setTyped(event.target.value)}
                  disabled={busy}
                  autoComplete="off"
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
            {preview?.canDelete && (
              <ScButton
                variant="danger-outline"
                onClick={() => void remove()}
                disabled={busy || !typedConfirmMatches(typed, ACCOUNT_DELETION_CONFIRM)}
              >
                {busy ? 'Deleting…' : 'Delete my account'}
              </ScButton>
            )}
            <ScButton variant="outline" onClick={() => setOpen(false)} disabled={busy}>
              {preview?.canDelete ? 'Keep my account' : 'Close'}
            </ScButton>
          </div>
        </div>
      </ScSheet>
    </section>
  )
}
