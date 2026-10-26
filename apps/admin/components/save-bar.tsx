'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { IconAlertCircle, IconCheck } from '@tabler/icons-react'
import { ScButton } from '@repo/ui/sc/button'
import { cn } from '@repo/core/utils'

/**
 * The garage editor's one save bar, while something is unsaved: how many
 * changes and which fields, Discard, and the page's one red action.
 *
 * On a wide screen it sits at the foot of the form column and stays in view
 * as the tab scrolls (sticky); on a phone or tablet it is fixed along the
 * bottom of the screen, over the panel's bottom menu, which is the point:
 * leaving now would lose the changes. It is not there at all when nothing
 * is unsaved, so "Save changes" is never a button that does nothing.
 */
export function SaveBar({
  count,
  line,
  block,
  saving,
  disabled,
  held = false,
  onSave,
  onDiscard,
}: {
  /** How many fields are unsaved. */
  count: number
  /** "2 unsaved changes · address, doorstep radius" (saveBarLine). */
  line: string
  /** Why Save is off, in amber, in place of `line`. */
  block: string | null
  saving: boolean
  disabled: boolean
  /**
   * Save and Discard both wait, e.g. while AI text is still arriving in the
   * services editor: either would replace the rows it is being written into.
   */
  held?: boolean
  onSave: () => void
  onDiscard: () => void
}) {
  // The count in white, the field names quieter after it. One text run, so
  // the status reads (and is matched) as the line itself.
  const at = line.indexOf(' · ')
  const head = count > 0 && at > 0 ? line.slice(0, at) : line
  const tail = count > 0 && at > 0 ? line.slice(at) : ''

  return (
    <div
      className={cn(
        'fixed inset-x-0 bottom-0 z-50 border-t border-border bg-[#111113] shadow-[0_-18px_30px_-12px_rgba(0,0,0,0.6)]',
        'lg:sticky lg:inset-x-auto lg:bottom-4 lg:rounded-[14px] lg:border'
      )}
    >
      <div className="mx-auto flex w-full max-w-[640px] flex-wrap items-center gap-x-3 gap-y-2 px-4 pb-[max(12px,env(safe-area-inset-bottom))] pt-3 lg:max-w-none lg:flex-nowrap lg:py-3">
        {/* One node for both lines, so a screen reader hears it switch from
            the changes to why Save is off, and back. */}
        <p
          id="save-bar-status"
          role="status"
          className={cn(
            'flex min-w-0 flex-1 basis-full items-center gap-2 text-[13.5px] sm:basis-0',
            block ? 'text-error' : 'text-text-primary'
          )}
        >
          {block ? (
            <IconAlertCircle
              size={17}
              className="shrink-0"
              aria-hidden="true"
            />
          ) : (
            <span
              aria-hidden="true"
              className="mx-px size-[7px] shrink-0 rounded-full bg-text-primary"
            />
          )}
          <span className="min-w-0 truncate">
            {block ?? (
              <>
                <span className="font-medium">{head}</span>
                {tail && <span className="text-text-muted">{tail}</span>}
              </>
            )}
          </span>
        </p>
        <div className="ml-auto flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={onDiscard}
            disabled={saving || held}
            className="min-h-11 shrink-0 rounded-[10px] border border-border px-3.5 text-[14px] font-medium text-text-secondary transition-colors hover:text-text-primary disabled:opacity-50"
          >
            Discard
          </button>
          <ScButton
            variant="cta"
            fullWidth={false}
            disabled={disabled || saving || held}
            aria-describedby="save-bar-status"
            onClick={onSave}
            className="min-h-11 px-4 py-2.5 font-medium"
          >
            {saving ? 'Saving…' : 'Save changes'}
          </ScButton>
        </div>
      </div>
    </div>
  )
}

export type SavedState = 'idle' | 'saving' | 'saved'

const SAVED_NOTE_MS = 2500

/**
 * The small "Saved" for a part of the editor that saves the moment it
 * changes (team, documents, payout, media, Hide and Show, the pin, Pause),
 * so each says it the same way. `saved()` shows it for a moment.
 */
export function useSavedNote() {
  const [state, setState] = useState<SavedState>('idle')
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const clear = () => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = null
  }
  useEffect(() => clear, [])
  const saving = useCallback(() => {
    clear()
    setState('saving')
  }, [])
  const saved = useCallback(() => {
    clear()
    setState('saved')
    timer.current = setTimeout(() => setState('idle'), SAVED_NOTE_MS)
  }, [])
  const reset = useCallback(() => {
    clear()
    setState('idle')
  }, [])
  return { state, saving, saved, reset }
}

/**
 * The label itself. Always mounted (a status that appears is not always
 * read out), and empty while idle unless it has something to say then
 * ("Saves on tap").
 */
export function SavedNote({
  state,
  idleText = '',
  className,
}: {
  state: SavedState
  idleText?: string
  className?: string
}) {
  return (
    <span
      role="status"
      className={cn(
        'flex shrink-0 items-center gap-1.5 text-[12.5px] text-text-secondary',
        className
      )}
    >
      {state === 'saved' && (
        <IconCheck
          size={15}
          stroke={2}
          className="text-success"
          aria-hidden="true"
        />
      )}
      {state === 'saving' ? 'Saving…' : state === 'saved' ? 'Saved' : idleText}
    </span>
  )
}
