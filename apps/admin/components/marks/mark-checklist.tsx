'use client'

import {
  useId,
  useRef,
  useState,
  type ClipboardEvent,
  type KeyboardEvent,
} from 'react'
import {
  IconCheck,
  IconGripVertical,
  IconPhone,
  IconPlus,
  IconX,
} from '@tabler/icons-react'
import { ScButton } from '@repo/ui/sc/button'
import { ScSheet } from '@repo/ui/sc/modal'
import type { OnboardingMark } from '@repo/core/api/admin-marks'
import {
  useUpdateMark,
  useUpdateMarkItem,
  useVendorMarks,
} from '@repo/core/api/hooks/use-admin-marks'
import { splitListText } from '@repo/core/list-text'
import {
  CHECKLIST_LIMITS,
  CHECKLIST_TEMPLATES,
  checklistProgress,
  progressText,
  quickAnswers,
  type MarkChecklistItem,
} from '@repo/core/mark-checklist'
import { markLabel } from '@repo/core/onboarding-marks'
import { cn } from '@repo/core/utils'
import { markDate } from '@/lib/onboarding-marks'
import { markErrorText } from './mark-popover'

/** "1 of 4 checked" with its bar (mockup marks-checklist, A1). */
export function ChecklistProgress({
  items,
}: {
  items: readonly MarkChecklistItem[]
}) {
  const { done, total } = checklistProgress(items)
  if (total === 0) return null
  return (
    <div className="flex flex-col gap-1">
      <div
        role="progressbar"
        aria-label="Checklist progress"
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={done}
        aria-valuetext={progressText(items)}
        className="h-1 overflow-hidden rounded-full bg-white/10"
      >
        <div
          className="h-full rounded-full bg-tone-done-dot transition-[width]"
          style={{ width: `${Math.round((done / total) * 100)}%` }}
        />
      </div>
    </div>
  )
}

/** "Ravi · 28 Oct, 11:40": who answered an item, and when. */
function answeredLine(item: MarkChecklistItem): string | null {
  if (!item.answeredBy || !item.answeredAt) return null
  const at = new Date(item.answeredAt)
  if (Number.isNaN(at.getTime())) return item.answeredBy
  const clock = at.toLocaleTimeString('en-IN', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone: 'Asia/Kolkata',
  })
  return `${item.answeredBy} · ${markDate(at)}, ${clock.toLowerCase()}`
}

/**
 * A mark's checklist on the garage page: each item with its tick, which
 * saves at once (with who and when), and its answer. Read-only in the Bin.
 */
export function ChecklistItems({
  vendorId,
  mark,
  readOnly = false,
}: {
  vendorId: string
  mark: OnboardingMark
  readOnly?: boolean
}) {
  const update = useUpdateMarkItem()
  const [busy, setBusy] = useState<string | null>(null)
  // The tick as pressed, until the server's answer lands (or puts it back).
  const [shown, setShown] = useState<Record<string, boolean>>({})
  const [error, setError] = useState('')
  const items = mark.items ?? []

  const tick = (item: MarkChecklistItem, done: boolean) => {
    setError('')
    setBusy(item.id)
    setShown((prev) => ({ ...prev, [item.id]: done }))
    update.mutate(
      { vendorId, markId: mark.id, itemId: item.id, input: { done } },
      {
        onError: (err) => setError(markErrorText(err)),
        onSettled: () => {
          setBusy(null)
          setShown((prev) => {
            const next = { ...prev }
            delete next[item.id]
            return next
          })
        },
      }
    )
  }

  return (
    <div className="flex flex-col gap-1">
      <ul
        aria-label={`${markLabel(mark.kind, mark.label)} checklist`}
        className="flex flex-col"
      >
        {items.map((item) => {
          const who = answeredLine(item)
          return (
            <li
              key={item.id}
              className="flex items-start gap-2.5 border-t border-line py-2 first:border-t-0"
            >
              <input
                type="checkbox"
                checked={shown[item.id] ?? item.done}
                disabled={readOnly || busy === item.id}
                aria-label={item.text}
                onChange={(e) => tick(item, e.target.checked)}
                className="mt-0.5 size-5 shrink-0 accent-[var(--color-tone-done-dot)]"
              />
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <span
                  className={cn(
                    'text-[13px]',
                    item.done ? 'text-text-secondary' : 'text-text-primary'
                  )}
                >
                  {item.text}
                </span>
                {(item.answer || (item.done && who)) && (
                  <span className="rounded-[8px] bg-surface-elevated px-2 py-1 text-[12px] text-text-primary">
                    {item.answer}
                    {who && (
                      <span className="block text-[11px] text-text-muted">
                        {who}
                      </span>
                    )}
                  </span>
                )}
              </div>
            </li>
          )
        })}
      </ul>
      {error && (
        <p role="alert" className="text-[12px] text-tone-attention-text">
          {error}
        </p>
      )}
    </div>
  )
}

// ─── The edit dialog's list ──────────────────────────────────────────────────

/** An item as the edit dialog holds it: its id once it has one. */
export interface DraftItem {
  key: string
  id?: string
  text: string
  done?: boolean
  answer?: string | null
}

let nextKey = 0
export const newDraftItem = (
  text: string,
  from?: MarkChecklistItem
): DraftItem => ({
  key: `item-${++nextKey}`,
  ...(from ? { id: from.id, done: from.done, answer: from.answer } : {}),
  text,
})

/** The items a template adds: those not on the list already. */
export function withTemplate(
  items: readonly DraftItem[],
  template: readonly string[]
): DraftItem[] {
  const have = new Set(items.map((item) => item.text.trim().toLowerCase()))
  return [
    ...items,
    ...template
      .filter((text) => !have.has(text.toLowerCase()))
      .map((text) => newDraftItem(text)),
  ].slice(0, CHECKLIST_LIMITS.items)
}

/** A pasted text's lines as items: its "-" lines, or each line. */
export function pastedItems(text: string): string[] {
  const { intro, points } = splitListText(text)
  if (points.length > 0) return points
  return intro
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
}

/**
 * The checklist in the edit dialog (mockup marks-checklist, C): ready-made
 * lists as chips, one row per item, Enter in "Add an item" adds it and
 * stays for the next, a pasted list splits into items, and a drag (or
 * Alt+arrow) reorders.
 */
export function ChecklistEditor({
  items,
  onChange,
}: {
  items: DraftItem[]
  onChange: (items: DraftItem[]) => void
}) {
  const id = useId()
  const [adding, setAdding] = useState('')
  const [dragging, setDragging] = useState<number | null>(null)
  const addRef = useRef<HTMLInputElement>(null)
  const full = items.length >= CHECKLIST_LIMITS.items

  const add = (texts: string[]) => {
    const clean = texts.map((text) => text.trim()).filter(Boolean)
    if (clean.length === 0) return
    onChange(
      [...items, ...clean.map((text) => newDraftItem(text))].slice(
        0,
        CHECKLIST_LIMITS.items
      )
    )
  }

  const move = (from: number, to: number) => {
    if (to < 0 || to >= items.length || from === to) return
    const next = [...items]
    const [moved] = next.splice(from, 1)
    next.splice(to, 0, moved)
    onChange(next)
  }

  const onAddKey = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== 'Enter') return
    event.preventDefault()
    add([adding])
    setAdding('')
  }

  const onAddPaste = (event: ClipboardEvent<HTMLInputElement>) => {
    const text = event.clipboardData.getData('text')
    if (!text.includes('\n')) return
    event.preventDefault()
    add(pastedItems(text))
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-2">
        <p
          id={`${id}-lists`}
          className="text-[11px] font-medium text-text-secondary"
        >
          Start from a list
        </p>
        <div
          role="group"
          aria-labelledby={`${id}-lists`}
          className="flex flex-wrap gap-2"
        >
          {CHECKLIST_TEMPLATES.map((template) => (
            <button
              key={template.name}
              type="button"
              disabled={full}
              onClick={() => onChange(withTemplate(items, template.items))}
              className="tap-target inline-flex items-center rounded-full border border-border bg-surface px-3 py-1.5 text-[12px] font-medium text-text-secondary transition-colors hover:text-text-primary disabled:opacity-50"
            >
              {template.name}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between">
          <p
            id={`${id}-items`}
            className="text-[11px] font-medium text-text-secondary"
          >
            Checklist
          </p>
          <span className="font-numeric text-[11px] text-text-muted">
            {items.length} {items.length === 1 ? 'item' : 'items'}
          </span>
        </div>
        <ul aria-labelledby={`${id}-items`} className="flex flex-col gap-1.5">
          {items.map((item, index) => (
            <li
              key={item.key}
              draggable
              onDragStart={() => setDragging(index)}
              onDragOver={(event) => {
                if (dragging !== null) event.preventDefault()
              }}
              onDrop={(event) => {
                event.preventDefault()
                if (dragging !== null) move(dragging, index)
                setDragging(null)
              }}
              onDragEnd={() => setDragging(null)}
              className={cn(
                'flex items-center gap-1.5 rounded-[10px] border border-border bg-surface pl-2',
                dragging === index && 'opacity-50'
              )}
            >
              <IconGripVertical
                size={14}
                aria-hidden="true"
                className="shrink-0 cursor-grab text-text-muted"
              />
              <input
                value={item.text}
                maxLength={CHECKLIST_LIMITS.textMax}
                aria-label={`Item ${index + 1}`}
                onChange={(e) =>
                  onChange(
                    items.map((row) =>
                      row.key === item.key
                        ? { ...row, text: e.target.value }
                        : row
                    )
                  )
                }
                onKeyDown={(event) => {
                  if (event.altKey && event.key === 'ArrowUp') {
                    event.preventDefault()
                    move(index, index - 1)
                  } else if (event.altKey && event.key === 'ArrowDown') {
                    event.preventDefault()
                    move(index, index + 1)
                  } else if (event.key === 'Enter') {
                    event.preventDefault()
                    addRef.current?.focus()
                  }
                }}
                className="min-h-10 min-w-0 flex-1 bg-transparent text-[13px] text-text-primary outline-none"
              />
              {item.done && (
                <IconCheck
                  size={14}
                  aria-label="Ticked"
                  className="shrink-0 text-tone-done-text"
                />
              )}
              <button
                type="button"
                aria-label={`Remove item ${index + 1}`}
                onClick={() =>
                  onChange(items.filter((row) => row.key !== item.key))
                }
                className="flex size-10 shrink-0 items-center justify-center rounded-full text-text-muted hover:text-text-primary"
              >
                <IconX size={14} aria-hidden="true" />
              </button>
            </li>
          ))}
          <li className="flex items-center gap-1.5 rounded-[10px] border border-dashed border-border pl-2">
            <IconPlus
              size={14}
              aria-hidden="true"
              className="shrink-0 text-text-muted"
            />
            <input
              ref={addRef}
              value={adding}
              disabled={full}
              maxLength={CHECKLIST_LIMITS.textMax}
              aria-label="Add an item"
              placeholder={
                full ? `At most ${CHECKLIST_LIMITS.items} items` : 'Add an item'
              }
              onChange={(e) => setAdding(e.target.value)}
              onKeyDown={onAddKey}
              onPaste={onAddPaste}
              onBlur={() => {
                // A typed item is not lost by tapping Save straight after.
                if (adding.trim()) {
                  add([adding])
                  setAdding('')
                }
              }}
              className="min-h-10 min-w-0 flex-1 bg-transparent text-[13px] text-text-primary outline-none placeholder:text-text-muted"
            />
          </li>
        </ul>
        <p className="text-[11px] text-text-muted">
          Enter adds the next item. Pasting a list with “-” lines splits it into
          items.
        </p>
      </div>
    </div>
  )
}

// ─── Call mode ───────────────────────────────────────────────────────────────

/**
 * "Start call" (mockup marks-checklist, B): the mark's items for the phone
 * call, each with quick answers (a radius, Yes/No, how payout details come)
 * and a box for anything else. Every answer saves as it goes and ticks the
 * item. Done closes it; a mark still To ask moves to Asked then ("Didn't pick
 * up? Marks it Asked"), so the call is on record either way.
 */
export function CallSheet({
  vendorId,
  markId,
  garageName,
  contact,
  open,
  onClose,
}: {
  vendorId: string
  markId: string
  garageName: string
  /** Who is called: the owner, else the garage's own number. */
  contact: { name: string; phone: string } | null
  open: boolean
  onClose: () => void
}) {
  const { data: marks } = useVendorMarks(vendorId)
  const mark = marks?.find((row) => row.id === markId)
  const answer = useUpdateMarkItem()
  const finish = useUpdateMark()
  const [typed, setTyped] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState<string | null>(null)
  // The tick as pressed, until the server's answer lands (or puts it back).
  const [shown, setShown] = useState<Record<string, boolean>>({})
  const [error, setError] = useState('')

  if (!mark) return null
  const items = mark.items ?? []
  const { done, total } = checklistProgress(items)
  const title = `Calling ${contact?.name || garageName}`

  const save = (
    item: MarkChecklistItem,
    input: { done?: boolean; answer?: string | null }
  ) => {
    setError('')
    setBusy(item.id)
    const done = input.done
    if (done !== undefined) setShown((prev) => ({ ...prev, [item.id]: done }))
    answer.mutate(
      { vendorId, markId: mark.id, itemId: item.id, input },
      {
        onSuccess: () => setTyped((prev) => ({ ...prev, [item.id]: '' })),
        onError: (err) => setError(markErrorText(err)),
        onSettled: () => {
          setBusy(null)
          setShown((prev) => {
            const next = { ...prev }
            delete next[item.id]
            return next
          })
        },
      }
    )
  }

  const close = () => {
    if (mark.status !== 'to_ask') return onClose()
    setError('')
    finish.mutate(
      { vendorId, markId: mark.id, input: { status: 'asked' } },
      { onSuccess: onClose, onError: (err) => setError(markErrorText(err)) }
    )
  }

  return (
    <ScSheet
      open={open}
      onClose={onClose}
      dismissible={!finish.isPending}
      aria-label={title}
    >
      <div className="flex max-h-[80vh] flex-col overflow-y-auto px-5 pb-5 pt-1">
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <h2 className="text-[17px] font-semibold text-text-primary">
              {title}
            </h2>
            <p className="mt-0.5 text-[13px] text-text-secondary">
              {garageName} ·{' '}
              <span className="font-numeric">
                {done} of {total}
              </span>
            </p>
          </div>
          {contact?.phone && (
            <a
              href={`tel:+91${contact.phone}`}
              className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full bg-tone-done-tint px-3.5 font-numeric text-[14px] font-medium text-tone-done-text"
            >
              <IconPhone size={16} aria-hidden="true" />
              {contact.phone.replace(/(\d{5})(\d{5})/, '$1 $2')}
            </a>
          )}
        </div>

        <ul aria-label="Questions" className="mt-4 flex flex-col">
          {items.map((item) => {
            const chips = quickAnswers(item.text)
            const text = typed[item.id] ?? ''
            const saving = busy === item.id
            return (
              <li
                key={item.id}
                className="flex flex-col gap-2 border-t border-line py-3"
              >
                <div className="flex items-start gap-2.5">
                  <input
                    type="checkbox"
                    checked={shown[item.id] ?? item.done}
                    disabled={saving}
                    aria-label={item.text}
                    onChange={(e) => save(item, { done: e.target.checked })}
                    className="mt-0.5 size-5 shrink-0 accent-[var(--color-tone-done-dot)]"
                  />
                  <span
                    className={cn(
                      'min-w-0 flex-1 text-[14px]',
                      item.done ? 'text-text-secondary' : 'text-text-primary'
                    )}
                  >
                    {item.text}
                  </span>
                  {item.done && item.answer && (
                    <span className="max-w-[45%] shrink-0 truncate text-[13px] text-text-secondary">
                      {item.answer}
                    </span>
                  )}
                </div>
                {!item.done && (
                  <div className="flex flex-col gap-2 pl-7">
                    {chips.length > 0 && (
                      <div
                        role="group"
                        aria-label={`Quick answers for ${item.text}`}
                        className="flex flex-wrap gap-2"
                      >
                        {chips.map((chip) => (
                          <button
                            key={chip}
                            type="button"
                            disabled={saving}
                            onClick={() =>
                              save(item, { done: true, answer: chip })
                            }
                            className="tap-target inline-flex items-center rounded-full border border-border bg-surface px-3 py-1.5 text-[13px] font-medium text-text-primary transition-colors hover:border-text-secondary disabled:opacity-50"
                          >
                            {chip}
                          </button>
                        ))}
                      </div>
                    )}
                    <div className="flex gap-2">
                      <input
                        value={text}
                        maxLength={CHECKLIST_LIMITS.answerMax}
                        disabled={saving}
                        aria-label={`Answer for ${item.text}`}
                        placeholder="Their answer…"
                        onChange={(e) =>
                          setTyped((prev) => ({
                            ...prev,
                            [item.id]: e.target.value,
                          }))
                        }
                        onKeyDown={(event) => {
                          if (event.key === 'Enter' && text.trim()) {
                            event.preventDefault()
                            save(item, { done: true, answer: text })
                          }
                        }}
                        className="min-h-11 min-w-0 flex-1 rounded-[10px] border border-border bg-surface px-3 text-[14px] text-text-primary outline-none placeholder:text-text-muted focus:border-text-secondary"
                      />
                      <button
                        type="button"
                        disabled={saving || !text.trim()}
                        onClick={() => save(item, { done: true, answer: text })}
                        aria-label={`Save the answer for ${item.text}`}
                        className="min-h-11 shrink-0 rounded-full border border-border px-3.5 text-[13px] font-medium text-text-primary disabled:opacity-40"
                      >
                        Save
                      </button>
                    </div>
                  </div>
                )}
              </li>
            )
          })}
        </ul>

        {error && (
          <p role="alert" className="mt-2 text-[13px] text-tone-attention-text">
            {error}
          </p>
        )}

        <div className="mt-3 flex items-center gap-3 border-t border-line pt-3">
          <p className="mr-auto text-[12px] text-text-muted">
            Saves as you go · Didn’t pick up? Done marks it Asked
          </p>
          <ScButton
            variant="main"
            fullWidth={false}
            onClick={close}
            disabled={finish.isPending}
            className="min-h-11 px-5"
          >
            {finish.isPending ? 'Saving…' : 'Done'}
          </ScButton>
        </div>
      </div>
    </ScSheet>
  )
}
