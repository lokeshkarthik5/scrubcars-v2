'use client'

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react'
import Link from 'next/link'
import {
  IconArchive,
  IconArchiveOff,
  IconChevronRight,
  IconDots,
  IconFileCertificate,
  IconPencil,
  IconTrash,
} from '@tabler/icons-react'
import { Figures } from '@repo/ui/sc/figures'
import { StatusChip } from '@repo/ui/sc/status-chip'
import { OutsideCityChip } from '@repo/ui/features/outside-city'
import type { AdminVendor } from '@repo/core/api/admin'
import { cn } from '@repo/core/utils'
import { MarksCell } from '@/components/marks/marks-cell'
import { MissingTags } from '@/components/marks/missing-tags'
import { WithTeamCell } from '@/components/collection/with-team-cell'
import type { AdminTableColumn } from '@/components/table'
import {
  bookingParts,
  bookingsLine,
  editHref,
  garageArea,
  garageNextStep,
  hasDocumentsToReview,
  nextStepRank,
  onboardedBy,
  stageCell,
  type GarageNextStep,
  type MetaPart,
} from '@/lib/vendor-list'

export interface GarageColumnsContext {
  /** This list as it is now, for every link's `back`. */
  back: string
  now: number
  /** Columns for fields an older API does not send yet. */
  showMissing: boolean
  showMarks: boolean
  showOnboardedBy: boolean
  openId: string | null
  onOpen: (v: AdminVendor) => void
  verifyingId: string | null
  busyId: string | null
  rowErrors: Record<string, string>
  onVerify: (v: AdminVendor) => void
  onArchiveToggle: (v: AdminVendor) => void
  onMoveToBin: (v: AdminVendor) => void
}

/** The next step's words in its tone: red-orange can't go live, amber chase. */
export const STEP_TONE: Record<GarageNextStep['tone'], string> = {
  late: 'text-tone-late-text',
  attention: 'text-warning',
  neutral: 'text-text-primary',
}

/**
 * The Garages table's columns (mockups 06 and 07): Garage (name, owner) ·
 * Area · Modes · Stage · Missing · Marks · Onboarded by · Bookings · Next
 * step, then the row's own buttons. On a phone a row is the name and what
 * is missing, with its stage and next step on the right.
 */
export function garageColumns(
  ctx: GarageColumnsContext
): AdminTableColumn<AdminVendor>[] {
  const columns: Array<AdminTableColumn<AdminVendor> | false> = [
    {
      id: 'garage',
      header: 'Garage',
      phone: 'title',
      width: '220px',
      sortValue: (v) => v.businessName,
      cell: (v) => (
        <GarageCell v={v} open={ctx.openId === v.id} onOpen={ctx.onOpen} />
      ),
    },
    {
      id: 'area',
      header: 'Area',
      phone: ctx.showMissing ? 'hidden' : 'subtitle',
      sortValue: (v) => garageArea(v),
      cell: (v) => <AreaCell v={v} />,
    },
    {
      id: 'modes',
      header: 'Modes',
      cell: (v) => <ModesCell parts={bookingParts(v)} />,
    },
    {
      id: 'stage',
      header: 'Stage',
      phone: 'aside',
      sortValue: (v) => stageCell(v).label,
      cell: (v) => {
        const stage = stageCell(v)
        return <StatusChip tone={stage.tone}>{stage.label}</StatusChip>
      },
    },
    ctx.showMissing && {
      id: 'missing',
      header: 'Missing',
      phone: 'subtitle',
      sortFirst: 'desc',
      sortValue: (v) => v.missing?.length ?? null,
      cell: (v) => <MissingCell v={v} />,
    },
    ctx.showMarks && {
      id: 'marks',
      header: 'Marks',
      cell: (v) => (
        <div className="flex min-w-[140px] flex-col gap-1">
          {v.openCollection && <WithTeamCell vendor={v} />}
          <MarksCell vendor={v} />
        </div>
      ),
    },
    ctx.showOnboardedBy && {
      id: 'onboardedBy',
      header: 'Onboarded by',
      sortValue: (v) => onboardedBy(v),
      cell: (v) =>
        onboardedBy(v) ?? <span className="text-text-muted">Not set</span>,
    },
    {
      id: 'bookings',
      header: 'Bookings',
      align: 'end',
      sortFirst: 'desc',
      sortValue: (v) => v.bookingCount ?? null,
      cell: (v) =>
        v.bookingCount === undefined ? (
          <span className="text-text-muted">—</span>
        ) : (
          <>
            <span aria-hidden="true" className="font-numeric">
              {v.bookingCount}
            </span>
            {/* Read out, and found, as "Has 4 bookings". */}
            <span className="sr-only">{bookingsLine(v.bookingCount)}</span>
          </>
        ),
    },
    {
      id: 'next',
      header: 'Next step',
      phone: 'asideSub',
      sortFirst: 'desc',
      sortValue: (v) => nextStepRank(garageNextStep(v, ctx.now)),
      cell: (v) => <NextStepCell v={v} back={ctx.back} now={ctx.now} />,
    },
    {
      id: 'actions',
      header: 'Actions',
      headerHidden: true,
      align: 'end',
      cell: (v) => (
        <RowActions
          v={v}
          back={ctx.back}
          verifying={ctx.verifyingId === v.id}
          busy={ctx.busyId === v.id}
          error={ctx.rowErrors[v.id]}
          onVerify={() => ctx.onVerify(v)}
          onArchiveToggle={() => ctx.onArchiveToggle(v)}
          onMoveToBin={() => ctx.onMoveToBin(v)}
        />
      ),
    },
  ]
  return columns.filter((c): c is AdminTableColumn<AdminVendor> => Boolean(c))
}

/**
 * The garage's name, which names the row (`vendor-<id>-name`) and opens it
 * in the side panel, and its owner under it.
 */
function GarageCell({
  v,
  open,
  onOpen,
}: {
  v: AdminVendor
  open: boolean
  onOpen: (v: AdminVendor) => void
}) {
  return (
    <div className="min-w-0">
      <button
        type="button"
        id={`vendor-${v.id}-name`}
        aria-expanded={open}
        onClick={() => onOpen(v)}
        className="block max-w-full truncate text-left text-[13.5px] font-semibold tracking-[-0.01em] text-text-primary underline-offset-2 hover:underline"
      >
        {v.businessName}
      </button>
      {v.owner?.name && (
        <p className="truncate text-[12px] text-text-secondary">
          {v.owner.name}
        </p>
      )}
    </div>
  )
}

/**
 * Its area, and the sign customers see on a garage outside Chennai with how
 * far out it is: a garage whose city says Chennai but shows this is usually
 * pinned in the wrong place.
 */
function AreaCell({ v }: { v: AdminVendor }) {
  return (
    <div className="min-w-0">
      <p className="truncate text-text-primary max-md:text-[12px] max-md:text-text-secondary">
        {garageArea(v)}
      </p>
      {v.outsideServiceCity && (
        <p className="mt-0.5 flex min-w-0 items-center gap-1.5 text-[12px] text-text-muted">
          <OutsideCityChip outside={v.outsideServiceCity} className="min-w-0" />
          {v.outsideServiceCity.km !== null && (
            <span className="shrink-0 whitespace-nowrap">
              <span className="font-numeric">
                {v.outsideServiceCity.km.toLocaleString('en-IN')}
              </span>{' '}
              km out
            </span>
          )}
        </p>
      )}
    </div>
  )
}

/** "At the garage", "Doorstep 8 km", each on its own line. */
function ModesCell({ parts }: { parts: MetaPart[] }) {
  if (parts.length === 0)
    return <span className="text-[12px] text-warning">None on</span>
  return (
    <div className="flex flex-col text-[12px] leading-[17px] text-text-secondary">
      {parts.map((part, i) => (
        <span key={i} className="whitespace-nowrap">
          {part.text && <Figures text={part.text} />}
          {part.text && part.quiet && ' '}
          {part.quiet && (
            <span className="text-text-muted">
              <Figures text={part.quiet} />
            </span>
          )}
        </span>
      ))}
    </div>
  )
}

/**
 * What the garage still owes us (W4's tags: red can't go live without it,
 * amber can), or that nothing is missing.
 */
function MissingCell({ v }: { v: AdminVendor }) {
  if (!v.missing) return <span className="text-text-muted">—</span>
  if (v.missing.length === 0)
    return (
      <span className="text-[12px] text-tone-done-text">Nothing missing</span>
    )
  return (
    <div className="min-w-[180px] max-w-[240px] max-md:min-w-0">
      <MissingTags missing={v.missing} max={3} />
    </div>
  )
}

/**
 * The one thing to do now, and, when the garage sent documents, a link
 * straight to its Documents tab to review them.
 */
function NextStepCell({
  v,
  back,
  now,
}: {
  v: AdminVendor
  back: string
  now: number
}) {
  const step = garageNextStep(v, now)
  return (
    <div className="flex min-w-[150px] flex-col gap-0.5 text-[12.5px] max-md:min-w-0">
      {step ? (
        step.tab ? (
          <Link
            href={editHref(v.id, back, step.tab)}
            className={cn(
              'font-medium underline-offset-2 hover:underline',
              STEP_TONE[step.tone]
            )}
          >
            {step.text}
          </Link>
        ) : (
          <span className={cn('font-medium', STEP_TONE[step.tone])}>
            <Figures text={step.text} />
          </span>
        )
      ) : (
        !hasDocumentsToReview(v) && <span className="text-text-muted">—</span>
      )}
      {step?.detail && (
        <span className="text-[12px] text-text-muted max-md:hidden">
          <Figures text={step.detail} />
        </span>
      )}
      {/* Garage documents waiting for Detlio (0043). */}
      {hasDocumentsToReview(v) && v.documents && (
        <Link
          href={editHref(v.id, back, 'documents')}
          className="inline-flex items-center gap-1 self-start whitespace-nowrap font-medium text-text-primary underline-offset-2 hover:underline max-md:hidden"
        >
          <IconFileCertificate
            size={14}
            aria-hidden="true"
            className="shrink-0 text-text-secondary"
          />
          <Figures
            text={`${v.documents.toReview} ${v.documents.toReview === 1 ? 'document' : 'documents'} to review`}
          />
          <IconChevronRight
            size={14}
            aria-hidden="true"
            className="text-text-muted"
          />
        </Link>
      )}
    </div>
  )
}

const ROW_BUTTON =
  'inline-flex min-h-9 items-center gap-1 rounded-[9px] border border-border px-2.5 text-[12px] font-medium text-text-primary transition-colors hover:bg-surface-elevated disabled:opacity-50'

/** Verify (or why it can't be yet), Edit, and ⋯ with Archive and Move to Bin. */
function RowActions({
  v,
  back,
  verifying,
  busy,
  error,
  onVerify,
  onArchiveToggle,
  onMoveToBin,
}: {
  v: AdminVendor
  back: string
  verifying: boolean
  busy: boolean
  error?: string
  onVerify: () => void
  onArchiveToggle: () => void
  onMoveToBin: () => void
}) {
  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center justify-end gap-1.5">
        {!v.isVerified &&
          (v.lat === null ? (
            // The server refuses to verify a garage with no pin: it opens
            // the map, where the pin is placed.
            <Link
              href={editHref(v.id, back, 'location')}
              className="whitespace-nowrap text-[12px] font-medium text-warning underline-offset-2 hover:underline"
            >
              Pin before verifying
            </Link>
          ) : (
            <button
              type="button"
              disabled={verifying}
              aria-label={`Verify ${v.businessName}`}
              onClick={onVerify}
              className={ROW_BUTTON}
            >
              {verifying ? 'Verifying…' : 'Verify'}
            </button>
          ))}
        <Link
          href={editHref(v.id, back)}
          aria-label={`Edit ${v.businessName}`}
          className={ROW_BUTTON}
        >
          <IconPencil size={14} aria-hidden="true" />
          <span className="max-lg:sr-only">Edit</span>
        </Link>
        <RowMenu
          name={v.businessName}
          menuId={`vendor-${v.id}-menu`}
          busy={busy}
          archived={v.status === 'archived'}
          onArchiveToggle={onArchiveToggle}
          onMoveToBin={onMoveToBin}
        />
      </div>
      {/* Said on the row that was pressed, and announced. */}
      {error && (
        <p
          id={`vendor-${v.id}-error`}
          role="alert"
          className="max-w-[220px] text-right text-[12px] text-error"
        >
          {error}
        </p>
      )}
    </div>
  )
}

/**
 * The row's ⋯: Archive (or take it out of the archive) and Move to Bin. A
 * disclosure, not an ARIA menu: two plain buttons, closed by Escape, by a
 * tap outside or by choosing one. Placed on the screen (fixed) beside its
 * button, so the table's sideways scroll never clips it, while staying in
 * the row's DOM. Move to Bin asks first, in its own sheet.
 */
function RowMenu({
  name,
  menuId,
  busy,
  archived,
  onArchiveToggle,
  onMoveToBin,
}: {
  name: string
  menuId: string
  busy: boolean
  archived: boolean
  onArchiveToggle: () => void
  onMoveToBin: () => void
}) {
  const [open, setOpen] = useState(false)
  const [place, setPlace] = useState<React.CSSProperties>({})
  const rootRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)

  // Beside its button: under it, or above when there is no room under it.
  const placeMenu = useCallback(() => {
    if (!buttonRef.current) return
    const rect = buttonRef.current.getBoundingClientRect()
    const right = Math.max(8, window.innerWidth - rect.right)
    setPlace(
      window.innerHeight - rect.bottom < 120
        ? {
            position: 'fixed',
            right,
            bottom: window.innerHeight - rect.top + 4,
          }
        : { position: 'fixed', right, top: rect.bottom + 4 }
    )
  }, [])

  useLayoutEffect(() => {
    if (open) placeMenu()
  }, [open, placeMenu])

  useEffect(() => {
    if (!open) return
    const onPointer = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      // Closes the menu, not the side panel behind it.
      event.preventDefault()
      setOpen(false)
      buttonRef.current?.focus()
    }
    // A fixed menu follows its button as the page or the table moves.
    const onMove = () => placeMenu()
    document.addEventListener('pointerdown', onPointer)
    document.addEventListener('keydown', onKey)
    window.addEventListener('resize', onMove)
    window.addEventListener('scroll', onMove, true)
    return () => {
      document.removeEventListener('pointerdown', onPointer)
      document.removeEventListener('keydown', onKey)
      window.removeEventListener('resize', onMove)
      window.removeEventListener('scroll', onMove, true)
    }
  }, [open, placeMenu])

  const choose = (action: () => void) => {
    setOpen(false)
    action()
  }
  const item =
    'flex min-h-11 w-full items-center gap-2.5 px-3.5 text-left text-[14px] text-text-primary transition-colors hover:bg-surface disabled:opacity-50'

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={buttonRef}
        type="button"
        aria-expanded={open}
        aria-controls={menuId}
        aria-label={`More for ${name}`}
        onClick={() => setOpen((value) => !value)}
        className="flex size-9 items-center justify-center rounded-[9px] text-text-secondary transition-colors hover:bg-surface-elevated hover:text-text-primary"
      >
        <IconDots size={18} stroke={1.5} aria-hidden="true" />
      </button>
      {open && (
        <div
          id={menuId}
          style={place}
          className="z-40 w-48 overflow-hidden rounded-xl border border-border bg-surface-elevated py-1 text-left shadow-lg"
        >
          <button
            type="button"
            disabled={busy}
            aria-label={
              archived ? `Restore ${name} from the archive` : `Archive ${name}`
            }
            onClick={() => choose(onArchiveToggle)}
            className={item}
          >
            {archived ? (
              <IconArchiveOff
                size={17}
                stroke={1.6}
                aria-hidden="true"
                className="text-text-secondary"
              />
            ) : (
              <IconArchive
                size={17}
                stroke={1.6}
                aria-hidden="true"
                className="text-text-secondary"
              />
            )}
            {archived ? 'Unarchive' : 'Archive'}
          </button>
          <button
            type="button"
            aria-label={`Move ${name} to the Bin`}
            onClick={() => choose(onMoveToBin)}
            className={cn(item, 'border-t border-border')}
          >
            <IconTrash
              size={17}
              stroke={1.6}
              aria-hidden="true"
              className="text-text-secondary"
            />
            Move to Bin
          </button>
        </div>
      )}
    </div>
  )
}
