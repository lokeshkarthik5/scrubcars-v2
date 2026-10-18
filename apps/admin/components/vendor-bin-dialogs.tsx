'use client'

import { useState } from 'react'
import {
  IconCalendarEvent,
  IconCheck,
  IconPhoto,
  IconReceipt,
  IconRestore,
  IconTool,
  IconTrash,
} from '@tabler/icons-react'
import { ScBadge } from '@repo/ui/sc/badge'
import { ScButton } from '@repo/ui/sc/button'
import { ScInput } from '@repo/ui/sc/input'
import { ScModal, ScSheet } from '@repo/ui/sc/modal'
import { SkeletonList } from '@repo/ui/sc/skeleton'
import type {
  AdminVendorBinResult,
  AdminVendorDeleteResult,
} from '@repo/core/api/admin'
import { ApiError } from '@repo/core/api/client'
import { errorMessage } from '@repo/core/api/hooks/use-discounts'
import {
  useAdminVendorBinPreview,
  useAdminVendorDeletePreview,
  useBinAdminVendor,
  useDeleteAdminVendorForever,
  useRestoreAdminVendor,
} from '@repo/core/api/hooks/use-admin-vendors'
import { cn } from '@repo/core/utils'
import { formatRupees, formatWhen } from '@/lib/bookings'
import {
  BIN_EFFECTS,
  confirmNameMatches,
  deleteLines,
  keptLine,
  upcomingLine,
  type DeleteLine,
} from '@/lib/vendor-bin'

/**
 * The garage Bin's three dialogs: Move to bin, Restore, and Delete forever.
 * Each asks for the name of whoever is doing it (the panel's one shared
 * login can't say), which goes on the audit record.
 *
 * The destructive buttons are outlined in red rather than filled: the
 * Garages page's one red is Add garage, and here red marks what can't be
 * taken back without filling the screen with it (the approved mockup).
 */
const DESTRUCTIVE =
  'flex min-h-12 items-center justify-center gap-2 border-brand-red bg-brand-red/10 text-brand-red hover:bg-brand-red/15 disabled:opacity-40 disabled:hover:bg-brand-red/10'

// The name typed last time, for the next dialog: a convenience on this
// device only, never a record (the server keeps that). Storage can be
// missing or refuse, in which case the field starts empty.
const NAME_KEY = 'detlio.admin.actorName'

function rememberedName(): string {
  try {
    return window.localStorage.getItem(NAME_KEY) ?? ''
  } catch {
    return ''
  }
}

function rememberName(name: string) {
  try {
    window.localStorage.setItem(NAME_KEY, name)
  } catch {
    // Private mode or blocked storage: the next dialog asks again.
  }
}

/** "Your name", for the audit record. */
function NameField({
  id,
  value,
  onChange,
}: {
  id: string
  value: string
  onChange: (value: string) => void
}) {
  return (
    <div className="flex flex-col gap-1">
      <ScInput
        id={id}
        label="Your name"
        autoComplete="name"
        maxLength={100}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="min-h-11"
      />
      <p className="text-[11px] text-text-muted">Kept with the record of who did this.</p>
    </div>
  )
}

const nameReady = (name: string) => name.trim().length >= 2

// ─── Move to bin ─────────────────────────────────────────────────────────────

/**
 * Move to bin: what it does, the bookings still to happen that it will
 * cancel (and which are paid), an optional reason, and the person's name.
 * Mounted when it opens, so its preview is read at that moment.
 */
export function MoveToBinDialog({
  vendor,
  onClose,
  onDone,
}: {
  vendor: { id: string; businessName: string }
  onClose: () => void
  onDone: (result: AdminVendorBinResult) => void
}) {
  const preview = useAdminVendorBinPreview(vendor.id, true)
  const bin = useBinAdminVendor()
  const [name, setName] = useState(rememberedName)
  const [reason, setReason] = useState('')
  const [error, setError] = useState('')

  const data = preview.data
  const busy = bin.isPending
  const ready = nameReady(name) && Boolean(data) && !busy

  const submit = () => {
    if (!ready) return
    setError('')
    rememberName(name.trim())
    bin.mutate(
      { id: vendor.id, actorName: name.trim(), reason: reason.trim() || undefined },
      {
        onSuccess: onDone,
        onError: (err) => setError(errorMessage(err, "Couldn't move it to the Bin. Nothing changed.")),
      }
    )
  }

  return (
    <ScSheet
      open
      onClose={() => !busy && onClose()}
      dismissible={!busy}
      aria-label={`Move ${vendor.businessName} to the Bin`}
    >
      <div className="flex flex-col gap-4 px-5">
        <div>
          <h2 className="text-[18px] font-semibold tracking-[-0.01em] text-text-primary">
            Move {vendor.businessName} to the Bin?
          </h2>
          <p className="mt-1 text-[13px] text-text-secondary">It stays there until someone restores it or deletes it forever.</p>
        </div>

        <ul className="flex flex-col gap-1.5 text-[13px] leading-[18px] text-text-primary">
          {BIN_EFFECTS.map((effect) => (
            <li key={effect} className="flex gap-2">
              <span aria-hidden="true" className="mt-[7px] size-1 shrink-0 rounded-full bg-text-secondary" />
              {effect}
            </li>
          ))}
        </ul>

        {!data ? (
          preview.error ? (
            <p role="alert" className="text-[12px] text-error">
              {errorMessage(preview.error, "Couldn't load its bookings.")}
            </p>
          ) : (
            <SkeletonList count={1} itemClassName="h-14" />
          )
        ) : (
          <section aria-labelledby="bin-upcoming-title" className="flex flex-col gap-2">
            <p id="bin-upcoming-title" className="text-[13px] font-medium text-text-primary">
              <span className="font-numeric">{upcomingLine(data.upcomingCount, data.paidCount)}</span>
            </p>
            {data.upcoming.length > 0 && (
              <ul className="overflow-hidden rounded-xl border border-border">
                {data.upcoming.map((booking) => (
                  <li
                    key={booking.id}
                    className="flex min-h-11 items-center gap-2 border-t border-border px-3 py-2 text-[12px] first:border-t-0"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="font-numeric font-semibold text-text-primary">#{booking.reference}</span>
                      <span className="text-text-secondary">
                        {' · '}
                        {booking.customerName ?? 'Customer'} ·{' '}
                        <span className="font-numeric">{formatWhen(booking.scheduledAt)}</span>
                      </span>
                    </span>
                    {booking.paid && <ScBadge variant="pending">Paid</ScBadge>}
                    <span className="font-numeric text-text-primary">{formatRupees(booking.amount)}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}

        <ScInput
          id="bin-reason"
          label="Reason (optional)"
          maxLength={200}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Test garage from setup"
          className="min-h-11"
        />
        <NameField id="bin-name" value={name} onChange={setName} />

        {error && (
          <p role="alert" className="text-[12px] text-error">
            {error}
          </p>
        )}

        <ScButton variant="secondary" onClick={submit} disabled={!ready} className={DESTRUCTIVE}>
          <IconTrash size={18} aria-hidden="true" />
          {busy ? 'Moving…' : 'Move to bin'}
        </ScButton>
        <ScButton variant="secondary" onClick={onClose} disabled={busy} className="min-h-11 border-0">
          Cancel
        </ScButton>
      </div>
    </ScSheet>
  )
}

// ─── Restore ─────────────────────────────────────────────────────────────────

/** Restore: back as it was, with the person's name for the record. */
export function RestoreDialog({
  vendor,
  onClose,
  onDone,
}: {
  vendor: { id: string; businessName: string }
  onClose: () => void
  onDone: () => void
}) {
  const restore = useRestoreAdminVendor()
  const [name, setName] = useState(rememberedName)
  const [error, setError] = useState('')
  const busy = restore.isPending

  const submit = () => {
    if (!nameReady(name) || busy) return
    setError('')
    rememberName(name.trim())
    restore.mutate(
      { id: vendor.id, actorName: name.trim() },
      {
        onSuccess: onDone,
        onError: (err) => setError(errorMessage(err, "Couldn't restore it. Nothing changed.")),
      }
    )
  }

  return (
    <ScModal
      open
      onClose={() => !busy && onClose()}
      dismissible={!busy}
      aria-label={`Restore ${vendor.businessName}`}
      className="flex flex-col gap-4"
    >
      <div>
        <h2 className="text-[15px] font-semibold text-text-primary">Restore {vendor.businessName}?</h2>
        <p className="mt-1 text-[12px] leading-[17px] text-text-secondary">
          It comes back exactly as it was before the Bin, and its team can sign in again. Bookings
          cancelled when it went to the Bin stay cancelled.
        </p>
      </div>
      <NameField id="restore-name" value={name} onChange={setName} />
      {error && (
        <p role="alert" className="text-[12px] text-error">
          {error}
        </p>
      )}
      <ScButton
        variant="secondary"
        onClick={submit}
        disabled={!nameReady(name) || busy}
        className="flex min-h-11 items-center justify-center gap-2"
      >
        <IconRestore size={16} aria-hidden="true" />
        {busy ? 'Restoring…' : 'Restore'}
      </ScButton>
      <ScButton variant="secondary" onClick={onClose} disabled={busy} className="min-h-11 border-0">
        Cancel
      </ScButton>
    </ScModal>
  )
}

// ─── Delete forever ──────────────────────────────────────────────────────────

const LINE_ICON: Record<DeleteLine['key'], React.ReactNode> = {
  bookings: <IconCalendarEvent size={20} stroke={1.6} aria-hidden="true" />,
  pictures: <IconPhoto size={20} stroke={1.6} aria-hidden="true" />,
  setup: <IconTool size={20} stroke={1.6} aria-hidden="true" />,
}

/**
 * Delete forever, as in the approved mockup: what goes with the garage, what
 * is kept for the accounts (payments, refunds and receipt numbers, real
 * money only), the person's name, and the garage's name typed out before
 * the red-outlined button wakes. The preview's fingerprint goes with the
 * delete, so it deletes exactly what this showed.
 */
export function DeleteForeverSheet({
  vendor,
  onClose,
  onDone,
}: {
  vendor: { id: string; businessName: string }
  onClose: () => void
  onDone: (result: AdminVendorDeleteResult) => void
}) {
  const preview = useAdminVendorDeletePreview(vendor.id, { fresh: true })
  const remove = useDeleteAdminVendorForever()
  const [name, setName] = useState(rememberedName)
  const [typed, setTyped] = useState('')
  const [error, setError] = useState<{ message: string; stale: boolean } | null>(null)

  const data = preview.data
  const busy = remove.isPending
  const nameTyped = confirmNameMatches(typed, vendor.businessName)
  const ready = Boolean(data) && nameReady(name) && nameTyped && !busy && !preview.isFetching

  const submit = () => {
    if (!ready || !data) return
    setError(null)
    rememberName(name.trim())
    remove.mutate(
      { id: vendor.id, actorName: name.trim(), confirmName: typed, selectionHash: data.selectionHash },
      {
        onSuccess: onDone,
        onError: (err) =>
          setError({
            message: errorMessage(err, "Couldn't delete it. Nothing was deleted."),
            stale: err instanceof ApiError && err.code === 'PREVIEW_STALE',
          }),
      }
    )
  }

  const kept = data ? keptLine(data) : null

  return (
    <ScSheet
      open
      onClose={() => !busy && onClose()}
      dismissible={!busy}
      aria-label={`Delete ${vendor.businessName} forever`}
    >
      <div className="flex flex-col gap-4 px-5">
        <div>
          <h2 className="text-[20px] font-semibold tracking-[-0.01em] text-text-primary">
            Delete {vendor.businessName} forever?
          </h2>
          <p className="mt-1 text-[14px] text-text-secondary">This can&apos;t be undone. These go with it:</p>
        </div>

        {!data ? (
          preview.error ? (
            <p role="alert" className="text-[12px] text-error">
              {errorMessage(preview.error, "Couldn't work out what would be deleted.")}
            </p>
          ) : (
            <SkeletonList count={1} itemClassName="h-36" />
          )
        ) : (
          <>
            <ul aria-label="Deleted" className="overflow-hidden rounded-[14px] border border-border">
              {deleteLines(data).map((line) => (
                <li
                  key={line.key}
                  className="flex min-h-12 items-center gap-3 border-t border-border px-4 py-3 text-[14px] text-text-primary first:border-t-0"
                >
                  <span className="text-text-secondary">{LINE_ICON[line.key]}</span>
                  <span className="font-numeric">{line.text}</span>
                </li>
              ))}
            </ul>

            <section aria-labelledby="delete-kept-title" className="flex flex-col gap-2">
              <div className="flex items-baseline justify-between gap-2">
                <p
                  id="delete-kept-title"
                  className="text-[11px] font-semibold uppercase tracking-[0.08em] text-text-secondary"
                >
                  Kept
                </p>
                <span className="text-[12px] text-text-muted">For the accounts</span>
              </div>
              <div className="flex items-center gap-3 rounded-[14px] border border-border px-4 py-3">
                <IconReceipt size={20} stroke={1.6} aria-hidden="true" className="shrink-0 text-text-secondary" />
                <span className="text-[14px] text-text-primary">
                  Payments, refunds and receipt numbers
                  <span className="block text-[12px] text-text-secondary">Real money only</span>
                </span>
              </div>
              {kept && <p className="text-[12px] text-text-secondary">{kept}</p>}
              {data.kept.length > 0 && (
                <ul aria-label="Kept bookings" className="flex flex-col gap-1 text-[12px] text-text-secondary">
                  {data.kept.map((row) => (
                    <li key={row.id}>
                      <span className="font-numeric text-text-primary">#{row.reference}</span> · {row.moneyLabel}.{' '}
                      {row.detail}
                    </li>
                  ))}
                </ul>
              )}
              {data.receiptPlan.map((year) => (
                <p key={year.financialYear} className="font-numeric text-[12px] text-text-secondary">
                  {year.words}.
                </p>
              ))}
              {data.outcome === 'partial' && (
                <p className="text-[12px] text-text-primary">
                  This garage has more bookings than one go deletes. The oldest go now; it stays in the
                  Bin, and you press Delete forever again for the rest.
                </p>
              )}
            </section>
          </>
        )}

        <NameField id="delete-name" value={name} onChange={setName} />

        <div className="relative">
          <ScInput
            id="delete-confirm-name"
            label="Type the garage name to confirm"
            autoComplete="off"
            spellCheck={false}
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            className="min-h-12 pr-10 text-[15px]"
          />
          {nameTyped && (
            <IconCheck
              size={18}
              aria-hidden="true"
              className="pointer-events-none absolute bottom-3.5 right-3 text-text-secondary"
            />
          )}
        </div>

        {error && (
          <div role="alert" className="flex flex-col gap-2 text-[12px] text-error">
            <p>{error.message}</p>
            {error.stale && (
              <ScButton
                variant="secondary"
                fullWidth={false}
                onClick={() => {
                  setError(null)
                  void preview.refetch()
                }}
                className="min-h-11 px-4"
              >
                Show it as it is now
              </ScButton>
            )}
          </div>
        )}

        <ScButton variant="secondary" onClick={submit} disabled={!ready} className={cn(DESTRUCTIVE, 'text-[16px]')}>
          <IconTrash size={18} aria-hidden="true" />
          {busy ? 'Deleting…' : 'Delete forever'}
        </ScButton>
        <ScButton variant="secondary" onClick={onClose} disabled={busy} className="min-h-11 border-0 text-[15px]">
          Cancel
        </ScButton>
      </div>
    </ScSheet>
  )
}
