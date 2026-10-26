'use client'

import { useId, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { IconCheck, IconX } from '@tabler/icons-react'
import { ApiError } from '@repo/core/api/client'
import type {
  OnboardingMark,
  OnboardingMarkBrief,
} from '@repo/core/api/admin-marks'
import {
  useCreateMark,
  useDeleteMark,
  useUpdateMark,
  useVendorMarks,
} from '@repo/core/api/hooks/use-admin-marks'
import {
  MARK_LIMITS,
  MARK_PRESETS,
  markLabel,
  type MarkKind,
  type MarkStatus,
} from '@repo/core/onboarding-marks'
import { cn } from '@repo/core/utils'
import { ScSegmented } from '@repo/ui/sc/segmented'
import { ScInput, ScTextarea } from '@repo/ui/sc/input'
import { openPresetLabels, type MarkVendor } from '@/lib/onboarding-marks'
import { AnchoredPopover } from './anchored-popover'

/**
 * Renders an overlay at the end of <body>, out of the table cell or side
 * panel that opened it: a `fixed` box inside a transformed panel would be
 * placed against the panel, not the screen. React still bubbles events
 * through a portal to its parents, so clicks stop here and never reach a row
 * that opens on click. Keys pass, for the overlay's own Escape.
 */
export function MarksOverlay({ children }: { children: ReactNode }) {
  if (typeof document === 'undefined') return null
  return (
    <span className="contents" onClick={(event) => event.stopPropagation()}>
      {createPortal(children, document.body)}
    </span>
  )
}

/** What the form hands back: one new mark's fields, or a change to one. */
export interface MarkDraft {
  kind: MarkKind
  label: string
  note: string
  status: MarkStatus
}

const STATUS_OPTIONS: Array<{ value: MarkStatus; label: ReactNode }> = [
  {
    value: 'to_ask',
    label: <StatusOption title="To ask" hint="Not asked yet" />,
  },
  {
    value: 'asked',
    label: <StatusOption title="Asked" hint="Adds today’s date" />,
  },
  {
    value: 'received',
    label: <StatusOption title="Received" hint="Closes the mark" />,
  },
]

function StatusOption({ title, hint }: { title: string; hint: string }) {
  return (
    <span className="flex flex-col items-start leading-tight">
      <span>{title}</span>{' '}
      <span className="text-[10px] font-normal opacity-70">{hint}</span>
    </span>
  )
}

/**
 * The "Add a mark" form: a preset or the admin's own words, a note and a
 * status. Editing an existing mark keeps its kind, so the presets give way to
 * its name (editable for the team's own marks).
 */
export function MarkForm({
  title,
  subtitle,
  editing,
  initial,
  busy,
  error,
  submitLabel,
  onSubmit,
  onCancel,
  extra,
  openPresets,
  openPresetsHint = 'Already open on this garage',
}: {
  title: string
  subtitle: ReactNode
  /** The kind is fixed: an existing mark. */
  editing: boolean
  initial?: Partial<MarkDraft>
  busy: boolean
  error?: ReactNode
  submitLabel: string
  onSubmit: (draft: MarkDraft) => void
  onCancel: () => void
  /** Under the fields, before the buttons: Delete, for an existing mark. */
  extra?: ReactNode
  /**
   * Presets (by label) the garage already has open: shown, but not offered,
   * since the server would refuse a second one (409 MARK_EXISTS).
   */
  openPresets?: ReadonlySet<string>
  /** Why an open preset can't be picked, read out with it. */
  openPresetsHint?: string
}) {
  const titleId = useId()
  const presetIndex = initial?.label
    ? MARK_PRESETS.findIndex(
        (preset) =>
          preset.label === initial.label && preset.kind === initial.kind
      )
    : -1
  const [preset, setPreset] = useState<number | null>(
    editing || presetIndex === -1 ? null : presetIndex
  )
  const [own, setOwn] = useState(
    editing || presetIndex === -1 ? (initial?.label ?? '') : ''
  )
  const [note, setNote] = useState(initial?.note ?? '')
  const [status, setStatus] = useState<MarkStatus>(initial?.status ?? 'to_ask')
  const kind: MarkKind = editing
    ? (initial?.kind ?? 'custom')
    : preset !== null
      ? MARK_PRESETS[preset].kind
      : 'custom'
  const label = preset !== null ? MARK_PRESETS[preset].label : own.trim()
  const ready = label.length > 0 || (editing && kind !== 'custom')

  return (
    <form
      aria-labelledby={titleId}
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault()
        if (!ready || busy) return
        onSubmit({ kind, label, note: note.trim(), status })
      }}
    >
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <h2
            id={titleId}
            className="text-[15px] font-semibold text-text-primary"
          >
            {title}
          </h2>
          <p className="mt-0.5 truncate text-[12px] text-text-secondary">
            {subtitle}
          </p>
        </div>
        <button
          type="button"
          onClick={onCancel}
          aria-label="Close"
          className="-mr-2 -mt-1 flex size-11 shrink-0 items-center justify-center rounded-full text-text-secondary hover:bg-surface"
        >
          <IconX size={18} aria-hidden />
        </button>
      </div>

      {!editing && (
        <div className="flex flex-col gap-2">
          <p
            id={`${titleId}-pick`}
            className="text-[11px] font-medium text-text-secondary"
          >
            Pick one
          </p>
          <div
            role="group"
            aria-labelledby={`${titleId}-pick`}
            className="flex flex-wrap gap-2"
          >
            {MARK_PRESETS.map((item, index) => {
              const taken = openPresets?.has(item.label) ?? false
              return (
                <button
                  key={item.label}
                  type="button"
                  aria-pressed={preset === index}
                  disabled={taken}
                  title={taken ? openPresetsHint : undefined}
                  aria-describedby={taken ? `${titleId}-open` : undefined}
                  onClick={() => {
                    setPreset(preset === index ? null : index)
                    setOwn('')
                  }}
                  className={cn(
                    'tap-target inline-flex items-center gap-1 rounded-full border px-3 py-1.5 text-[12px] font-medium transition-colors',
                    preset === index
                      ? 'border-brand-white bg-brand-white text-brand-black'
                      : 'border-border bg-surface text-text-secondary hover:text-text-primary',
                    'disabled:cursor-not-allowed disabled:border-dashed disabled:bg-transparent disabled:text-text-muted disabled:hover:text-text-muted'
                  )}
                >
                  {taken && <IconCheck size={12} aria-hidden />}
                  {item.label}
                </button>
              )
            })}
          </div>
          {openPresets && openPresets.size > 0 && (
            <p
              id={`${titleId}-open`}
              className="flex items-center gap-1 text-[11px] text-text-muted"
            >
              <IconCheck size={12} aria-hidden />
              {openPresetsHint}
            </p>
          )}
        </div>
      )}

      {(!editing || kind === 'custom') && (
        <ScInput
          label={editing ? 'Mark' : 'Or write your own'}
          placeholder="e.g. Wants to add pickup & drop"
          value={own}
          maxLength={MARK_LIMITS.labelMax}
          onChange={(event) => {
            setOwn(event.target.value)
            if (event.target.value) setPreset(null)
          }}
        />
      )}

      <ScTextarea
        label="Note (optional)"
        rows={3}
        value={note}
        maxLength={MARK_LIMITS.noteMax}
        onChange={(event) => setNote(event.target.value)}
      />

      <div className="flex flex-col gap-1.5">
        <p className="text-[11px] font-medium text-text-secondary">Status</p>
        <ScSegmented
          aria-label="Status"
          value={status}
          onChange={setStatus}
          options={STATUS_OPTIONS}
        />
      </div>

      {extra}

      {error && (
        <div role="alert" className="text-[12px] text-tone-attention-text">
          {error}
        </div>
      )}

      <div className="flex items-center gap-2">
        <p className="mr-auto text-[12px] text-text-muted">
          The whole team sees it
        </p>
        <button
          type="button"
          onClick={onCancel}
          className="min-h-10 rounded-full px-4 text-[13px] font-medium text-text-primary hover:bg-surface"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={!ready || busy}
          className="min-h-10 rounded-full bg-(image:--gradient-cta) px-4 text-[13px] font-semibold text-white disabled:bg-none disabled:bg-surface-elevated disabled:text-text-secondary"
        >
          {busy ? 'Saving…' : submitLabel}
        </button>
      </div>
    </form>
  )
}

/** The server's word on a failed write, in the panel's words. */
export function markErrorText(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 404) return 'Marks aren’t available on the server yet.'
    if (error.message) return error.message
  }
  return 'Couldn’t save the mark. Try again.'
}

export function isMarkExists(error: unknown): boolean {
  return (
    error instanceof ApiError &&
    error.status === 409 &&
    error.code === 'MARK_EXISTS'
  )
}

type EditableMark = OnboardingMarkBrief & Partial<Pick<OnboardingMark, 'note'>>

/**
 * Add a mark to one garage, or change one. On a laptop it opens next to the
 * button that opened it (`anchor`), else as a dialog. The presets the garage
 * already has open are not offered; should one slip through (a list older
 * than the mark), the server refuses it (409 MARK_EXISTS) and the popover
 * offers that mark to edit, keeping the note and status typed so far.
 */
export function MarkPopover({
  vendor,
  mark,
  onClose,
  anchor,
}: {
  vendor: MarkVendor
  mark?: OnboardingMarkBrief | OnboardingMark
  onClose: () => void
  /** The button that opened it, to sit by on a laptop. */
  anchor?: HTMLElement | null
}) {
  const [editing, setEditing] = useState<EditableMark | null>(mark ?? null)
  const [carried, setCarried] = useState<Pick<
    MarkDraft,
    'note' | 'status'
  > | null>(null)
  const [exists, setExists] = useState<MarkDraft | null>(null)
  const [error, setError] = useState<string | null>(null)
  const create = useCreateMark()
  const update = useUpdateMark()
  const remove = useDeleteMark()
  // A brief from the list has no note: read the garage's marks for it.
  const briefOnly = editing !== null && !('note' in editing)
  const marks = useVendorMarks(vendor.id, briefOnly || exists !== null)
  const full = editing
    ? marks.data?.find((row) => row.id === editing.id)
    : undefined
  const busy = create.isPending || update.isPending || remove.isPending

  const existing = exists
    ? (marks.data ?? vendor.openMarks ?? []).find(
        (row) => row.kind === exists.kind && row.status !== 'received'
      )
    : undefined

  const close = () => {
    if (!busy) onClose()
  }

  const submit = (draft: MarkDraft) => {
    setError(null)
    if (editing) {
      update.mutate(
        {
          vendorId: vendor.id,
          markId: editing.id,
          input: {
            status: draft.status,
            note: draft.note || null,
            ...(editing.kind === 'custom' && draft.label
              ? { label: draft.label }
              : {}),
          },
        },
        { onSuccess: onClose, onError: (err) => setError(markErrorText(err)) }
      )
      return
    }
    create.mutate(
      {
        vendorId: vendor.id,
        input: {
          kind: draft.kind,
          label: draft.label,
          note: draft.note || null,
          status: draft.status,
        },
      },
      {
        onSuccess: onClose,
        onError: (err) => {
          if (isMarkExists(err)) {
            setExists(draft)
            void marks.refetch()
          } else setError(markErrorText(err))
        },
      }
    )
  }

  const note = editing ? (full?.note ?? editing.note ?? '') : ''
  const openPresets = openPresetLabels(marks.data ?? vendor.openMarks)
  // Wait for the note before showing the form, unless the marks can't be
  // read (an older API): then it starts without one.
  const loadingNote = briefOnly && !full && marks.isPending

  return (
    <MarksOverlay>
      <AnchoredPopover
        anchor={anchor}
        onClose={close}
        dismissible={!busy}
        aria-label={editing ? 'Edit mark' : 'Add a mark'}
      >
        {loadingNote ? (
          <p
            role="status"
            className="py-6 text-center text-[13px] text-text-secondary"
          >
            Loading the mark…
          </p>
        ) : (
          <MarkForm
            // A fresh form for each mark, starting from its own values.
            key={editing ? editing.id : 'new'}
            title={editing ? 'Edit mark' : 'Add a mark'}
            subtitle={
              editing
                ? `${markLabel(editing.kind, editing.label)} · ${vendor.businessName}`
                : vendor.businessName
            }
            editing={Boolean(editing)}
            initial={
              editing
                ? {
                    kind: editing.kind,
                    label: editing.kind === 'custom' ? editing.label : '',
                    note: carried?.note ?? note,
                    status: carried?.status ?? editing.status,
                  }
                : undefined
            }
            busy={busy}
            error={
              exists ? (
                <span className="flex flex-wrap items-center gap-x-2">
                  {vendor.businessName} already has an open “
                  {markLabel(exists.kind, exists.label)}” mark.
                  {existing ? (
                    <button
                      type="button"
                      className="min-h-9 font-semibold text-text-primary underline underline-offset-4"
                      onClick={() => {
                        setCarried({ note: exists.note, status: exists.status })
                        setEditing(existing)
                        setExists(null)
                      }}
                    >
                      Edit that mark
                    </button>
                  ) : (
                    <span>Loading it…</span>
                  )}
                </span>
              ) : (
                error
              )
            }
            submitLabel={editing ? 'Save' : 'Add mark'}
            openPresets={editing ? undefined : openPresets}
            onSubmit={submit}
            onCancel={close}
            extra={
              editing ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    remove.mutate(
                      { vendorId: vendor.id, markId: editing.id },
                      {
                        onSuccess: onClose,
                        onError: (err) => setError(markErrorText(err)),
                      }
                    )
                  }
                  className="self-start text-[12px] font-medium text-text-secondary underline underline-offset-4 hover:text-text-primary"
                >
                  Delete this mark
                </button>
              ) : undefined
            }
          />
        )}
      </AnchoredPopover>
    </MarksOverlay>
  )
}
