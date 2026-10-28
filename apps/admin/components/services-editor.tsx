'use client'

import {
  useEffect,
  useId,
  useRef,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  IconAlertCircle,
  IconChevronDown,
  IconDots,
  IconEyeOff,
  IconPlus,
  IconSparkles,
  IconTrash,
} from '@tabler/icons-react'
import { ScSelect } from '@repo/ui/sc/select'
import { ApiError } from '@repo/core/api/client'
import { describeAdminService, getAdminAiConfig } from '@repo/core/api/admin'
import { SERVICE_CATEGORY_OPTIONS } from '@repo/core/categories'
import { templatesNotIn, type ServiceTemplate } from '@repo/core/service-templates'
import type { ServiceMedia } from '@repo/core/types'
import { cn } from '@repo/core/utils'
import { ServiceMediaPanel } from '@/components/service-media-panel'
import {
  DescriptionField,
  initialDescriptionMode,
  type DescriptionMode,
} from '@/components/description-field'
import { CATEGORY_COMMISSION_PERCENT } from '@repo/core/commission-rates'
import { DEFAULT_SERVICE_DURATION_MINS } from '@repo/core/service-duration'
import {
  DURATION_PRESETS,
  DURATION_UNITS,
  PRICING_OPTIONS,
  durationLabel,
  emptyServiceRow,
  groupRows,
  rowDurationMins,
  serviceGroupOf,
  serviceRowFromTemplate,
  type DurationUnit,
  type PlainCategory,
  type ServiceRow,
} from '@/lib/service-editor'
import {
  missingServiceFields,
  serviceRowProblem,
  switchPricingType,
  type PricingType,
  type ServiceRowField,
} from '@/lib/service-rows'
import type { ServiceRowNote } from '@/lib/garage-import'
import { ImportNote, MARKED_FIELD } from './import-note'

const PILL_BUTTON =
  'inline-flex min-h-11 items-center justify-center gap-1.5 rounded-full border border-border bg-white/[0.015] px-3.5 text-[13px] font-medium text-text-primary transition-colors hover:bg-surface disabled:opacity-50'

const FIELD =
  'min-h-11 w-full min-w-0 rounded-[10px] border bg-surface px-3 text-text-primary outline-none transition-colors focus:border-text-secondary placeholder:text-text-muted'

/**
 * A service line: name, duration, prices, ⋯. Narrow: name, duration and ⋯ on
 * the first line, the prices under them. Wide (the list 576px or more): all
 * four side by side, like a table. From 768px (the editor's column on a 1440
 * laptop) the prices get room for five figures each, so the name column no
 * longer leaves a wide gap before them.
 */
const ROW_GRID =
  'grid grid-cols-[minmax(0,1fr)_auto_44px] items-center gap-x-2 gap-y-2.5 @xl:grid-cols-[minmax(0,1fr)_112px_minmax(0,264px)_44px] @3xl:gap-x-3 @3xl:grid-cols-[minmax(0,1fr)_120px_minmax(0,312px)_44px]'

/**
 * The edit page's "Photos and video" (ServiceMediaPanel: the privacy tick,
 * photos, the video and "Make a picture with AI"); the add page has none (no
 * ids yet). Saved the moment they change, so the page only takes the new list.
 */
export interface ServiceMediaControls {
  onChange: (serviceId: string, media: ServiceMedia[]) => void
}

/** The edit page's Hide and Delete: saved straight away, see the page. */
export interface ServiceHideControls {
  onHide: (row: ServiceRow) => void
  /** Asks first; the page holds the confirm. */
  onDelete: (row: ServiceRow) => void
  busyId: string | null
  disabled: boolean
}

interface ServicesEditorProps {
  rows: ServiceRow[]
  setRows: Dispatch<SetStateAction<ServiceRow[]>>
  /** Rows with their ⋯ open, by key. Held by the page so it can open one. */
  openRows: ReadonlySet<string>
  setOpenRows: Dispatch<SetStateAction<ReadonlySet<string>>>
  /** The garage's business name, which "Write with AI" may use. */
  garageName: string
  /** Services the garage has that are not in `rows` (its hidden ones). */
  otherNames?: readonly string[]
  emptyText: string
  /** While the page saves, nothing in the list changes under it. */
  saving?: boolean
  media?: ServiceMediaControls
  hide?: ServiceHideControls
  /** A refusal about one saved row (a Hide the API turned down), by id. */
  rowErrors?: Record<string, string>
  footnote: ReactNode
  onAuthError: () => void
  /**
   * Told when AI text starts and stops arriving, so the page can hold Save
   * and Discard: either would swap the rows out from under it.
   */
  onAiBusyChange?: (busy: boolean) => void
  /**
   * Add garage's import: what to check on each row, by row key, shown under
   * it ("Check this · The poster shows ₹999 crossed out…").
   */
  rowNotes?: Record<string, ServiceRowNote[]>
}

const isAuthError = (err: unknown) =>
  err instanceof ApiError && (err.status === 401 || err.status === 403)

/**
 * The garage's services as a compact list, shared by Add vendor and the edit
 * page: one row per service — name, duration, and the three car-type prices
 * (or one) — with everything else behind its ⋯. Where the list has the room
 * (the editor's wide column) each service is one table-like line under
 * column headings; in a narrow one the prices drop under the name. One DOM
 * either way, laid out by a container query.
 *
 * Each service used to be a tall card of ten controls, defaulting to Flat
 * pricing, so a garage of eight services was a long scroll of dropdowns.
 * Ready-made services fill a row in one tap, and "Write with AI" drafts a
 * description; neither saves anything — the page's Save does, as it does
 * for typed text.
 */
export function ServicesEditor({
  rows,
  setRows,
  openRows,
  setOpenRows,
  garageName,
  otherNames = [],
  emptyText,
  saving = false,
  media,
  hide,
  rowErrors = {},
  footnote,
  onAuthError,
  onAiBusyChange,
  rowNotes = {},
}: ServicesEditorProps) {
  // Off unless the API says on: with no OpenAI key there are no AI buttons
  // at all, rather than ones that can only fail.
  const { data: aiConfig } = useQuery({
    queryKey: ['admin', 'ai-config'],
    queryFn: getAdminAiConfig,
    staleTime: Infinity,
    retry: false,
  })
  const aiOn = aiConfig?.describe === true

  // Rows whose duration is being typed rather than picked, by key.
  const [customDuration, setCustomDuration] = useState<ReadonlySet<string>>(new Set())
  // "Write with AI" on one row, and what it said if it failed.
  const [writingKey, setWritingKey] = useState<string | null>(null)
  const [aiErrors, setAiErrors] = useState<Record<string, string>>({})
  // "Fill all empty descriptions": how far it is, and how it ended.
  const [fill, setFill] = useState<{ done: number; total: number } | null>(null)
  const [fillNote, setFillNote] = useState<{ text: string; error: boolean } | null>(null)
  // What "Write with AI" replaced, by row key, so one tap puts it back.
  const [replaced, setReplaced] = useState<Record<string, string>>({})
  // Where focus goes once a row has rendered where it now is: a new row, or
  // one a category change moved to the other group.
  const [focusTarget, setFocusTarget] = useState<{ key: string; field?: 'category' } | null>(null)
  // Said when a row moves group: the row the admin was on has gone from
  // under them.
  const [moveNote, setMoveNote] = useState('')

  useEffect(() => {
    if (!focusTarget) return
    const row = document.getElementById(`service-row-${focusTarget.key}`)
    if (!row) return
    row.scrollIntoView({ block: 'center' })
    const target =
      focusTarget.field === 'category'
        ? row.querySelector<HTMLElement>('select[aria-label$=" category"]')
        : (row.querySelector<HTMLElement>('[aria-invalid="true"]') ?? row.querySelector<HTMLElement>('input'))
    target?.focus({ preventScroll: true })
  }, [focusTarget])

  const aiBusy = writingKey !== null || fill !== null
  useEffect(() => {
    onAiBusyChange?.(aiBusy)
  }, [aiBusy, onAiBusyChange])

  // Tab panels are mounted only while open, so opening another tab unmounts
  // this editor. AI text still on its way is dropped then, and the page is
  // told nothing is being written: otherwise its Save and Discard would wait
  // for a run that no longer shows anywhere, with no word why.
  const mounted = useRef(true)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
      onAiBusyChange?.(false)
    }
  }, [onAiBusyChange])

  const groups = groupRows(rows)
  const templates = templatesNotIn([...rows.map((row) => row.name), ...otherNames])
  const busy = saving || fill !== null

  const update = (key: string, patch: Partial<ServiceRow>) =>
    setRows((prev) => prev.map((row) => (row.key === key ? { ...row, ...patch } : row)))

  const toggleOpen = (key: string) =>
    setOpenRows((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })

  const setCustom = (key: string, on: boolean) =>
    setCustomDuration((prev) => {
      const next = new Set(prev)
      if (on) next.add(key)
      else next.delete(key)
      return next
    })

  const addRow = (row: ServiceRow) => {
    setRows((prev) => [...prev, row])
    setFocusTarget({ key: row.key })
  }

  const addTemplate = (template: ServiceTemplate) => addRow(serviceRowFromTemplate(template))

  const removeRow = (key: string) => setRows((prev) => prev.filter((row) => row.key !== key))

  /**
   * A new category, which may move the row to the other group: it is then
   * unmounted where it was and mounted at the end of that group, often
   * off-screen on a phone. Follow it there, back onto its Category select,
   * and say where it went.
   */
  const changeCategory = (row: ServiceRow, category: PlainCategory) => {
    update(row.key, { category })
    const to = serviceGroupOf(category)
    if (to.key === serviceGroupOf(row.category).key) return
    setFocusTarget({ key: row.key, field: 'category' })
    setMoveNote(`“${row.name.trim() || 'The service'}” moved to ${to.label}.`)
  }

  const forgetReplaced = (key: string) =>
    setReplaced((prev) => {
      if (!(key in prev)) return prev
      const next = { ...prev }
      delete next[key]
      return next
    })

  /**
   * One description from the API, into the row's field. Throws its error.
   * In Points mode it asks for points, which come back as "- " lines (0061);
   * the field is only sent then, as an older API refuses it.
   */
  const describe = async (row: ServiceRow, format: DescriptionMode = 'paragraph') => {
    const { description } = await describeAdminService({
      name: row.name.trim(),
      category: row.category,
      pricingType: row.pricingType,
      durationMins: rowDurationMins(row),
      garageName: garageName.trim() || undefined,
      ...(format === 'points' && { format: 'points' as const }),
    })
    // Another tab was opened meanwhile: see `mounted`.
    if (!mounted.current) return
    update(row.key, { description })
  }

  const writeOne = async (row: ServiceRow, format: DescriptionMode) => {
    setWritingKey(row.key)
    setAiErrors((prev) => {
      const next = { ...prev }
      delete next[row.key]
      return next
    })
    try {
      await describe(row, format)
      // Text was already there (the garage's, or typed and not saved):
      // keep it for Undo rather than lose it to one tap.
      if (row.description.trim()) setReplaced((prev) => ({ ...prev, [row.key]: row.description }))
      else forgetReplaced(row.key)
    } catch (err) {
      if (isAuthError(err)) return onAuthError()
      setAiErrors((prev) => ({
        ...prev,
        [row.key]: err instanceof Error ? err.message : 'Couldn’t write a description.',
      }))
    } finally {
      setWritingKey(null)
    }
  }

  // Named rows with nothing written, in the order they are on screen.
  const emptyDescriptions = groups
    .flatMap((group) => group.rows.map(({ row }) => row))
    .filter((row) => row.name.trim() && !row.description.trim())

  /**
   * One row at a time, so the admin sees each land and a failure stops the
   * run where it is instead of leaving a scatter of half-filled rows.
   */
  const fillAll = async () => {
    const queue = emptyDescriptions
    if (queue.length === 0) return
    setFillNote(null)
    setFill({ done: 0, total: queue.length })
    try {
      for (const [i, row] of queue.entries()) {
        // Another tab was opened: the run stops with the editor.
        if (!mounted.current) return
        try {
          await describe(row)
        } catch (err) {
          if (isAuthError(err)) return onAuthError()
          const message = err instanceof Error ? err.message : 'Couldn’t write a description.'
          setFillNote({
            text: `Stopped at ${row.name.trim()}: ${message}${i > 0 ? ` ${i} filled before it.` : ''}`,
            error: true,
          })
          return
        }
        setFill({ done: i + 1, total: queue.length })
      }
      setFillNote({
        text:
          queue.length === 1
            ? 'Filled 1 description. Read it under the service’s ⋯ before saving.'
            : `Filled ${queue.length} descriptions. Read them under each service’s ⋯ before saving.`,
        error: false,
      })
    } finally {
      setFill(null)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => addRow(emptyServiceRow())}
            className={PILL_BUTTON}
          >
            <IconPlus size={17} stroke={1.5} aria-hidden="true" /> Add service
          </button>
          {aiOn && emptyDescriptions.length > 0 && (
            <button type="button" disabled={busy} onClick={() => void fillAll()} className={PILL_BUTTON}>
              <IconSparkles size={17} stroke={1.5} aria-hidden="true" />
              {fill ? 'Writing…' : 'Fill all empty descriptions'}
            </button>
          )}
        </div>
        {/* Always mounted, so progress and the outcome are announced. */}
        <p
          role="status"
          className={
            fill || fillNote
              ? cn('text-[12.5px]', fillNote?.error ? 'text-error' : 'text-text-secondary')
              : 'sr-only'
          }
        >
          {fill ? (
            <>
              Writing <span className="font-numeric">{Math.min(fill.done + 1, fill.total)}</span> of{' '}
              <span className="font-numeric">{fill.total}</span>…
            </>
          ) : (
            fillNote?.text
          )}
        </p>

        {/* Always mounted, so a move is announced. */}
        <p role="status" className="sr-only">
          {moveNote}
        </p>

        {templates.length > 0 && (
          <div role="group" aria-labelledby="service-templates-label" className="flex flex-col gap-2">
            <span id="service-templates-label" className="text-[12px] font-medium text-text-secondary">
              Add from template
            </span>
            <div className="flex flex-wrap gap-2">
              {templates.map((template) => (
                <button
                  key={template.key}
                  type="button"
                  disabled={busy}
                  onClick={() => addTemplate(template)}
                  className="inline-flex min-h-11 items-center gap-1.5 rounded-full border border-border bg-surface pl-2.5 pr-3.5 text-[13px] font-medium text-text-primary transition-colors hover:border-text-secondary disabled:opacity-50"
                >
                  <IconPlus size={15} className="text-text-secondary" aria-hidden="true" />
                  {template.name}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      <section
        aria-labelledby="services-heading"
        className="@container overflow-hidden rounded-[16px] border border-border bg-surface"
      >
        <div className="flex min-h-[22px] items-center justify-between gap-3 px-4 pb-3.5 pt-4">
          <h2
            id="services-heading"
            className="flex items-baseline gap-2 text-[15px] font-medium tracking-[-0.01em] text-text-primary"
          >
            Services
            <span className="font-numeric text-[13px] font-normal text-text-muted">{rows.length}</span>
          </h2>
          <span className="text-[12.5px] text-text-muted">Prices in ₹</span>
        </div>

        {groups.length === 0 ? (
          <p className="border-t border-border px-4 py-4 text-[13px] text-text-muted">{emptyText}</p>
        ) : (
          groups.map((group) => (
            <div key={group.key}>
              <div className="border-t border-border bg-white/[0.022] px-4 pb-2.5 pt-3.5">
                <h3 className="flex items-baseline gap-2">
                  <span className="text-[13.5px] font-medium text-text-primary">{group.label}</span>
                  <span className="font-numeric text-[12.5px] text-text-muted">{group.rows.length}</span>
                </h3>
                {/* Column headings, for the eye only: every input carries its
                    own name ("Service 2 SUV price in rupees"). */}
                <div aria-hidden="true" className={cn(ROW_GRID, 'mt-2.5 text-[12px] font-medium text-text-muted')}>
                  <span className="hidden @xl:block">Service</span>
                  <span className="hidden @xl:block">Duration</span>
                  <span className="col-span-3 grid grid-cols-3 gap-2 @xl:col-span-1">
                    {['Hatch', 'Sedan', 'SUV'].map((label) => (
                      <span key={label} className="pl-3">
                        {label}
                      </span>
                    ))}
                  </span>
                </div>
              </div>
              {group.rows.map(({ row, number }) => (
                <ServiceRowItem
                  key={row.key}
                  row={row}
                  number={number}
                  open={openRows.has(row.key)}
                  onToggle={() => toggleOpen(row.key)}
                  update={(patch) => update(row.key, patch)}
                  customDuration={customDuration.has(row.key)}
                  setCustomDuration={(on) => setCustom(row.key, on)}
                  aiOn={aiOn}
                  writing={writingKey === row.key}
                  aiBusy={aiBusy}
                  aiError={aiErrors[row.key]}
                  onWrite={(format) => void writeOne(row, format)}
                  canUndo={row.key in replaced}
                  onUndo={() => {
                    update(row.key, { description: replaced[row.key] })
                    forgetReplaced(row.key)
                  }}
                  onDescription={(description) => {
                    update(row.key, { description })
                    // Typed over: Undo would now throw the typing away.
                    forgetReplaced(row.key)
                  }}
                  onCategory={(category) => changeCategory(row, category)}
                  rowError={row.id ? rowErrors[row.id] : undefined}
                  media={media}
                  importNotes={rowNotes[row.key]}
                  hide={hide}
                  saving={saving}
                  onRemove={() => removeRow(row.key)}
                />
              ))}
            </div>
          ))
        )}
      </section>

      <p className="text-[12px] leading-relaxed text-text-muted">{footnote}</p>
    </div>
  )
}

function ServiceRowItem({
  row,
  number,
  open,
  onToggle,
  update,
  customDuration,
  setCustomDuration,
  aiOn,
  writing,
  aiBusy,
  aiError,
  onWrite,
  canUndo,
  onUndo,
  onDescription,
  onCategory,
  rowError,
  media,
  importNotes = [],
  hide,
  saving,
  onRemove,
}: {
  row: ServiceRow
  number: number
  open: boolean
  onToggle: () => void
  update: (patch: Partial<ServiceRow>) => void
  customDuration: boolean
  setCustomDuration: (on: boolean) => void
  aiOn: boolean
  writing: boolean
  aiBusy: boolean
  aiError?: string
  onWrite: (format: DescriptionMode) => void
  canUndo: boolean
  onUndo: () => void
  onDescription: (description: string) => void
  onCategory: (category: PlainCategory) => void
  rowError?: string
  media?: ServiceMediaControls
  importNotes?: ServiceRowNote[]
  hide?: ServiceHideControls
  saving: boolean
  onRemove: () => void
}) {
  const id = useId()
  const label = `Service ${number}`
  const name = row.name.trim() || label
  // Points or Paragraph: points when the text already has "- " lines.
  const [descriptionMode, setDescriptionMode] = useState<DescriptionMode>(() =>
    initialDescriptionMode(row.description)
  )
  const commissionId = `${id}-commission`
  const missing = missingServiceFields(row)
  const problem = serviceRowProblem(row)
  const problemId = `${id}-problem`
  const moreId = `${id}-more`
  const descriptionId = `${id}-description`
  const importNotesId = `${id}-import`

  // The import's notes: a "Check this" stays as a record of what to look
  // at; a missing price's note goes once the price is in.
  const priceMissing = missing.some((field) => field !== 'name')
  const notes = importNotes.filter((note) => note.kind === 'check' || (note.field === 'price' && priceMissing))
  const priceChecked = notes.some((note) => note.field === 'price' && note.kind === 'check')

  // What an input missing its value carries: the amber edge, and the row's
  // line as its description.
  const flag = (field: ServiceRowField) => {
    const on = missing.includes(field)
    return {
      'aria-invalid': on || undefined,
      'aria-describedby': on ? problemId : undefined,
      className: on ? 'border-error shadow-[0_0_0_3px_rgba(245,165,36,0.12)]' : 'border-border',
    }
  }

  const mins = rowDurationMins(row)
  const preset = mins != null && (DURATION_PRESETS as readonly number[]).includes(mins)
  const durationValue = customDuration ? 'other' : mins == null ? '' : preset ? String(mins) : `set-${mins}`

  const onDuration = (value: string) => {
    if (value === 'other') return setCustomDuration(true)
    if (value.startsWith('set-')) return
    setCustomDuration(false)
    update({ durationValue: value, durationUnit: 'min' })
  }

  const priceInput = (
    field: 'price' | 'priceHatchback' | 'priceSedan' | 'priceSuv',
    ariaLabel: string,
    placeholder: string,
    className?: string
  ) => {
    const flagged = flag(field)
    return (
      <input
        type="number"
        inputMode="numeric"
        min={0}
        value={row[field]}
        aria-label={ariaLabel}
        placeholder={placeholder}
        onChange={(e) => update({ [field]: e.target.value })}
        aria-invalid={flagged['aria-invalid']}
        aria-describedby={
          [flagged['aria-describedby'], priceChecked ? importNotesId : undefined].filter(Boolean).join(' ') ||
          undefined
        }
        className={cn(
          FIELD,
          'font-numeric text-[15.5px] font-medium',
          flagged.className,
          priceChecked && !flagged['aria-invalid'] && MARKED_FIELD,
          className
        )}
      />
    )
  }

  return (
    // A named group, so the row's own refusal can be found on it — and is
    // read out with the service it is about.
    <div
      id={`service-row-${row.key}`}
      role="group"
      aria-label={name}
      className={cn(
        'border-t border-line px-4 py-3.5',
        problem && 'bg-gradient-to-r from-warning/[0.05] to-transparent to-70%'
      )}
    >
      <div className={ROW_GRID}>
        <input
          value={row.name}
          aria-label={`${label} name`}
          placeholder="Service name"
          onChange={(e) => update({ name: e.target.value })}
          aria-invalid={flag('name')['aria-invalid']}
          aria-describedby={flag('name')['aria-describedby']}
          className={cn(
            'min-h-11 w-full min-w-0 truncate rounded-[10px] border bg-transparent px-2 -ml-2 text-[15px] font-medium tracking-[-0.01em] text-text-primary outline-none transition-colors placeholder:font-normal placeholder:text-text-muted focus:border-text-secondary focus:bg-surface',
            missing.includes('name') ? 'border-error' : 'border-transparent'
          )}
        />
        {/* A pill that is a native select, so a phone shows its own picker. */}
        <div className="relative shrink-0 @xl:w-full">
          <select
            value={durationValue}
            aria-label={`${label} duration`}
            onChange={(e) => onDuration(e.target.value)}
            className="min-h-11 appearance-none @xl:w-full rounded-full border border-border bg-transparent pl-3 pr-7 font-numeric text-[13.5px] font-medium text-text-primary outline-none transition-colors focus:border-text-secondary"
          >
            <option value="">Not set</option>
            {DURATION_PRESETS.map((preset) => (
              <option key={preset} value={String(preset)}>
                {durationLabel(preset)}
              </option>
            ))}
            {mins != null && !preset && <option value={`set-${mins}`}>{durationLabel(mins)}</option>}
            <option value="other">Other…</option>
          </select>
          <IconChevronDown
            size={13}
            stroke={1.8}
            aria-hidden="true"
            className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-text-muted"
          />
        </div>
        {row.pricingType === 'per_vehicle' ? (
          <div className="col-span-3 row-start-2 grid grid-cols-3 gap-2 @xl:col-span-1 @xl:col-start-3 @xl:row-start-1">
            {priceInput('priceHatchback', `${label} hatchback price in rupees`, 'Hatch price')}
            {priceInput('priceSedan', `${label} sedan price in rupees`, 'Sedan price')}
            {priceInput('priceSuv', `${label} SUV price in rupees`, 'SUV price')}
          </div>
        ) : (
          <div className="relative col-span-3 row-start-2 @xl:col-span-1 @xl:col-start-3 @xl:row-start-1">
            {priceInput(
              'price',
              `${label} price in rupees`,
              row.pricingType === 'on_inspection' ? 'Inspection fee' : 'Price',
              'pr-36'
            )}
            {/* Says which single price this is; the pricing select below
                says the same to a screen reader. */}
            <span
              aria-hidden="true"
              className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[12.5px] text-text-muted"
            >
              {row.pricingType === 'on_inspection' ? 'Inspection fee' : 'Same for all cars'}
            </span>
          </div>
        )}
        <button
          type="button"
          aria-expanded={open}
          aria-controls={moreId}
          aria-label={`More for ${name}`}
          onClick={onToggle}
          className="col-start-3 row-start-1 flex size-11 shrink-0 @xl:col-start-4 items-center justify-center rounded-full text-text-secondary transition-colors hover:text-text-primary"
        >
          <span
            className={cn(
              'flex size-8 items-center justify-center rounded-full',
              open && 'bg-surface-elevated text-text-primary'
            )}
          >
            <IconDots size={19} stroke={1.5} aria-hidden="true" />
          </span>
        </button>
      </div>

      {customDuration && (
        <div className="mt-2 grid grid-cols-2 gap-2">
          <input
            type="number"
            inputMode="decimal"
            min={0}
            value={row.durationValue}
            aria-label={`${label} duration, number`}
            placeholder="How long"
            onChange={(e) => update({ durationValue: e.target.value })}
            className={cn(FIELD, 'border-border font-numeric text-[14px]')}
          />
          <ScSelect
            value={row.durationUnit}
            aria-label={`${label} duration unit`}
            onChange={(e) => update({ durationUnit: e.target.value as DurationUnit })}
            className="min-h-11"
          >
            {DURATION_UNITS.map((unit) => (
              <option key={unit.value} value={unit.value}>
                {unit.label}
              </option>
            ))}
          </ScSelect>
        </div>
      )}

      {/* What the import was unsure of on this row, outside the ⋯ so it is
          seen without opening anything. */}
      {notes.length > 0 && (
        <div id={importNotesId} className="mt-2.5 flex flex-col gap-1.5">
          {notes.map((note) => (
            <ImportNote
              key={`${note.field}-${note.kind}`}
              mark={{
                kind: note.kind,
                reason:
                  note.field === 'category' && note.reason
                    ? `Category: ${note.reason}`
                    : note.reason,
              }}
            />
          ))}
        </div>
      )}

      {/* No duration (0061): it books, holding the default in the slot
          calendar, but the admin should know. */}
      {mins == null && row.name.trim() && (
        <p className="mt-2 flex flex-wrap items-center gap-x-1.5 text-[12.5px] text-tone-attention-text">
          <span className="font-medium">Duration not set</span>
          <span className="text-text-secondary">
            · {DEFAULT_SERVICE_DURATION_MINS} min is held in the calendar
          </span>
        </p>
      )}

      {/* Amber, as errors are: what this row needs before the garage can be
          saved. */}
      {problem && (
        <p id={problemId} className="mt-2.5 flex items-center gap-1.5 text-[13px] text-error">
          <IconAlertCircle size={16} className="shrink-0" aria-hidden="true" />
          {problem}
        </p>
      )}
      {rowError && (
        <p role="alert" className="mt-2 text-[12.5px] text-error">
          {rowError}
        </p>
      )}

      {open && (
        <div id={moreId} className="mt-4 flex flex-col gap-3.5 border-t border-line pt-4">
          <div className="flex flex-col gap-1.5">
            <DescriptionField
              id={descriptionId}
              label={label}
              value={row.description}
              onChange={onDescription}
              mode={descriptionMode}
              onModeChange={setDescriptionMode}
              action={
                aiOn ? (
                  <div className="-my-2.5 -mr-2 flex items-center">
                    {/* What the AI replaced, one tap away. */}
                    {canUndo && !writing && (
                      <button
                        type="button"
                        onClick={onUndo}
                        aria-label={`Undo, put back the earlier description of ${name}`}
                        className="inline-flex min-h-11 items-center rounded-[10px] px-2 text-[12.5px] font-medium text-text-secondary transition-colors hover:text-text-primary"
                      >
                        Undo
                      </button>
                    )}
                    <button
                      type="button"
                      disabled={!row.name.trim() || aiBusy || saving}
                      onClick={() => onWrite(descriptionMode)}
                      title={row.name.trim() ? undefined : 'Name the service first'}
                      className="inline-flex min-h-11 items-center gap-1 rounded-[10px] px-2 text-[12.5px] font-medium text-text-secondary transition-colors hover:text-text-primary disabled:opacity-50"
                    >
                      <IconSparkles size={15} stroke={1.5} aria-hidden="true" />
                      {/* Says it will replace what is there; Undo puts it back.
                          In Points mode the AI keeps the points (0061). */}
                      {writing
                        ? 'Writing…'
                        : row.description.trim()
                          ? 'Rewrite with AI'
                          : descriptionMode === 'points'
                            ? 'Write as points with AI'
                            : 'Write with AI'}
                    </button>
                  </div>
                ) : (
                  <span className="text-[12px] text-text-muted">optional</span>
                )
              }
            />
            {aiError && (
              <p role="alert" className="text-[12.5px] text-error">
                {aiError}
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <ScSelect
              label="Category"
              value={row.category}
              aria-label={`${label} category`}
              onChange={(e) => onCategory(e.target.value as PlainCategory)}
              className="min-h-11"
            >
              {SERVICE_CATEGORY_OPTIONS.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </ScSelect>
            <ScSelect
              label="Pricing"
              value={row.pricingType}
              aria-label={`${label} pricing`}
              onChange={(e) => update(switchPricingType(row, e.target.value as PricingType))}
              className="min-h-11"
            >
              {PRICING_OPTIONS.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </ScSelect>
          </div>

          {/* Statistics only (0061, owner: "percent only"): payouts keep the
              category's rate. */}
          <div className="flex flex-col gap-1.5">
            <label htmlFor={commissionId} className="text-[12px] font-medium text-text-secondary">
              Commission % (optional)
            </label>
            <div className="relative max-w-[180px]">
              <input
                id={commissionId}
                type="text"
                inputMode="decimal"
                value={row.commissionRate ?? ''}
                aria-label={`${label} commission percent`}
                placeholder={`${CATEGORY_COMMISSION_PERCENT[row.category]}`}
                onChange={(e) => update({ commissionRate: e.target.value })}
                aria-invalid={flag('commissionRate')['aria-invalid']}
                aria-describedby={[`${commissionId}-hint`, flag('commissionRate')['aria-describedby']]
                  .filter(Boolean)
                  .join(' ')}
                className={cn(FIELD, 'pr-8 font-numeric text-[14px]', flag('commissionRate').className)}
              />
              <span
                aria-hidden="true"
                className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[13px] text-text-muted"
              >
                %
              </span>
            </div>
            <p id={`${commissionId}-hint`} className="text-[12px] text-text-muted">
              Empty uses the {SERVICE_CATEGORY_OPTIONS.find((c) => c.value === row.category)?.label.toLowerCase() ?? 'category'} rate,{' '}
              {CATEGORY_COMMISSION_PERCENT[row.category]}%. For Statistics only; the first 25 bookings stay free.
            </p>
          </div>

          {/* One place for a service's photos and video. They attach to a
              saved service, so a new row gets the hint instead. */}
          {media &&
            (row.id ? (
              <ServiceMediaPanel
                serviceId={row.id}
                serviceName={name}
                category={row.category}
                media={row.media}
                onMediaChange={(next) => media.onChange(row.id as string, next)}
              />
            ) : (
              <div className="flex flex-col gap-1.5">
                <span className="text-[12px] font-medium text-text-secondary">Photos and video</span>
                <p className="text-[12px] text-text-muted">
                  Save changes first, then add photos and a video here.
                </p>
              </div>
            ))}

          <div className="flex min-h-6 items-center justify-between gap-3">
            {/* Quiet: neither is the page's main action. A saved service is
                hidden, straight away and reversibly, or deleted after a
                confirm; a row never saved is only taken off the form. */}
            {row.id && hide ? (
              <>
                <span className="-my-2.5 -ml-2 flex items-center">
                  <button
                    type="button"
                    data-service-hide
                    disabled={hide.disabled || saving}
                    onClick={() => hide.onHide(row)}
                    aria-label={`Hide ${name}`}
                    className="inline-flex min-h-11 items-center gap-1.5 rounded-[10px] px-2 text-[13.5px] font-medium text-text-secondary transition-colors hover:text-text-primary disabled:opacity-50"
                  >
                    <IconEyeOff size={17} stroke={1.5} aria-hidden="true" />
                    {hide.busyId === row.id ? 'Working…' : 'Hide service'}
                  </button>
                  <button
                    type="button"
                    disabled={hide.disabled || saving}
                    onClick={() => hide.onDelete(row)}
                    aria-label={`Delete ${name}`}
                    className="inline-flex min-h-11 items-center gap-1.5 rounded-[10px] px-2 text-[13.5px] font-medium text-text-secondary transition-colors hover:text-error disabled:opacity-50"
                  >
                    <IconTrash size={16} stroke={1.5} aria-hidden="true" />
                    Delete
                  </button>
                </span>
                <span className="text-[12px] text-text-muted">Past bookings keep it</span>
              </>
            ) : (
              <button
                type="button"
                onClick={onRemove}
                disabled={saving}
                aria-label={`Remove service ${number}`}
                className="-my-2.5 -ml-2 inline-flex min-h-11 items-center gap-1.5 rounded-[10px] px-2 text-[13.5px] font-medium text-text-secondary transition-colors hover:text-text-primary disabled:opacity-50"
              >
                <IconTrash size={16} stroke={1.5} aria-hidden="true" />
                Remove
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
