'use client'

import { IconAlertCircle } from '@tabler/icons-react'
import { ScButton } from '@repo/ui/sc/button'

/**
 * The bar along the bottom of the garage editor while something is unsaved:
 * which tabs have changes, Discard, and the page's one red action.
 *
 * "Save changes" used to sit under whichever tab was open, below the fold on
 * a phone, and nothing said a change was waiting on it. The bar is there on
 * every tab the moment there is something to save and gone when there isn't,
 * so the admin always knows. On a phone it covers the panel's bottom menu,
 * which is the point: leaving now would lose the changes.
 */
export function SaveBar({
  line,
  block,
  saving,
  disabled,
  held = false,
  onSave,
  onDiscard,
}: {
  /** "Unsaved changes in Services". */
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
  return (
    <div className="fixed inset-x-0 bottom-0 z-50 border-t border-border bg-[#111113] shadow-[0_-18px_30px_-12px_rgba(0,0,0,0.6)]">
      <div className="mx-auto w-full max-w-[428px] px-4 pb-[max(12px,env(safe-area-inset-bottom))] pt-3 md:max-w-[640px]">
        <div className="mb-2.5 flex min-h-7 items-center justify-between gap-3">
          {/* One node for both lines, so a screen reader hears it switch
              from "Unsaved changes" to why Save is off, and back. */}
          <p
            id="save-bar-status"
            role="status"
            className={
              block
                ? 'flex min-w-0 items-center gap-2 text-[13.5px] text-error'
                : 'flex min-w-0 items-center gap-2.5 text-[13.5px] text-text-primary'
            }
          >
            {block ? (
              <IconAlertCircle size={17} className="shrink-0" aria-hidden="true" />
            ) : (
              <span aria-hidden="true" className="mx-px size-[7px] shrink-0 rounded-full bg-text-primary" />
            )}
            <span className="min-w-0">{block ?? line}</span>
          </p>
          <button
            type="button"
            onClick={onDiscard}
            disabled={saving || held}
            className="-mr-2 min-h-11 shrink-0 rounded-[10px] px-2 text-[14px] font-medium text-text-secondary transition-colors hover:text-text-primary disabled:opacity-50"
          >
            Discard
          </button>
        </div>
        <ScButton
          variant="cta"
          disabled={disabled || saving || held}
          aria-describedby="save-bar-status"
          onClick={onSave}
          className="py-3.5 font-medium"
        >
          {saving ? 'Saving…' : 'Save changes'}
        </ScButton>
      </div>
    </div>
  )
}
