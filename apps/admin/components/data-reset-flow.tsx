'use client'

import { useEffect, useState, type ReactNode } from 'react'
import { IconDownload } from '@tabler/icons-react'
import { ScBadge } from '@repo/ui/sc/badge'
import { ScButton } from '@repo/ui/sc/button'
import { ScCheckbox } from '@repo/ui/sc/checkbox'
import { ScInput } from '@repo/ui/sc/input'
import type {
  DataResetChain,
  DataResetCheckout,
  DataResetPreview,
  DataResetResult,
  DataResetScope,
} from '@repo/core/api/admin'
import { ApiError } from '@repo/core/api/client'
import { errorMessage } from '@repo/core/api/hooks/use-discounts'
import { useExecuteDataReset } from '@repo/core/api/hooks/use-admin-data-reset'
import { cn } from '@repo/core/utils'
import { downloadCsv, formatRupees, formatWhen, todayIst } from '@/lib/bookings'
import { dataResetCsv, phraseTyped, plural } from '@/lib/data-reset'
import { SignedAs } from '@/components/signed-as'

/**
 * The pieces of "Start pilot clean" that the page and a booking's "Delete
 * test booking" dialog share: a row of the list, the dry run's summary, the
 * confirmation, and what was done. Red appears once, on the final delete.
 */

/** "Checked 25 of 143 old payments with Razorpay…" while a dry run pages. */
export function CheckingLine({
  preview,
}: {
  preview: DataResetPreview | null
}) {
  if (!preview || preview.lookups.remaining === 0) return null
  return (
    <p role="status" className="text-[12px] text-text-secondary">
      Checking old payments with Razorpay…{' '}
      <span className="font-numeric">{preview.lookups.remaining}</span> to go.
    </p>
  )
}

/**
 * A row of the list. Where it can be ticked, the whole row is the box's
 * label, so a tap anywhere on it (44px and up) ticks it: on a phone, a 16px
 * box among dozens of rows is too easy to miss on the step where a miss
 * matters most. A kept row is set on a darker surface with its box greyed,
 * and its text stays at full contrast: the reason it is kept is the line
 * the owner needs to read.
 */
function ListRow({
  kept,
  checkbox,
  children,
}: {
  kept: boolean
  /** Absent where the list is read-only. */
  checkbox: ReactNode | null
  children: ReactNode
}) {
  const shell = cn(
    'flex min-h-11 gap-3 rounded-[12px] border border-border px-3 py-2',
    kept && 'bg-surface'
  )
  return (
    <li>
      {checkbox ? (
        <label
          className={cn(shell, kept ? 'cursor-not-allowed' : 'cursor-pointer')}
        >
          {checkbox}
          {children}
        </label>
      ) : (
        <div className={shell}>{children}</div>
      )}
    </li>
  )
}

const BOX =
  'mt-3 size-4 shrink-0 accent-brand-white disabled:cursor-not-allowed disabled:opacity-50'

/** One customer booking (a whole reschedule chain) in the list. */
export function ChainRow({
  chain,
  checked,
  onToggle,
}: {
  chain: DataResetChain
  checked: boolean
  /** Absent where the list is read-only (the dry run, one booking). */
  onToggle?: (checked: boolean) => void
}) {
  const kept = chain.kept
  return (
    <ListRow
      kept={Boolean(kept)}
      checkbox={
        onToggle ? (
          <input
            type="checkbox"
            aria-label={`Delete booking #${chain.reference}`}
            checked={checked}
            disabled={Boolean(kept)}
            onChange={(e) => onToggle(e.target.checked)}
            className={BOX}
          />
        ) : null
      }
    >
      <div className="min-w-0 flex-1 text-[12px]">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="font-numeric text-[13px] font-semibold text-text-primary">
            #{chain.reference}
          </span>
          {chain.bookingIds.length > 1 && (
            <ScBadge variant="muted">
              Moved{' '}
              <span className="ml-1 font-numeric">
                {chain.bookingIds.length - 1}
              </span>
              ×
            </ScBadge>
          )}
          {chain.markedTest && <ScBadge variant="pending">Test</ScBadge>}
          <ScBadge variant={kept ? 'danger' : 'muted'}>
            {chain.moneyLabel}
          </ScBadge>
          <span className="ml-auto font-numeric text-text-primary">
            {formatRupees(chain.amount)}
          </span>
        </div>
        <p className="mt-0.5 truncate text-text-secondary">
          {chain.customer.name} · {chain.garage.name} · booked{' '}
          <span className="font-numeric">{formatWhen(chain.createdAt)}</span>
        </p>
        {chain.receiptNumber && (
          <p className="font-numeric text-text-muted">
            Receipt {chain.receiptNumber}
          </p>
        )}
        {kept && (
          <p className="mt-0.5 text-text-primary">
            <span className="font-medium">{kept.label}.</span>{' '}
            <span className="text-text-secondary">{kept.detail}</span>
          </p>
        )}
      </div>
    </ListRow>
  )
}

/** A checkout that never became a booking, in the list. */
export function CheckoutRow({
  checkout,
  checked,
  onToggle,
}: {
  checkout: DataResetCheckout
  checked: boolean
  onToggle?: (checked: boolean) => void
}) {
  const kept = checkout.kept
  return (
    <ListRow
      kept={Boolean(kept)}
      checkbox={
        onToggle ? (
          <input
            type="checkbox"
            aria-label={`Delete checkout #${checkout.reference}`}
            checked={checked}
            disabled={Boolean(kept)}
            onChange={(e) => onToggle(e.target.checked)}
            className={BOX}
          />
        ) : null
      }
    >
      <div className="min-w-0 flex-1 text-[12px]">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="font-numeric text-[13px] font-semibold text-text-primary">
            #{checkout.reference}
          </span>
          <ScBadge variant={kept ? 'danger' : 'muted'}>
            {checkout.moneyLabel}
          </ScBadge>
          <span className="ml-auto font-numeric text-text-primary">
            {formatRupees(checkout.amount)}
          </span>
        </div>
        <p className="mt-0.5 truncate text-text-secondary">
          {checkout.customer.name} · {checkout.garageName} · opened{' '}
          <span className="font-numeric">{formatWhen(checkout.createdAt)}</span>
        </p>
        {kept && (
          <p className="mt-0.5 text-text-primary">
            <span className="font-medium">{kept.label}.</span>{' '}
            <span className="text-text-secondary">{kept.detail}</span>
          </p>
        )}
      </div>
    </ListRow>
  )
}

/**
 * A cutoff run's complaints made before the cutoff, as one row with one
 * tick: "3 complaints made before the cutoff · C-000001 to C-000003". They
 * hang off no booking's chain and carry no money, so they go or stay
 * together.
 */
export function ComplaintsRow({
  complaints,
  checked,
  onToggle,
}: {
  complaints: DataResetPreview['complaints']
  checked: boolean
  onToggle?: (checked: boolean) => void
}) {
  if (complaints.count === 0) return null
  const range =
    complaints.firstNumber === complaints.lastNumber
      ? complaints.firstNumber
      : `${complaints.firstNumber} to ${complaints.lastNumber}`
  return (
    <ListRow
      kept={false}
      checkbox={
        onToggle ? (
          <input
            type="checkbox"
            aria-label="Delete the complaints made before the cutoff"
            checked={checked}
            onChange={(e) => onToggle(e.target.checked)}
            className={BOX}
          />
        ) : null
      }
    >
      <div className="min-w-0 flex-1 text-[12px]">
        <p className="text-[13px] font-semibold text-text-primary">
          {plural(complaints.count, 'complaint', 'complaints')} made before the
          cutoff
        </p>
        <p className="mt-0.5 text-text-secondary">
          <span className="font-numeric">{range}</span> · with their notes.
          Numbering carries on from the last one.
        </p>
      </div>
    </ListRow>
  )
}

/**
 * A cutoff run's usage events (Statistics → Funnel) recorded before the
 * cutoff, as one row with one tick: "1,240 usage events recorded before the
 * cutoff". Anonymous and tied to no booking, so they are counted, not
 * listed, and go or stay together.
 */
export function AnalyticsEventsRow({
  events,
  checked,
  onToggle,
}: {
  events: { count: number; selected: boolean }
  checked: boolean
  onToggle?: (checked: boolean) => void
}) {
  if (events.count === 0) return null
  return (
    <ListRow
      kept={false}
      checkbox={
        onToggle ? (
          <input
            type="checkbox"
            aria-label="Delete the usage events recorded before the cutoff"
            checked={checked}
            onChange={(e) => onToggle(e.target.checked)}
            className={BOX}
          />
        ) : null
      }
    >
      <div className="min-w-0 flex-1 text-[12px]">
        <p className="text-[13px] font-semibold text-text-primary">
          {plural(events.count, 'usage event', 'usage events')} recorded before
          the cutoff
        </p>
        <p className="mt-0.5 text-text-secondary">
          Visits and steps for the Funnel on Statistics, with no names or
          numbers. The Funnel starts again from the cutoff.
        </p>
      </div>
    </ListRow>
  )
}

/**
 * What the dry run will delete, in plain words, and what happens to the
 * receipt numbering, with the list to download. The caller decides whether
 * the download is required before going on (`downloaded` is its record).
 *
 * The dry run covers the whole scope, ticked or not, so the CSV has every
 * row: deleted, kept with its reason, or unticked.
 */
export function DryRunSummary({
  preview,
  downloaded,
  onDownloaded,
}: {
  preview: DataResetPreview
  downloaded: boolean
  onDownloaded: () => void
}) {
  // Everything in scope this run leaves: kept for a reason, or not ticked.
  const keptRows = [...preview.chains, ...preview.checkouts].filter(
    (row) => !row.selected
  )
  const download = () => {
    downloadCsv(dataResetCsv(preview), `detlio-test-data-${todayIst()}.csv`)
    onDownloaded()
  }

  return (
    <div className="flex flex-col gap-3">
      <div>
        <p className="text-[13px] font-semibold text-text-primary">
          This deletes, for good:
        </p>
        {preview.countLines.length === 0 ? (
          <p className="text-[13px] text-text-secondary">
            Nothing. Nothing in scope is ticked.
          </p>
        ) : (
          <ul className="mt-1 grid grid-cols-1 gap-x-4 gap-y-0.5 text-[13px] text-text-primary sm:grid-cols-2">
            {preview.countLines.map((line) => (
              <li key={line} className="font-numeric">
                {line}
              </li>
            ))}
          </ul>
        )}
      </div>

      {preview.receiptPlan.length > 0 && (
        <div>
          <p className="text-[13px] font-semibold text-text-primary">
            Receipt numbers
          </p>
          <ul className="mt-1 flex flex-col gap-0.5 text-[13px] text-text-primary">
            {preview.receiptPlan.map((year) => (
              <li key={year.financialYear} className="font-numeric">
                {year.words}.
              </li>
            ))}
          </ul>
          <p className="mt-1 text-[12px] text-text-secondary">
            No receipt a real customer holds is ever renumbered.
          </p>
        </div>
      )}

      <p className="text-[12px] text-text-secondary">
        {keptRows.length > 0
          ? `${plural(keptRows.length, 'row is', 'rows are')} kept: real payments, anything still open, and anything not ticked. The list says why for each. Garages, services, offers, notices, customer accounts and cars are never touched.`
          : 'Garages, services, offers, notices, customer accounts and cars are never touched.'}
      </p>

      {(preview.overCap.chains > 0 || preview.overCap.checkouts > 0) && (
        <p className="text-[12px] text-text-primary">
          This run takes the oldest first, up to its limit. Run it again for the
          other{' '}
          <span className="font-numeric">
            {preview.overCap.chains + preview.overCap.checkouts}
          </span>
          .
        </p>
      )}

      <div className="flex flex-col gap-1">
        <ScButton
          variant="secondary"
          fullWidth={false}
          onClick={download}
          className="flex min-h-11 items-center justify-center gap-1.5 px-4 text-[13px]"
        >
          <IconDownload size={16} aria-hidden /> Download list (CSV)
        </ScButton>
        <p className="text-[12px] text-text-muted">
          {downloaded
            ? 'Downloaded. Keep it with today’s database backup.'
            : 'Every row in scope, deleted or kept, and why. Keep it with today’s database backup.'}
        </p>
      </div>
    </div>
  )
}

/**
 * The last step: who is doing it, that there is a backup, and the phrase.
 * The one red button on the screen, and only live once all three are given.
 */
export function ConfirmDelete({
  preview,
  scope,
  only,
  onDone,
  onStale,
  onPendingChange,
}: {
  preview: DataResetPreview
  scope: DataResetScope
  only?: { chainIds: string[]; checkoutIds: string[] }
  onDone: (result: DataResetResult) => void
  /** The dry run is out of date: run it again. */
  onStale: () => void
  /**
   * Hears when the delete starts and ends. The caller holds every way out
   * (Back, closing the dialog) while it runs: it can't be called back, and
   * leaving would lose the result and the audit id it answers with.
   */
  onPendingChange?: (pending: boolean) => void
}) {
  const execute = useExecuteDataReset()
  const pending = execute.isPending
  // The end is told from the cleanup, so the caller hears it even when this
  // form is gone by then: the delete's answer (onDone) lands before the
  // mutation's own state, and the caller swaps this form for the result in
  // that same render, so it never renders again with `pending` false.
  useEffect(() => {
    if (!pending) return
    onPendingChange?.(true)
    return () => onPendingChange?.(false)
  }, [pending, onPendingChange])
  const [backup, setBackup] = useState(false)
  const [phrase, setPhrase] = useState('')
  const [error, setError] = useState<{
    message: string
    stale: boolean
  } | null>(null)

  const ready = backup && phraseTyped(phrase, preview.confirmPhrase)

  const submit = () => {
    if (!ready || execute.isPending) return
    setError(null)
    execute.mutate(
      {
        scope,
        only,
        unknownIds: preview.lookups.unknownIds,
        selectionHash: preview.selectionHash,
        confirmText: phrase,
        backupConfirmed: true,
      },
      {
        onSuccess: onDone,
        onError: (err) =>
          setError({
            message: errorMessage(err, "Couldn't delete. Nothing was deleted."),
            stale: err instanceof ApiError && err.code === 'PREVIEW_STALE',
          }),
      }
    )
  }

  return (
    <div className="flex flex-col gap-3">
      <SignedAs />
      <ScCheckbox
        label="I have a database backup from today"
        checked={backup}
        onChange={setBackup}
      />
      <div className="flex flex-col gap-1">
        <ScInput
          id="reset-phrase"
          label={`Type ${preview.confirmPhrase} to confirm`}
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          value={phrase}
          onChange={(e) => setPhrase(e.target.value)}
          className="min-h-11 font-numeric"
        />
        <p className="text-[12px] text-text-muted">
          This can&apos;t be undone from here.
        </p>
      </div>

      {error && (
        <div
          role="alert"
          className="flex flex-col gap-2 text-[12px] text-error"
        >
          <p>{error.message}</p>
          {error.stale && (
            <ScButton
              variant="secondary"
              fullWidth={false}
              onClick={onStale}
              className="min-h-11 px-4"
            >
              Run the dry run again
            </ScButton>
          )}
        </div>
      )}

      {/* The one red button: this is the step that deletes. */}
      <ScButton
        onClick={submit}
        disabled={!ready || execute.isPending}
        // Grey with what is missing, not a faded red that reads as an error.
        disabledReason={
          ready
            ? undefined
            : `Still to do: ${[
                !backup && 'the backup tick',
                !phraseTyped(phrase, preview.confirmPhrase) &&
                  'the typed words',
              ]
                .filter(Boolean)
                .join(', ')}`
        }
        className="min-h-11"
      >
        {execute.isPending ? 'Deleting…' : deleteLabel(preview.confirmPhrase)}
      </ScButton>
    </div>
  )
}

/** "DELETE 143 BOOKINGS" as a button says it: "Delete 143 bookings". */
function deleteLabel(phrase: string): string {
  const lower = phrase.toLowerCase()
  return lower.charAt(0).toUpperCase() + lower.slice(1)
}

/** What was done, once it is done. */
export function ResultSummary({ result }: { result: DataResetResult }) {
  return (
    <div
      role="status"
      className="flex flex-col gap-2 text-[13px] text-text-primary"
    >
      <p className="font-semibold">Done. Deleted by {result.by}.</p>
      <ul className="flex flex-col gap-0.5">
        {result.countLines.map((line) => (
          <li key={line} className="font-numeric">
            {line}
          </li>
        ))}
      </ul>
      {result.receiptPlan.map((year) => (
        <p key={year.financialYear} className="font-numeric">
          {year.words}.
        </p>
      ))}
      {result.photosRemoved > 0 && (
        <p className="text-[12px] text-text-secondary">
          The{' '}
          {plural(
            result.photosRemoved,
            'job photo file is',
            'job photo files are'
          )}{' '}
          being removed from storage.
        </p>
      )}
      <p className="text-[12px] text-text-secondary">
        Recorded at{' '}
        <span className="font-numeric">{formatWhen(result.at)}</span>. Audit
        record <span className="font-numeric">{result.auditId}</span>.
      </p>
    </div>
  )
}
