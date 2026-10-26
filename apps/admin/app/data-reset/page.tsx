'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { IconTrash } from '@tabler/icons-react'
import { ScButton } from '@repo/ui/sc/button'
import { EmptyState, ErrorState } from '@repo/ui/sc/empty-state'
import { ScInput } from '@repo/ui/sc/input'
import { PageHeader } from '@repo/ui/sc/page-header'
import { ScSection } from '@repo/ui/sc/section'
import { ScSegmented } from '@repo/ui/sc/segmented'
import { SkeletonList } from '@repo/ui/sc/skeleton'
import type {
  DataResetConfig,
  DataResetPreview,
  DataResetResult,
  DataResetScope,
} from '@repo/core/api/admin'
import { errorMessage, isAuthError } from '@repo/core/api/hooks/use-discounts'
import {
  useDataResetConfig,
  usePreviewDataReset,
} from '@repo/core/api/hooks/use-admin-data-reset'
import { fromIstInput, toIstInput } from '@repo/core/ist-input'
import { cn } from '@repo/core/utils'
import {
  ChainRow,
  CheckingLine,
  CheckoutRow,
  AnalyticsEventsRow,
  ComplaintsRow,
  ConfirmDelete,
  DryRunSummary,
  ResultSummary,
} from '@/components/data-reset-flow'
import { plural, tickAll, ticksAfterReload } from '@/lib/data-reset'

type Mode = 'before_cutoff' | 'marked_test'
type Step = 'scope' | 'dryrun' | 'confirm' | 'done'

const STEPS: Array<{ key: Exclude<Step, 'done'>; label: string }> = [
  { key: 'scope', label: 'Scope' },
  { key: 'dryrun', label: 'Dry run' },
  { key: 'confirm', label: 'Confirm' },
]

/** Where the owner is in the three steps, read out as well as shown. */
function Steps({ step }: { step: Step }) {
  const current = STEPS.findIndex((s) => s.key === step)
  return (
    <ol aria-label="Steps" className="flex gap-1.5 text-[12px]">
      {STEPS.map((s, i) => {
        const here = s.key === step
        const done = step === 'done' || i < current
        return (
          <li
            key={s.key}
            aria-current={here ? 'step' : undefined}
            className={cn(
              'flex min-h-8 items-center gap-1.5 rounded-[9px] px-2.5',
              here
                ? 'bg-surface-elevated text-text-primary'
                : 'text-text-secondary'
            )}
          >
            <span className="font-numeric">{i + 1}</span> {s.label}
            {done && <span className="sr-only"> (done)</span>}
          </li>
        )
      })}
    </ol>
  )
}

/**
 * "Start pilot clean": deleting the test bookings, refunds and checkouts
 * made before launch, so the pilot starts from an empty slate.
 *
 * Three steps. Scope: everything before a cutoff (now, by default) or only
 * the bookings ops marked Test, as a list with a box per booking to untick
 * any real one; real money is greyed out and cannot be ticked. Dry run: what
 * that deletes, in plain words, and the receipt numbering, with the list to
 * download (required). Confirm: a name, a backup, and a typed phrase.
 *
 * The page exists only while ADMIN_DATA_RESET is on at the API; otherwise it
 * says so and does nothing.
 */
function StartPilotClean({
  config,
  fetchedAt,
}: {
  config: DataResetConfig
  /** When `config` was fetched, by this browser's clock. */
  fetchedAt: number
}) {
  const preview = usePreviewDataReset()
  const { keyMode, maxChainsPerRun, maxCheckoutsPerRun } = config

  const [step, setStep] = useState<Step>('scope')
  const [mode, setMode] = useState<Mode>('before_cutoff')
  // The default cutoff is now: the moment the page opens, on the server's
  // clock. The config may come from a cache minutes old, so its `now` is
  // moved on by the time since it was fetched. Read off the server's clock
  // rather than this device's, so a phone running fast can't send a cutoff
  // the API refuses as in the future.
  const [cutoffInput, setCutoffInput] = useState(() =>
    toIstInput(
      new Date(
        Date.parse(config.now) + Math.max(0, Date.now() - fetchedAt)
      ).toISOString()
    )
  )
  const [progress, setProgress] = useState<DataResetPreview | null>(null)

  // The scope's list, and what is ticked in it. `unticked` is every row the
  // owner took the tick off, kept across "Load again" so a real booking
  // they protected is never quietly ticked again.
  const [listing, setListing] = useState<DataResetPreview | null>(null)
  const [tickedChains, setTickedChains] = useState<Set<string>>(new Set())
  const [tickedCheckouts, setTickedCheckouts] = useState<Set<string>>(new Set())
  const [untickedChains, setUntickedChains] = useState<Set<string>>(new Set())
  const [untickedCheckouts, setUntickedCheckouts] = useState<Set<string>>(
    new Set()
  )
  // A cutoff run's complaints are one row with one tick; `untickedComplaints`
  // remembers the owner took it off, across "Load again", like the rows.
  const [tickedComplaints, setTickedComplaints] = useState(false)
  const [untickedComplaints, setUntickedComplaints] = useState(false)
  // The same for a cutoff run's usage events.
  const [tickedAnalytics, setTickedAnalytics] = useState(false)
  const [untickedAnalytics, setUntickedAnalytics] = useState(false)

  const [dryRun, setDryRun] = useState<DataResetPreview | null>(null)
  const [downloaded, setDownloaded] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [result, setResult] = useState<DataResetResult | null>(null)
  const [error, setError] = useState('')

  // Bumped whenever the scope changes, so a list still loading for the old
  // scope is dropped when it lands rather than shown under the new one.
  const scopeVersion = useRef(0)

  const cutoffIso = fromIstInput(cutoffInput)
  const scope: DataResetScope | null = useMemo(() => {
    if (mode === 'marked_test') return { kind: 'marked_test' }
    return cutoffIso ? { kind: 'before_cutoff', cutoff: cutoffIso } : null
  }, [mode, cutoffIso])

  const only = useMemo(
    () => ({
      chainIds: [...tickedChains],
      checkoutIds: [...tickedCheckouts],
      complaints: tickedComplaints,
      analytics: tickedAnalytics,
    }),
    [tickedChains, tickedCheckouts, tickedComplaints, tickedAnalytics]
  )

  // Each step's heading takes focus as it opens, so a screen reader hears
  // where the owner now is. Not on arrival: the page's own title is first.
  const headingRef = useRef<HTMLHeadingElement>(null)
  const shownStep = useRef(step)
  useEffect(() => {
    if (shownStep.current === step) return
    shownStep.current = step
    headingRef.current?.focus()
  }, [step])

  // A new scope makes the list on screen another scope's.
  const changeScope = (apply: () => void) => {
    scopeVersion.current += 1
    apply()
    setListing(null)
    setDryRun(null)
    setError('')
  }

  const listScope = () => {
    if (!scope) return
    setError('')
    const version = scopeVersion.current
    preview.mutate(
      { input: { scope }, onProgress: setProgress },
      {
        onSuccess: (data) => {
          if (version !== scopeVersion.current) return
          setListing(data)
          setTickedChains(
            ticksAfterReload(
              data.chains.filter((c) => c.selected).map((c) => c.rootId),
              untickedChains
            )
          )
          setTickedCheckouts(
            ticksAfterReload(
              data.checkouts.filter((c) => c.selected).map((c) => c.id),
              untickedCheckouts
            )
          )
          setTickedComplaints(data.complaints.selected && !untickedComplaints)
          setTickedAnalytics(
            (data.analyticsEvents?.selected ?? false) && !untickedAnalytics
          )
        },
        onError: (err) => {
          if (version === scopeVersion.current) {
            setError(errorMessage(err, "Couldn't load what's in scope"))
          }
        },
        onSettled: () => setProgress(null),
      }
    )
  }

  const runDryRun = () => {
    if (!scope) return
    setError('')
    setDownloaded(false)
    setDryRun(null)
    setStep('dryrun')
    preview.mutate(
      // Ids Razorpay could not answer for while listing stay unknown, rather
      // than being asked about again.
      {
        input: { scope, only, unknownIds: listing?.lookups.unknownIds },
        onProgress: setProgress,
      },
      {
        onSuccess: setDryRun,
        onError: (err) =>
          setError(errorMessage(err, "Couldn't run the dry run")),
        onSettled: () => setProgress(null),
      }
    )
  }

  const toggle = (set: Set<string>, id: string, on: boolean) => {
    const next = new Set(set)
    if (on) next.add(id)
    else next.delete(id)
    return next
  }
  const tickChain = (id: string, on: boolean) => {
    setTickedChains((set) => toggle(set, id, on))
    setUntickedChains((set) => toggle(set, id, !on))
  }
  const tickCheckout = (id: string, on: boolean) => {
    setTickedCheckouts((set) => toggle(set, id, on))
    setUntickedCheckouts((set) => toggle(set, id, !on))
  }

  const deletable = listing
    ? {
        chains: listing.chains.filter((c) => !c.kept).map((c) => c.rootId),
        checkouts: listing.checkouts.filter((c) => !c.kept).map((c) => c.id),
      }
    : { chains: [], checkouts: [] }
  const keptCount = listing
    ? [...listing.chains, ...listing.checkouts].filter((row) => row.kept).length
    : 0
  const hasComplaints = (listing?.complaints.count ?? 0) > 0
  const hasAnalytics = (listing?.analyticsEvents?.count ?? 0) > 0
  const nothingTicked =
    tickedChains.size === 0 &&
    tickedCheckouts.size === 0 &&
    !(hasComplaints && tickedComplaints) &&
    !(hasAnalytics && tickedAnalytics)
  // Ticked past what one run deletes: the run takes the oldest, the rest wait.
  const overCap =
    Math.max(0, tickedChains.size - maxChainsPerRun) +
    Math.max(0, tickedCheckouts.size - maxCheckoutsPerRun)
  // Left out by the cap rather than by the owner: the next run's.
  const waiting =
    deletable.chains.filter(
      (id) => !tickedChains.has(id) && !untickedChains.has(id)
    ).length +
    deletable.checkouts.filter(
      (id) => !tickedCheckouts.has(id) && !untickedCheckouts.has(id)
    ).length
  const atCap =
    tickedChains.size >= maxChainsPerRun ||
    tickedCheckouts.size >= maxCheckoutsPerRun

  return (
    <>
      <PageHeader
        title="Start pilot clean"
        subtitle="Delete the test bookings, refunds and checkouts made before launch. Real payments are always kept."
      />
      <Steps step={step} />

      {step === 'scope' && (
        <ScSection title="Scope">
          <h2
            ref={headingRef}
            tabIndex={-1}
            className="sr-only focus:outline-none"
          >
            Step 1: scope
          </h2>
          <ScSegmented
            aria-label="What to delete"
            className="w-full sm:w-auto [&_[role=radio]]:min-h-11"
            value={mode}
            onChange={(next) => changeScope(() => setMode(next))}
            // Held while a list loads, so the list shown is the scope picked.
            // The chosen one stays enabled for the arrow keys to land on.
            options={[
              {
                value: 'before_cutoff',
                label: 'Everything before the cutoff',
                disabled: preview.isPending && mode !== 'before_cutoff',
              },
              {
                value: 'marked_test',
                label: 'Only bookings marked Test',
                disabled: preview.isPending && mode !== 'marked_test',
              },
            ]}
          />

          {mode === 'before_cutoff' ? (
            <div className="flex flex-col gap-1">
              <ScInput
                id="reset-cutoff"
                type="datetime-local"
                label="Cutoff (India time)"
                value={cutoffInput}
                max={toIstInput(new Date().toISOString())}
                disabled={preview.isPending}
                onChange={(e) =>
                  changeScope(() => setCutoffInput(e.target.value))
                }
                className="min-h-11 font-numeric"
              />
              <p className="text-[12px] text-text-muted">
                Bookings made before this, and checkouts opened before it that
                never became a booking. Pick the moment the pilot starts, or the
                moment the live Razorpay keys went in.
              </p>
            </div>
          ) : (
            <p className="text-[12px] text-text-secondary">
              Every booking the team marked as Test on its page, whenever it was
              made.
            </p>
          )}

          {keyMode === 'test' && (
            <p className="text-[12px] text-text-primary">
              The API has Razorpay test keys. Payments made with them are
              confirmed as test payments; any it can&apos;t find are kept as
              real.
            </p>
          )}

          <ScButton
            variant="secondary"
            onClick={listScope}
            disabled={!scope || preview.isPending}
            className="min-h-11"
          >
            {preview.isPending
              ? 'Loading…'
              : listing
                ? 'Load again'
                : 'Show what’s in scope'}
          </ScButton>
          <CheckingLine preview={progress} />
          {error && (
            <p role="alert" className="text-[12px] text-error">
              {error}
            </p>
          )}

          {listing && (
            <div className="flex flex-col gap-3">
              <div className="flex flex-wrap items-center justify-between gap-2 text-[12px] text-text-secondary">
                <p>
                  <span className="font-numeric text-text-primary">
                    {tickedChains.size}
                  </span>{' '}
                  of {plural(listing.chains.length, 'booking', 'bookings')}{' '}
                  ticked
                  {keptCount > 0 && (
                    <>
                      {' '}
                      · <span className="font-numeric">{keptCount}</span> kept
                    </>
                  )}
                </p>
                <div className="flex gap-1">
                  <button
                    type="button"
                    onClick={() => {
                      setTickedChains(
                        tickAll(deletable.chains, maxChainsPerRun).ticked
                      )
                      setTickedCheckouts(
                        tickAll(deletable.checkouts, maxCheckoutsPerRun).ticked
                      )
                      setUntickedChains(new Set())
                      setUntickedCheckouts(new Set())
                      setTickedComplaints(hasComplaints)
                      setUntickedComplaints(false)
                      setTickedAnalytics(hasAnalytics)
                      setUntickedAnalytics(false)
                    }}
                    className="min-h-11 px-2 font-medium text-text-primary underline-offset-2 hover:underline"
                  >
                    Tick all
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setTickedChains(new Set())
                      setTickedCheckouts(new Set())
                      setUntickedChains(new Set(deletable.chains))
                      setUntickedCheckouts(new Set(deletable.checkouts))
                      setTickedComplaints(false)
                      setUntickedComplaints(hasComplaints)
                      setTickedAnalytics(false)
                      setUntickedAnalytics(hasAnalytics)
                    }}
                    className="min-h-11 px-2 font-medium text-text-primary underline-offset-2 hover:underline"
                  >
                    Tick none
                  </button>
                </div>
              </div>

              {listing.chains.length === 0 ? (
                <p className="text-[13px] text-text-secondary">
                  No bookings in scope.
                </p>
              ) : (
                <ul
                  aria-label="Bookings in scope"
                  className="flex flex-col gap-1.5"
                >
                  {listing.chains.map((chain) => (
                    <ChainRow
                      key={chain.rootId}
                      chain={chain}
                      checked={tickedChains.has(chain.rootId)}
                      onToggle={(on) => tickChain(chain.rootId, on)}
                    />
                  ))}
                </ul>
              )}

              {listing.checkouts.length > 0 && (
                <>
                  <p className="text-[12px] font-semibold text-text-secondary">
                    Checkouts that never became a booking
                  </p>
                  <ul
                    aria-label="Checkouts in scope"
                    className="flex flex-col gap-1.5"
                  >
                    {listing.checkouts.map((checkout) => (
                      <CheckoutRow
                        key={checkout.id}
                        checkout={checkout}
                        checked={tickedCheckouts.has(checkout.id)}
                        onToggle={(on) => tickCheckout(checkout.id, on)}
                      />
                    ))}
                  </ul>
                </>
              )}

              {hasComplaints && (
                <>
                  <p className="text-[12px] font-semibold text-text-secondary">
                    Customer complaints
                  </p>
                  <ul
                    aria-label="Complaints in scope"
                    className="flex flex-col gap-1.5"
                  >
                    <ComplaintsRow
                      complaints={listing.complaints}
                      checked={tickedComplaints}
                      onToggle={(on) => {
                        setTickedComplaints(on)
                        setUntickedComplaints(!on)
                      }}
                    />
                  </ul>
                </>
              )}

              {hasAnalytics && listing.analyticsEvents && (
                <>
                  <p className="text-[12px] font-semibold text-text-secondary">
                    Usage events
                  </p>
                  <ul
                    aria-label="Usage events in scope"
                    className="flex flex-col gap-1.5"
                  >
                    <AnalyticsEventsRow
                      events={listing.analyticsEvents}
                      checked={tickedAnalytics}
                      onToggle={(on) => {
                        setTickedAnalytics(on)
                        setUntickedAnalytics(!on)
                      }}
                    />
                  </ul>
                </>
              )}

              <ScButton
                variant="secondary"
                onClick={runDryRun}
                disabled={nothingTicked || preview.isPending}
                className="min-h-11"
              >
                Dry run
              </ScButton>
              {nothingTicked && (
                <p className="text-[12px] text-text-muted">
                  Tick at least one row for a dry run.
                </p>
              )}
              {overCap > 0 && (
                <p className="text-[12px] text-text-primary">
                  One run deletes up to{' '}
                  <span className="font-numeric">{maxChainsPerRun}</span>{' '}
                  bookings and{' '}
                  <span className="font-numeric">{maxCheckoutsPerRun}</span>{' '}
                  checkouts, oldest first. The other{' '}
                  <span className="font-numeric">{overCap}</span> ticked wait
                  for the next run.
                </p>
              )}
              {overCap === 0 && atCap && waiting > 0 && (
                <p className="text-[12px] text-text-secondary">
                  One run deletes up to{' '}
                  <span className="font-numeric">{maxChainsPerRun}</span>{' '}
                  bookings and{' '}
                  <span className="font-numeric">{maxCheckoutsPerRun}</span>{' '}
                  checkouts, oldest first.{' '}
                  <span className="font-numeric">{waiting}</span> more can go in
                  the next run.
                </p>
              )}
            </div>
          )}
        </ScSection>
      )}

      {step === 'dryrun' && (
        <ScSection title="Dry run">
          <h2
            ref={headingRef}
            tabIndex={-1}
            className="sr-only focus:outline-none"
          >
            Step 2: dry run
          </h2>
          <p className="text-[12px] text-text-secondary">
            Nothing has been deleted yet.
          </p>
          {dryRun ? (
            <DryRunSummary
              preview={dryRun}
              downloaded={downloaded}
              onDownloaded={() => setDownloaded(true)}
            />
          ) : (
            !error && (
              <>
                <SkeletonList count={2} itemClassName="h-16" />
                <CheckingLine preview={progress} />
              </>
            )
          )}
          {error && (
            <div
              role="alert"
              className="flex flex-col gap-2 text-[12px] text-error"
            >
              <p>{error}</p>
              {!dryRun && (
                <ScButton
                  variant="secondary"
                  fullWidth={false}
                  onClick={runDryRun}
                  disabled={preview.isPending}
                  className="min-h-11 px-4"
                >
                  Run the dry run again
                </ScButton>
              )}
            </div>
          )}
          <div className="flex flex-col-reverse gap-2 sm:flex-row">
            <ScButton
              variant="secondary"
              onClick={() => {
                setError('')
                setStep('scope')
              }}
              disabled={preview.isPending}
              className="min-h-11"
            >
              Back to the list
            </ScButton>
            <ScButton
              variant="secondary"
              onClick={() => setStep('confirm')}
              disabled={
                !dryRun || !downloaded || dryRun.countLines.length === 0
              }
              className="min-h-11"
            >
              Continue
            </ScButton>
          </div>
          {dryRun && !downloaded && (
            <p className="text-[12px] text-text-muted">
              Download the list to continue.
            </p>
          )}
        </ScSection>
      )}

      {step === 'confirm' && dryRun && scope && (
        <ScSection title="Confirm">
          <h2
            ref={headingRef}
            tabIndex={-1}
            className="sr-only focus:outline-none"
          >
            Step 3: confirm
          </h2>
          <p className="text-[13px] text-text-primary">
            {dryRun.countLines.join(', ')}.
            {dryRun.receiptPlan.map((year) => ` ${year.words}.`).join('')}
          </p>
          <ConfirmDelete
            preview={dryRun}
            scope={scope}
            only={only}
            onDone={(done) => {
              setResult(done)
              setStep('done')
            }}
            onStale={runDryRun}
            onPendingChange={setDeleting}
          />
          {/* Not a way out once the delete is running: it can't be called back. */}
          <ScButton
            variant="secondary"
            onClick={() => setStep('dryrun')}
            disabled={deleting}
            className="min-h-11"
          >
            Back
          </ScButton>
        </ScSection>
      )}

      {step === 'done' && result && (
        <ScSection title="Done">
          <h2
            ref={headingRef}
            tabIndex={-1}
            className="sr-only focus:outline-none"
          >
            Done
          </h2>
          <ResultSummary result={result} />
          <p className="text-[12px] text-text-secondary">
            Ask Lokesh to switch this tool off again (remove ADMIN_DATA_RESET)
            now it has run.
          </p>
          <Link
            href="/bookings"
            className="inline-flex min-h-11 items-center text-[13px] font-medium text-text-primary underline underline-offset-2"
          >
            Go to bookings
          </Link>
        </ScSection>
      )}
    </>
  )
}

export default function DataResetPage() {
  const router = useRouter()
  const {
    data: config,
    isPending,
    error,
    refetch,
    dataUpdatedAt,
  } = useDataResetConfig()

  // A dead admin session is a redirect, not an error message.
  useEffect(() => {
    if (isAuthError(error)) router.replace('/login')
  }, [error, router])

  if (isPending) {
    return (
      <>
        <PageHeader title="Start pilot clean" />
        <SkeletonList count={2} itemClassName="h-24" />
      </>
    )
  }
  if (error) {
    return (
      <>
        <PageHeader title="Start pilot clean" />
        <ErrorState
          message={errorMessage(error, 'Failed to load')}
          onRetry={() => void refetch()}
        />
      </>
    )
  }
  if (!config) {
    return (
      <>
        <PageHeader title="Start pilot clean" />
        <EmptyState
          icon={<IconTrash size={32} stroke={1.5} />}
          title="Switched off"
          subtitle="This tool is only switched on for the day test data is cleared, after a database backup. Lokesh turns it on."
        />
      </>
    )
  }
  return <StartPilotClean config={config} fetchedAt={dataUpdatedAt} />
}
