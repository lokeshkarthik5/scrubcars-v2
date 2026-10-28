'use client'

import {
  useEffect,
  useRef,
  useState,
  type ClipboardEvent,
  type KeyboardEvent,
  type ReactNode,
} from 'react'
import {
  IconArrowDown,
  IconArrowUp,
  IconGripVertical,
  IconPlus,
  IconX,
} from '@tabler/icons-react'
import { hasPoints, joinListText, splitListText } from '@repo/core/list-text'
import { cn } from '@repo/core/utils'
import { AutoGrowTextarea } from '@/components/auto-grow-textarea'

export type DescriptionMode = 'points' | 'paragraph'

/** Points when the text already has "- " lines (mockup description-points, 1). */
export function initialDescriptionMode(text: string): DescriptionMode {
  return hasPoints(text) ? 'points' : 'paragraph'
}

/**
 * What a pasted text adds as points: its list lines, or, with no list
 * markers, each of its lines. Empty when it is one line (an ordinary paste).
 */
export function pastedPoints(text: string): {
  intro: string
  points: string[]
} | null {
  if (!/\r?\n/.test(text.trim())) return null
  const split = splitListText(text)
  if (split.points.length > 0) return split
  return {
    intro: '',
    points: text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean),
  }
}

const POINT_INPUT =
  'min-h-11 w-full min-w-0 rounded-[10px] border border-transparent bg-transparent px-2 text-[14px] text-text-primary outline-none transition-colors placeholder:text-text-muted focus:border-text-secondary focus:bg-surface'

const ICON_BUTTON =
  'flex size-9 shrink-0 items-center justify-center rounded-full text-text-muted transition-colors hover:text-text-primary disabled:opacity-30'

/**
 * A service's description in the admin editor (owner, 28 Oct 2026; mockup
 * description-points): a Points / Paragraph switch over the same plain
 * text. Points mode is one input per point and an optional line before
 * them, stored as that line then "- " lines (no new storage, so the garage
 * app, the AI and old text keep working). Enter adds the next point,
 * Backspace on an empty one removes it, the arrows or a drag reorder them,
 * and a pasted list ("-", "•", "*", "1.") splits into points by itself.
 * Paragraph mode is a box that grows with its text.
 *
 * Controlled: `value` is the stored text and `onChange` gets the new text.
 * The mode is the row's (the AI writes in it), so it is passed in too.
 */
export function DescriptionField({
  id,
  label,
  value,
  onChange,
  mode,
  onModeChange,
  disabled = false,
  action,
}: {
  id: string
  /** "Service 2": names every input for a screen reader. */
  label: string
  value: string
  onChange: (text: string) => void
  mode: DescriptionMode
  onModeChange: (mode: DescriptionMode) => void
  disabled?: boolean
  /** Write with AI and Undo, beside the switch. */
  action?: ReactNode
}) {
  // Points mode keeps its own list, empty points included, so a point being
  // typed is not dropped; the stored text leaves the empty ones out. Text
  // from outside (the AI, Undo) starts the list afresh.
  const [emitted, setEmitted] = useState(value)
  const [intro, setIntro] = useState(() => splitListText(value).intro)
  const [points, setPoints] = useState<string[]>(
    () => splitListText(value).points
  )
  if (value !== emitted) {
    const split = splitListText(value)
    setEmitted(value)
    setIntro(split.intro)
    setPoints(split.points)
  }

  // Where focus goes after the list has rendered: a point by index, or the
  // line before them.
  const [focus, setFocus] = useState<number | 'intro' | null>(null)
  const pointRefs = useRef<Array<HTMLInputElement | null>>([])
  const introRef = useRef<HTMLTextAreaElement | null>(null)
  useEffect(() => {
    if (focus === null) return
    const target =
      focus === 'intro' ? introRef.current : pointRefs.current[focus]
    target?.focus()
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-shot: focus has moved
    setFocus(null)
  }, [focus])

  const [dragging, setDragging] = useState<number | null>(null)

  const emit = (nextIntro: string, nextPoints: string[]) => {
    setIntro(nextIntro)
    setPoints(nextPoints)
    const text = joinListText(nextIntro, nextPoints)
    setEmitted(text)
    onChange(text)
  }

  const setPoint = (index: number, text: string) =>
    emit(
      intro,
      points.map((point, i) => (i === index ? text : point))
    )

  const insertAfter = (index: number, texts: string[] = ['']) => {
    const next = [...points]
    next.splice(index + 1, 0, ...texts)
    emit(intro, next)
    setFocus(index + texts.length)
  }

  const removeAt = (index: number) => {
    const next = points.filter((_, i) => i !== index)
    emit(intro, next)
    setFocus(index > 0 ? index - 1 : next.length > 0 ? 0 : 'intro')
  }

  const move = (index: number, to: number) => {
    if (to < 0 || to >= points.length || to === index) return
    const next = [...points]
    const [moved] = next.splice(index, 1)
    next.splice(to, 0, moved)
    emit(intro, next)
    setFocus(to)
  }

  const onPointKey =
    (index: number) => (event: KeyboardEvent<HTMLInputElement>) => {
      if (event.key === 'Enter') {
        event.preventDefault()
        insertAfter(index)
      } else if (event.key === 'Backspace' && points[index] === '') {
        event.preventDefault()
        removeAt(index)
      }
    }

  const onPointPaste =
    (index: number) => (event: ClipboardEvent<HTMLInputElement>) => {
      const pasted = pastedPoints(event.clipboardData.getData('text'))
      if (!pasted) return
      event.preventDefault()
      const texts = [
        ...(pasted.intro ? [pasted.intro.replace(/\n/g, ' ')] : []),
        ...pasted.points,
      ]
      const next = [...points]
      // Into an empty point: it becomes the first of them.
      const replace = points[index] === ''
      if (replace) next.splice(index, 1, ...texts)
      else next.splice(index + 1, 0, ...texts)
      emit(intro, next)
      setFocus(replace ? index + texts.length - 1 : index + texts.length)
    }

  const onIntroKey = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== 'Enter') return
    event.preventDefault()
    if (points.length === 0) insertAfter(-1)
    else setFocus(0)
  }

  const onIntroPaste = (event: ClipboardEvent<HTMLTextAreaElement>) => {
    const pasted = pastedPoints(event.clipboardData.getData('text'))
    if (!pasted) return
    event.preventDefault()
    const pastedIntro = pasted.intro.replace(/\n/g, ' ')
    // An intro already typed stays; the pasted one then leads the points.
    const keep = intro.trim() !== ''
    emit(keep ? intro : pastedIntro, [
      ...points.filter((point) => point.trim()),
      ...(keep && pastedIntro ? [pastedIntro] : []),
      ...pasted.points,
    ])
  }

  const filled = points.filter((point) => point.trim()).length

  return (
    <div className="flex flex-col gap-2">
      <div className="flex min-h-6 flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <span
            id={`${id}-label`}
            className="text-[12px] font-medium text-text-secondary"
          >
            Description
          </span>
          <div
            role="radiogroup"
            aria-label={`${label} description style`}
            className="flex rounded-full border border-border p-0.5"
          >
            {(['points', 'paragraph'] as const).map((option) => (
              <button
                key={option}
                type="button"
                role="radio"
                aria-checked={mode === option}
                disabled={disabled}
                onClick={() => {
                  if (mode === option) return
                  // Points from a paragraph: the paragraph is the line before
                  // them, and the first point is ready to type.
                  if (option === 'points') {
                    const split = splitListText(value)
                    setIntro(split.intro)
                    setPoints(split.points.length > 0 ? split.points : [''])
                    setFocus(split.points.length > 0 ? null : 0)
                  }
                  onModeChange(option)
                }}
                className={cn(
                  'min-h-9 rounded-full px-3 text-[12.5px] font-medium transition-colors',
                  mode === option
                    ? 'bg-brand-white text-brand-black'
                    : 'text-text-secondary hover:text-text-primary'
                )}
              >
                {option === 'points' ? 'Points' : 'Paragraph'}
              </button>
            ))}
          </div>
        </div>
        {action}
      </div>

      {mode === 'paragraph' ? (
        <AutoGrowTextarea
          id={id}
          value={value}
          aria-label={`${label} description`}
          placeholder="What the service includes (optional)"
          rows={2}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
          className="px-3 py-2.5 text-[14px] leading-snug"
        />
      ) : (
        <div className="flex flex-col gap-2">
          <AutoGrowTextarea
            ref={introRef}
            id={id}
            value={intro}
            rows={1}
            aria-label={`${label} line before the points`}
            placeholder={
              'One line before the points (optional), e.g. "Full exterior and interior clean"'
            }
            disabled={disabled}
            onChange={(e) => emit(e.target.value.replace(/\n/g, ' '), points)}
            onKeyDown={onIntroKey}
            onPaste={onIntroPaste}
            className="px-3 py-2.5 text-[14px] leading-snug"
          />
          <ul
            aria-label={`${label} points`}
            className="flex flex-col rounded-[12px] border border-border px-1.5 py-1"
          >
            {points.map((point, index) => (
              <li
                key={index}
                draggable={!disabled}
                onDragStart={(event) => {
                  setDragging(index)
                  event.dataTransfer.effectAllowed = 'move'
                }}
                onDragOver={(event) => {
                  if (dragging === null) return
                  event.preventDefault()
                }}
                onDrop={(event) => {
                  event.preventDefault()
                  if (dragging !== null) move(dragging, index)
                  setDragging(null)
                }}
                onDragEnd={() => setDragging(null)}
                className={cn(
                  'flex items-center gap-1 rounded-[10px]',
                  dragging === index && 'opacity-50'
                )}
              >
                <IconGripVertical
                  size={15}
                  aria-hidden="true"
                  className="shrink-0 cursor-grab text-text-muted"
                />
                <span
                  aria-hidden="true"
                  className="size-1.5 shrink-0 rounded-full bg-tone-done-dot"
                />
                <input
                  ref={(node) => {
                    pointRefs.current[index] = node
                  }}
                  value={point}
                  aria-label={`${label} point ${index + 1}`}
                  placeholder="A point"
                  disabled={disabled}
                  onChange={(e) => setPoint(index, e.target.value)}
                  onKeyDown={onPointKey(index)}
                  onPaste={onPointPaste(index)}
                  className={POINT_INPUT}
                />
                <button
                  type="button"
                  aria-label={`Move point ${index + 1} up`}
                  disabled={disabled || index === 0}
                  onClick={() => move(index, index - 1)}
                  className={ICON_BUTTON}
                >
                  <IconArrowUp size={15} aria-hidden="true" />
                </button>
                <button
                  type="button"
                  aria-label={`Move point ${index + 1} down`}
                  disabled={disabled || index === points.length - 1}
                  onClick={() => move(index, index + 1)}
                  className={ICON_BUTTON}
                >
                  <IconArrowDown size={15} aria-hidden="true" />
                </button>
                <button
                  type="button"
                  aria-label={`Remove point ${index + 1}`}
                  disabled={disabled}
                  onClick={() => removeAt(index)}
                  className={ICON_BUTTON}
                >
                  <IconX size={15} aria-hidden="true" />
                </button>
              </li>
            ))}
            <li>
              <button
                type="button"
                disabled={disabled}
                onClick={() => insertAfter(points.length - 1)}
                className="flex min-h-11 w-full items-center gap-2 rounded-[10px] px-2 text-[14px] text-text-muted transition-colors hover:text-text-primary disabled:opacity-50"
              >
                <IconPlus size={15} aria-hidden="true" />
                Add a point
              </button>
            </li>
          </ul>
          <p className="text-[12px] leading-relaxed text-text-muted">
            Enter adds the next point · Backspace on an empty point removes it ·
            drag or use the arrows to reorder · pasting a list with “-”, “•” or
            “1.” splits it into points by itself.
          </p>
          <p className="text-[12px] text-text-secondary">
            Customers see:{' '}
            <span className="font-numeric font-medium text-text-primary">
              {filled} {filled === 1 ? 'point' : 'points'}
            </span>
            {intro.trim() ? ', after the line above' : ''}
          </p>
        </div>
      )}
    </div>
  )
}
