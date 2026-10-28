'use client'

import {
  Fragment,
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
  IconPencil,
  IconTrash,
} from '@tabler/icons-react'
import { Figures } from '@repo/ui/sc/figures'
import { StatusChip } from '@repo/ui/sc/status-chip'
import { OutsideCityChip } from '@repo/ui/features/outside-city'
import type { AdminVendor } from '@repo/core/api/admin'
import { cn } from '@repo/core/utils'
import { ColourCell } from '@/components/garages/colour-tags'
import { MarksCell } from '@/components/marks/marks-cell'
import { MissingTags } from '@/components/marks/missing-tags'
import { WithTeamCell } from '@/components/collection/with-team-cell'
import type { AdminTableColumn, OptionalColumn } from '@/components/table'
import { colourSortValue } from '@/lib/garage-colours'
import {
  bookingParts,
  bookingsLine,
  editHref,
  garageArea,
  garageNextStep,
  hasDocumentsToReview,
  missingTagsThatFit,
  modesShort,
  nextStepRank,
  onboardedBy,
  stageCell,
  type GarageNextStep,
  SHOW_TO_CUSTOMERS_STEP,
} from '@/lib/vendor-list'

export interface GarageColumnsContext {
  /** This list as it is now, for every link's `back`. */
  back: string
  now: number
  /** Columns for fields an older API does not send yet. */
  showMissing: boolean
  showMarks: boolean
  showOnboardedBy: boolean
  /** The team's colour tags (0064): absent from an older API. */
  showColour?: boolean
  /**
   * Onboarded by is on screen: Garage, Area and Modes take less room, so the table
   * still fits a 1440 laptop.
   */
  narrow?: boolean
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
 * The Garages table's columns the Columns button can turn off. Onboarded by
 * starts off (mockup 06 has no room for it); choosing an Onboarded by
 * filter shows it whatever was chosen here.
 */
export const GARAGE_OPTIONAL_COLUMNS: OptionalColumn[] = [
  { id: 'area', header: 'Area' },
  { id: 'modes', header: 'Modes' },
  { id: 'colour', header: 'Colour' },
  { id: 'onboardedBy', header: 'Onboarded by', defaultHidden: true },
]

/**
 * The Garages table's columns (mockups 06 and 07), compact enough for a
 * 1440 laptop with no sideways scroll, with Onboarded by on too: Garage
 * (name, owner) · Area · Modes · Stage · Missing · Marks · (Onboarded by) ·
 * Bookings · Next step, where "Show to customers" sits when the garage needs it, then
 * the row's ⋯ (Edit, Archive, Move to Bin).
 *
 * On a phone a row is two lines (GARAGE_PHONE_GRID): the tick, the name,
 * its stage, Show (to customers) and ⋯; then its owner, what is missing and its mark.
 */
export function garageColumns(
  ctx: GarageColumnsContext
): AdminTableColumn<AdminVendor>[] {
  const columns: Array<AdminTableColumn<AdminVendor> | false> = [
    {
      id: 'garage',
      header: 'Garage',
      phone: 'contents',
      sortValue: (v) => v.businessName,
      cell: (v) => (
        <GarageCell
          v={v}
          open={ctx.openId === v.id}
          narrow={ctx.narrow}
          onOpen={ctx.onOpen}
        />
      ),
    },
    {
      id: 'area',
      header: 'Area',
      sortValue: (v) => garageArea(v),
      cell: (v) => <AreaCell v={v} narrow={ctx.narrow} />,
    },
    {
      id: 'modes',
      header: 'Modes',
      cell: (v) => <ModesCell v={v} narrow={ctx.narrow} />,
    },
    {
      id: 'stage',
      header: 'Stage',
      phone: 'aside',
      sortValue: (v) => stageCell(v).label,
      cell: (v) => {
        const stage = stageCell(v)
        return (
          <StatusChip
            tone={stage.tone}
            className="whitespace-nowrap max-md:ml-2"
          >
            {stage.label}
          </StatusChip>
        )
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
      phone: 'asideSub',
      cell: (v) => (
        <div className="flex min-w-0 max-w-[156px] flex-col items-start gap-1 max-md:ml-2 max-md:max-w-[30vw] max-md:items-end">
          {v.openCollection && <WithTeamCell vendor={v} compact />}
          {/* On a phone the teammate says enough. */}
          <MarksCell
            vendor={v}
            className={cn(v.openCollection && 'max-md:hidden')}
          />
        </div>
      ),
    },
    // The team's own colour (0064): sorts in the chips' order, none last;
    // a press opens the picker. On a phone the row's tint says it.
    ctx.showColour === true && {
      id: 'colour',
      header: 'Colour',
      sortValue: (v) => colourSortValue(v),
      cell: (v) => <ColourCell vendor={v} now={ctx.now} />,
    },
    ctx.showOnboardedBy && {
      id: 'onboardedBy',
      header: 'Onboarded by',
      sortValue: (v) => onboardedBy(v),
      cell: (v) => (
        <span
          className="block max-w-[88px] truncate"
          title={onboardedBy(v) ?? undefined}
        >
          {onboardedBy(v) ?? <span className="text-text-muted">Not set</span>}
        </span>
      ),
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
      phone: 'action',
      sortFirst: 'desc',
      sortValue: (v) => nextStepRank(garageNextStep(v, ctx.now)),
      cell: (v) => (
        <NextStepCell
          v={v}
          back={ctx.back}
          now={ctx.now}
          verifying={ctx.verifyingId === v.id}
          error={ctx.rowErrors[v.id]}
          onVerify={() => ctx.onVerify(v)}
        />
      ),
    },
    {
      id: 'more',
      header: 'More',
      headerHidden: true,
      align: 'end',
      phone: 'end',
      cellClassName: 'w-9 pl-0',
      cell: (v) => (
        <RowMenu
          name={v.businessName}
          editHref={editHref(v.id, ctx.back)}
          menuId={`vendor-${v.id}-menu`}
          busy={ctx.busyId === v.id}
          archived={v.status === 'archived'}
          onArchiveToggle={() => ctx.onArchiveToggle(v)}
          onMoveToBin={() => ctx.onMoveToBin(v)}
        />
      ),
    },
  ]
  return columns.filter((c): c is AdminTableColumn<AdminVendor> => Boolean(c))
}

/**
 * A garage row on a phone (AdminTable's `phoneGrid`), about half the height
 * of the old card: the tick; the name and its stage; then its owner, what
 * it is missing and its mark (or teammate) on the right, under the stage.
 * Show (to customers) sits beside both lines on a row not shown yet, and ⋯ at the row's
 * edge, in the room the right padding leaves it.
 */
export const GARAGE_PHONE_GRID =
  "max-md:relative max-md:items-center max-md:gap-x-0 max-md:py-2 max-md:pl-3 max-md:pr-11 max-md:grid-cols-[auto_minmax(0,max-content)_minmax(0,1fr)_auto_auto] max-md:[grid-template-areas:'check_title_title_aside_action'_'._lead_subtitle_asideSub_action']"

/**
 * The garage's name, which names the row (`vendor-<id>-name`) and opens it
 * in the side panel, and its owner under it. On a phone the two are placed
 * in the row's grid themselves: the name first, the owner leading the
 * second line.
 */
function GarageCell({
  v,
  open,
  narrow,
  onOpen,
}: {
  v: AdminVendor
  open: boolean
  narrow?: boolean
  onOpen: (v: AdminVendor) => void
}) {
  return (
    <div
      className={cn(
        'min-w-0 max-md:contents',
        narrow ? 'max-w-[136px]' : 'max-w-[148px]'
      )}
    >
      <button
        type="button"
        id={`vendor-${v.id}-name`}
        title={v.businessName}
        aria-expanded={open}
        onClick={() => onOpen(v)}
        className="block max-w-full truncate text-left text-[13.5px] font-semibold tracking-[-0.01em] text-text-primary underline-offset-2 hover:underline max-md:mr-2 max-md:min-w-0 max-md:text-[14px] max-md:[grid-area:title]"
      >
        {v.businessName}
      </button>
      {v.owner?.name && (
        <p className="truncate text-[12px] text-text-secondary max-md:mr-2 max-md:min-w-0 max-md:max-w-[24vw] max-md:[grid-area:lead]">
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
function AreaCell({ v, narrow }: { v: AdminVendor; narrow?: boolean }) {
  return (
    <div className={cn('min-w-0', narrow ? 'max-w-[72px]' : 'max-w-[92px]')}>
      <p className="truncate text-text-primary" title={garageArea(v)}>
        {garageArea(v)}
      </p>
      {v.outsideServiceCity && (
        <p className="mt-0.5 flex min-w-0 flex-wrap items-center gap-x-1.5 text-[12px] text-text-muted">
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

/**
 * "Both", "Doorstep", "At garage + pickup": one short line. The radius
 * ("Doorstep 8 km") is in its title and the side panel.
 */
function ModesCell({ v, narrow }: { v: AdminVendor; narrow?: boolean }) {
  const parts = bookingParts(v)
  const full = parts
    .map((part) => [part.text, part.quiet].filter(Boolean).join(' '))
    .join(' · ')
  return (
    <span
      title={full || undefined}
      className={cn(
        'block truncate whitespace-nowrap text-[12.5px]',
        narrow ? 'max-w-[60px]' : 'max-w-[84px]',
        parts.length === 0 ? 'text-warning' : 'text-text-secondary'
      )}
    >
      {modesShort(v)}
    </span>
  )
}

/**
 * What the garage still owes us (W4's tags: red can't go live without it,
 * amber can), or that nothing is missing. One line: as many as fit, red
 * ones first, then "+N"; two at most on a phone, fewer when they are long.
 */
function MissingCell({ v }: { v: AdminVendor }) {
  if (!v.missing) return <span className="text-text-muted">—</span>
  if (v.missing.length === 0)
    return (
      <span className="whitespace-nowrap text-[12px] text-tone-done-text">
        Nothing missing
      </span>
    )
  return (
    // On a phone a tag that still doesn't fit goes whole, never cut.
    <div className="min-w-0 max-md:h-[18px] max-md:overflow-hidden md:[&_ul]:flex-nowrap [&_li]:whitespace-nowrap">
      <MissingTags
        missing={v.missing}
        max={missingTagsThatFit(v.missing)}
        phoneMax={Math.min(2, missingTagsThatFit(v.missing, 18))}
      />
    </div>
  )
}

const VERIFY_BUTTON =
  'tap-target inline-flex h-6 shrink-0 items-center whitespace-nowrap rounded-md border border-white/25 px-2 text-[12px] font-medium text-text-primary transition-colors hover:bg-surface-elevated disabled:opacity-50 max-md:ml-2 max-md:h-8'

/**
 * The one thing to do now (mockup 06): the action on the first line
 * ("Due Thu 29 Oct · 0 of 2", "Chase · 3 days ago", "Pin first"), and at
 * most one quieter line under it: why, or a link to the documents the
 * garage sent ("2 docs to review ›"). "Show to customers" is a button here,
 * on the first line when it is the next step and on the second when
 * something else comes first, and is all a phone row shows of this cell.
 */
function NextStepCell({
  v,
  back,
  now,
  verifying,
  error,
  onVerify,
}: {
  v: AdminVendor
  back: string
  now: number
  verifying: boolean
  error?: string
  onVerify: () => void
}) {
  const step = garageNextStep(v, now)
  // The server refuses a garage with no pin: that says "Pin first".
  const canVerify = !v.isVerified && v.lat !== null
  const verifyIsStep = canVerify && step?.text === SHOW_TO_CUSTOMERS_STEP
  const docs = hasDocumentsToReview(v) && v.documents ? v.documents : null
  const verify = canVerify && (
    <button
      type="button"
      disabled={verifying}
      aria-label={`Show ${v.businessName} to customers`}
      onClick={onVerify}
      className={VERIFY_BUTTON}
    >
      {verifying ? (
        'Showing…'
      ) : (
        // A phone row has room for one short word beside the name.
        <>
          <span className="md:hidden">Show</span>
          <span className="max-md:hidden">{SHOW_TO_CUSTOMERS_STEP}</span>
        </>
      )}
    </button>
  )
  const docsLink = docs && (
    <Link
      href={editHref(v.id, back, 'documents')}
      aria-label={`${docs.toReview} ${docs.toReview === 1 ? 'document' : 'documents'} to review`}
      className="inline-flex shrink-0 items-center gap-0.5 whitespace-nowrap text-[12px] font-medium text-text-primary underline-offset-2 hover:underline max-md:hidden"
    >
      <span className="font-numeric">{docs.toReview}</span>
      {docs.toReview === 1 ? ' doc' : ' docs'} to review
      <IconChevronRight
        size={13}
        aria-hidden="true"
        className="shrink-0 text-text-muted"
      />
    </Link>
  )

  let first: React.ReactNode
  if (verifyIsStep) {
    first = verify
  } else if (step) {
    first = step.tab ? (
      <Link
        href={editHref(v.id, back, step.tab)}
        title={step.text}
        className={cn(
          'block truncate font-medium underline-offset-2 hover:underline max-md:hidden',
          STEP_TONE[step.tone]
        )}
      >
        {step.text}
      </Link>
    ) : (
      <span
        title={step.text}
        className={cn(
          'block truncate font-medium max-md:hidden',
          STEP_TONE[step.tone]
        )}
      >
        <Figures text={step.text} />
      </span>
    )
  } else if (!docs && !canVerify) {
    first = <span className="text-text-muted max-md:hidden">—</span>
  }

  // The second line: "Show to customers" when something else came first, the documents
  // to review, or why.
  const second: React.ReactNode[] = []
  if (canVerify && !verifyIsStep) second.push(verify)
  if (docs) second.push(docsLink)
  if (second.length === 0 && step?.detail) {
    second.push(
      <span
        title={step.detail}
        className="block truncate text-[12px] text-text-muted max-md:hidden"
      >
        <Figures text={step.detail} />
      </span>
    )
  }

  return (
    <div className="flex min-w-0 max-w-[152px] flex-col items-start gap-0.5 text-[12.5px] max-md:max-w-none max-md:items-end">
      {first}
      {second.length > 0 && (
        <div className="flex min-w-0 max-w-full items-center gap-2">
          {second.map((node, index) => (
            <Fragment key={index}>{node}</Fragment>
          ))}
        </div>
      )}
      {/* Said on the row that was pressed, and announced. */}
      {error && (
        <p
          id={`vendor-${v.id}-error`}
          role="alert"
          className="max-w-[200px] text-[12px] text-error max-md:text-right"
        >
          {error}
        </p>
      )}
    </div>
  )
}

/**
 * The row's ⋯: Edit, Archive (or take it out of the archive) and Move to
 * Bin. A disclosure, not an ARIA menu: a link and two plain buttons, closed
 * by Escape, by a
 * tap outside or by choosing one. Placed on the screen (fixed) beside its
 * button, so the table's sideways scroll never clips it, while staying in
 * the row's DOM. Move to Bin asks first, in its own sheet.
 */
function RowMenu({
  name,
  editHref: edit,
  menuId,
  busy,
  archived,
  onArchiveToggle,
  onMoveToBin,
}: {
  name: string
  /** The editor, with this list as its `back`. */
  editHref: string
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
      window.innerHeight - rect.bottom < 170
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
        className="tap-target flex size-8 items-center justify-center rounded-[8px] text-text-secondary transition-colors hover:bg-surface-elevated hover:text-text-primary max-md:size-7"
      >
        <IconDots size={18} stroke={1.5} aria-hidden="true" />
      </button>
      {open && (
        <div
          id={menuId}
          style={place}
          className="z-40 w-48 overflow-hidden rounded-xl border border-border bg-surface-elevated py-1 text-left shadow-lg"
        >
          <Link
            href={edit}
            aria-label={`Edit ${name}`}
            onClick={() => setOpen(false)}
            className={cn(item, 'border-b border-border')}
          >
            <IconPencil
              size={17}
              stroke={1.6}
              aria-hidden="true"
              className="text-text-secondary"
            />
            Edit
          </Link>
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
