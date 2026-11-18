'use client'

import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'react-toastify'
import {
  IconBook,
  IconBuildingBank,
  IconBuildingStore,
  IconCalendar,
  IconCheck,
  IconCircle,
  IconCircleCheck,
  IconClock,
  IconDownload,
  IconFileText,
  IconFileZip,
  IconHistory,
  IconInfoCircle,
  IconLock,
  IconPhoto,
  IconReceipt,
  IconStar,
  IconTable,
  IconTool,
  type Icon,
} from '@tabler/icons-react'
import { ScButton } from '@repo/ui/sc/button'
import { ScSheet } from '@repo/ui/sc/modal'
import { ScSwitch } from '@repo/ui/sc/switch'
import {
  getAdminBackupPage,
  startAdminBackup,
  type AdminBackupLast,
  type AdminBackupManifest,
} from '@repo/core/api/admin-backup'
import { adminBackupKeys, useAdminBackupLast, useAdminBackupManifest } from '@repo/core/api/hooks/use-admin-backup'
import { errorMessage } from '@repo/core/api/hooks/use-discounts'
import { cn } from '@repo/core/utils'
import { SignedAs } from '@/components/signed-as'
import { useCanDeleteAnything } from '@/components/owner-delete'
import {
  BackupStopped,
  backupFileName,
  backupWhen,
  buildBackupZip,
  count,
  formatBytes,
  groupCount,
  lastBackupLine,
  saveZip,
  spreadsheetsLine,
  type BackupProgress,
} from '@/lib/garage-backup'

/**
 * Back up all garages (owner-approved screens, 18 Nov 2026): the Garages
 * page's "Download backup", beside Add garage, and under it when the last
 * backup was taken and by whom. Only the owner sees either (the owner's
 * login or the shared break-glass login, as for the deletes); the API refuses
 * anyone else. The run lives here rather than in the sheet, so closing the
 * sheet while it prepares keeps it going: the file downloads by itself.
 */
export function GarageBackupHeader({ children }: { children: ReactNode }) {
  const isOwner = useCanDeleteAnything()
  const last = useAdminBackupLast(isOwner)
  const [open, setOpen] = useState(false)
  // Read when the file is saved, after the sheet may have been closed.
  const openRef = useRef(open)
  useEffect(() => {
    openRef.current = open
  }, [open])
  const run = useBackupRun(() => openRef.current)
  const inBrowser = useSyncExternalStore(
    noSubscription,
    () => true,
    () => false
  )

  if (!isOwner) return <>{children}</>

  return (
    <div className="flex flex-col items-end gap-1.5">
      <div className="flex flex-wrap items-center justify-end gap-2">
        <ScButton
          type="button"
          variant="secondary"
          fullWidth={false}
          onClick={() => setOpen(true)}
          className="inline-flex min-h-11 items-center justify-center gap-1.5 px-4"
        >
          <IconDownload size={16} aria-hidden="true" /> Download backup
        </ScButton>
        {children}
      </div>
      {last.data?.lastBackup && (
        <p className="text-[12px] text-text-secondary" data-testid="last-backup">
          {lastBackupLine(last.data.lastBackup)}
        </p>
      )}
      {/* On document.body, as the marks' sheets are: inside the page, a
          phone's bottom bar would sit over the sheet's buttons. */}
      {inBrowser && createPortal(<BackupSheet open={open} onClose={() => setOpen(false)} run={run} />, document.body)}
    </div>
  )
}

const noSubscription = () => () => {}

type RunState =
  | { stage: 'idle' }
  | { stage: 'preparing'; manifest: AdminBackupManifest; progress: BackupProgress | null }
  | {
      stage: 'done'
      manifest: AdminBackupManifest
      blob: Blob
      filename: string
      full: boolean
      recorded: AdminBackupLast
    }
  | { stage: 'failed'; message: string }

type BackupRun = ReturnType<typeof useBackupRun>

function useBackupRun(sheetOpen: () => boolean) {
  const queryClient = useQueryClient()
  const [state, setState] = useState<RunState>({ stage: 'idle' })
  const stopRef = useRef(false)

  const start = async (manifest: AdminBackupManifest, full: boolean) => {
    stopRef.current = false
    setState({ stage: 'preparing', manifest, progress: null })
    try {
      // Recorded before a single row is read; its id opens the pages.
      const started = await startAdminBackup(full)
      void queryClient.invalidateQueries({ queryKey: adminBackupKeys.last() })
      const result = await buildBackupZip({
        manifest,
        full,
        at: started.at,
        by: started.by,
        fetchPage: (table, cursor) => getAdminBackupPage(table, { backupId: started.backupId, cursor, full }),
        onProgress: (progress) =>
          setState((now) => (now.stage === 'preparing' ? { ...now, progress } : now)),
        shouldStop: () => stopRef.current,
      })
      const blob = new Blob(result.chunks as BlobPart[], { type: 'application/zip' })
      const filename = backupFileName()
      saveZip(blob, filename)
      // Closed while it prepared: say so, since the sheet that would isn't up.
      if (!sheetOpen()) toast.success(`Backup downloaded: ${filename}`)
      setState({
        stage: 'done',
        manifest,
        blob,
        filename,
        full,
        recorded: { at: started.at, by: started.by, full },
      })
    } catch (error) {
      if (error instanceof BackupStopped) {
        setState({ stage: 'idle' })
        toast.info('Backup stopped. Nothing was downloaded.')
        return
      }
      const message = backupFailure(error)
      setState({ stage: 'failed', message })
      // Closed while it prepared: the sheet that says so isn't up.
      if (!sheetOpen()) toast.error(`The backup stopped: ${message} Open Download backup to try again.`)
    }
  }

  return {
    state,
    start,
    stop: () => {
      stopRef.current = true
    },
    reset: () => setState({ stage: 'idle' }),
  }
}

/**
 * Why a backup stopped, in words the owner can act on: the server's own
 * reason (an expired or refused backup), or a connection that kept dropping.
 */
function backupFailure(error: unknown): string {
  if (error instanceof TypeError) return 'the connection dropped. Check the internet and try again.'
  return errorMessage(error, 'something went wrong. Try again.')
}

const GROUP_ICONS: Record<string, Icon> = {
  garages: IconBuildingStore,
  services: IconTool,
  hours: IconClock,
  photos: IconPhoto,
  bank: IconBuildingBank,
  bookings: IconCalendar,
  reviews: IconStar,
  payouts: IconReceipt,
  garage_book: IconBook,
  documents: IconFileText,
}

const TITLE = 'Back up all garages'

function BackupSheet({ open, onClose, run }: { open: boolean; onClose: () => void; run: BackupRun }) {
  const { state } = run
  const close = () => {
    // Done and failed are read once; preparing carries on behind the sheet.
    if (state.stage === 'done' || state.stage === 'failed') run.reset()
    onClose()
  }
  return (
    <ScSheet open={open} onClose={close} aria-label={TITLE}>
      <div className="px-5 pt-1">
        <h2 className="text-[17px] font-semibold text-text-primary">{TITLE}</h2>
        {state.stage === 'idle' && <ReviewStep open={open} onCancel={close} onStart={run.start} />}
        {state.stage === 'preparing' && <PreparingStep manifest={state.manifest} progress={state.progress} onStop={run.stop} />}
        {state.stage === 'done' && (
          <DoneStep
            manifest={state.manifest}
            blob={state.blob}
            filename={state.filename}
            full={state.full}
            recorded={state.recorded}
            onDone={close}
          />
        )}
        {state.stage === 'failed' && (
          <div>
            <p role="alert" className="mt-3 text-[14px] leading-snug text-error">
              The backup stopped: {state.message}
            </p>
            <div className="mt-5 flex gap-2.5">
              <ScButton type="button" variant="outline" className="flex-1" onClick={close}>
                Close
              </ScButton>
              <ScButton type="button" variant="main" className="flex-[2]" onClick={run.reset}>
                Try again
              </ScButton>
            </div>
          </div>
        )}
      </div>
    </ScSheet>
  )
}

function ReviewStep({
  open,
  onCancel,
  onStart,
}: {
  open: boolean
  onCancel: () => void
  onStart: (manifest: AdminBackupManifest, full: boolean) => void
}) {
  const manifest = useAdminBackupManifest(open)
  const [full, setFull] = useState(false)
  const data = manifest.data

  return (
    <>
      <p className="mt-1 text-[14px] leading-relaxed text-text-secondary">
        One .zip file. Inside, a spreadsheet (CSV) for each kind of data. It opens in Excel or Google Sheets.
      </p>

      {manifest.isError ? (
        <p role="alert" className="mt-4 text-[14px] text-error">
          Couldn&rsquo;t read what&rsquo;s in the backup: {errorMessage(manifest.error, 'try again in a moment.')}
        </p>
      ) : !data ? (
        <div className="mt-4 h-[300px] animate-pulse rounded-[14px] bg-surface motion-reduce:animate-none" aria-label="Loading" />
      ) : (
        <>
          <div className="mt-4 flex items-center gap-3 rounded-[14px] border border-border bg-surface px-4 py-3.5">
            <IconFileZip size={22} stroke={1.5} aria-hidden="true" className="shrink-0 text-text-secondary" />
            <p className="text-[15px] text-text-primary" data-testid="backup-totals">
              <span className="font-numeric font-semibold">{count(data.totals.garages)}</span> garages ·{' '}
              <span className="font-numeric font-semibold">{count(data.totals.bookings)}</span> bookings ·{' '}
              <span className="font-numeric font-semibold">{count(data.totals.garageBookBills)}</span> Garage Book bills
            </p>
          </div>

          <h3 className="mt-4 text-[13px] text-text-secondary">What&rsquo;s inside: one spreadsheet each</h3>
          <ul className="mt-1" aria-label="What’s inside">
            {data.groups.map((group) => {
              const GroupIcon = GROUP_ICONS[group.key] ?? IconTable
              return (
                <li key={group.key} className="flex items-center gap-3 border-b border-border py-2.5 text-[14px]">
                  <GroupIcon size={18} stroke={1.5} aria-hidden="true" className="shrink-0 text-text-secondary" />
                  <span className="min-w-0 flex-1 text-text-primary">{group.label}</span>
                  <span className="font-numeric text-text-secondary">{groupCount(group)}</span>
                </li>
              )
            })}
            <li className="flex items-center gap-3 py-2.5 text-[14px]">
              <IconInfoCircle size={18} stroke={1.5} aria-hidden="true" className="shrink-0 text-text-secondary" />
              <span className="text-text-primary">&ldquo;Read me&rdquo;: what each column means</span>
            </li>
          </ul>
        </>
      )}

      <div className="mt-3 flex items-center justify-between gap-3 border-t border-border pt-3">
        <div className="min-w-0">
          <p className="text-[14px] font-medium text-text-primary">Include full phone numbers and bank account numbers</p>
          <p className="text-[12px] text-text-secondary">
            {full ? 'On: full numbers, for this download only' : 'Off: they’re shown as 98•••••210'}
          </p>
        </div>
        <ScSwitch checked={full} onChange={setFull} label="Include full phone numbers and bank account numbers" />
      </div>

      <div className="mt-3 flex gap-2.5 rounded-[14px] bg-surface px-3.5 py-3 text-[13px] leading-snug text-text-secondary">
        <IconHistory size={16} stroke={1.5} aria-hidden="true" className="mt-0.5 shrink-0" />
        <p>Each download is recorded in the activity log: who, when, and whether full numbers were included.</p>
      </div>

      <SignedAs className="mt-3" />

      <div className="mt-4 flex gap-2.5">
        <ScButton type="button" variant="outline" className="flex-1 px-4" onClick={onCancel}>
          Cancel
        </ScButton>
        <ScButton
          type="button"
          variant="main"
          className="flex-[2] gap-2 whitespace-nowrap px-4"
          disabled={!data}
          onClick={() => data && onStart(data, full)}
        >
          <IconDownload size={18} aria-hidden="true" /> Download backup (.zip)
        </ScButton>
      </div>
    </>
  )
}

function PreparingStep({
  manifest,
  progress,
  onStop,
}: {
  manifest: AdminBackupManifest
  progress: BackupProgress | null
  onStop: () => void
}) {
  const [stopping, setStopping] = useState(false)
  const percent = progress?.percent ?? 0
  return (
    <>
      <p className="mt-1 text-[14px] leading-relaxed text-text-secondary">
        Preparing the file. You can keep working; it downloads by itself when ready.
      </p>
      <div className="mt-4 flex items-baseline justify-between gap-3">
        <p className="text-[15px] text-text-primary" aria-live="polite">
          Preparing… {progress?.line ?? ''}
        </p>
        {progress?.eta && <p className="shrink-0 text-[13px] text-text-secondary">{progress.eta}</p>}
      </div>
      <Bar percent={percent} className="mt-2 h-1.5" label="Backup progress" />

      <ul className="mt-3">
        {manifest.groups.map((group) => {
          const row = progress?.groups.find((g) => g.key === group.key)
          const status = row?.status ?? 'waiting'
          return (
            <li key={group.key} className="flex items-center gap-3 border-b border-border py-2.5 text-[14px] last:border-b-0">
              {status === 'done' ? (
                <IconCircleCheck size={18} stroke={1.5} aria-hidden="true" className="shrink-0 text-text-secondary" />
              ) : (
                <IconCircle size={18} stroke={1.5} aria-hidden="true" className="shrink-0 text-text-secondary" />
              )}
              <span className={cn('min-w-0 flex-1', status === 'waiting' ? 'text-text-secondary' : 'text-text-primary')}>
                {group.key === 'garage_book' ? group.short : group.label}
              </span>
              {status === 'done' ? (
                <span className="text-[13px] font-medium text-success">Done</span>
              ) : status === 'active' ? (
                <span className="flex items-center gap-2.5">
                  <Bar percent={row?.percent ?? 0} className="h-1 w-24" />
                  <span className="w-9 text-right font-numeric text-[13px] text-text-primary">{row?.percent ?? 0}%</span>
                </span>
              ) : (
                <span className="text-[13px] text-text-secondary">Waiting</span>
              )}
            </li>
          )
        })}
      </ul>

      <div className="mt-4 flex gap-2.5">
        <ScButton
          type="button"
          variant="outline"
          className="flex-1"
          disabled={stopping}
          onClick={() => {
            setStopping(true)
            onStop()
          }}
        >
          Stop
        </ScButton>
        <ScButton type="button" variant="main" className="flex-[2]" disabled>
          Preparing…
        </ScButton>
      </div>
    </>
  )
}

function DoneStep({
  manifest,
  blob,
  filename,
  full,
  recorded,
  onDone,
}: {
  manifest: AdminBackupManifest
  blob: Blob
  filename: string
  full: boolean
  recorded: AdminBackupLast
  onDone: () => void
}) {
  return (
    <>
      <p className="mt-1 text-[14px] text-text-secondary">Your backup is ready.</p>
      <div className="mt-5 flex flex-col items-center text-center">
        <span className="flex size-14 items-center justify-center rounded-full bg-success-muted text-success">
          <IconCheck size={26} stroke={2} aria-hidden="true" />
        </span>
        <p className="mt-3 text-[16px] font-medium text-text-primary">Downloaded</p>
        <p className="mt-1 text-[15px] font-medium text-text-primary" data-testid="backup-file">
          {filename} · {formatBytes(blob.size)}
        </p>
        <p className="mt-1.5 text-[13px] text-text-secondary">In your computer&rsquo;s Downloads folder.</p>
      </div>

      <ul className="mt-5 border-t border-border">
        <li className="flex items-center gap-3 border-b border-border py-2.5 text-[14px]">
          <IconTable size={18} stroke={1.5} aria-hidden="true" className="shrink-0 text-text-secondary" />
          <span className="min-w-0 flex-1 text-text-primary">{spreadsheetsLine(manifest)}</span>
          <span className="text-[13px] text-text-secondary">{full ? 'full numbers' : 'masked numbers'}</span>
        </li>
        <li className="flex items-center gap-3 py-2.5 text-[14px]">
          <IconHistory size={18} stroke={1.5} aria-hidden="true" className="shrink-0 text-text-secondary" />
          <span className="min-w-0 flex-1 text-text-primary">Recorded in the activity log</span>
          <span className="text-[13px] text-text-secondary">
            {backupWhen(recorded.at)} · {recorded.by}
          </span>
        </li>
      </ul>

      <div className="mt-3 flex gap-2.5 rounded-[14px] bg-surface px-3.5 py-3 text-[13px] leading-snug text-text-secondary">
        <IconLock size={16} stroke={1.5} aria-hidden="true" className="mt-0.5 shrink-0" />
        <p>
          It holds customers&rsquo; names and bookings. Keep it somewhere private, like your own Google Drive, not a
          shared WhatsApp group.
        </p>
      </div>

      <div className="mt-4 flex gap-2.5">
        <ScButton
          type="button"
          variant="outline"
          className="flex-1 gap-2 whitespace-nowrap px-4"
          onClick={() => saveZip(blob, filename)}
        >
          <IconDownload size={18} aria-hidden="true" /> Download again
        </ScButton>
        <ScButton type="button" variant="main" className="flex-1" onClick={onDone}>
          Done
        </ScButton>
      </div>
    </>
  )
}

/** The white progress bar of the screens (ProgressBar is red, for a customer's steps). */
function Bar({ percent, className, label }: { percent: number; className?: string; label?: string }) {
  return (
    <div
      className={cn('overflow-hidden rounded-full bg-surface-elevated', className)}
      role={label ? 'progressbar' : undefined}
      aria-label={label}
      aria-valuenow={label ? percent : undefined}
      aria-valuemin={label ? 0 : undefined}
      aria-valuemax={label ? 100 : undefined}
    >
      <div className="h-full rounded-full bg-brand-white transition-[width] duration-300" style={{ width: `${percent}%` }} />
    </div>
  )
}
