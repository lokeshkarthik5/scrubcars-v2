'use client'

import { useEffect, useRef, useState } from 'react'
import { cn } from '@repo/core/utils'

/**
 * Animated overlays: `ScModal` (centred dialog) and `ScSheet` (bottom sheet).
 *
 * The reason these exist rather than an `open && <div>` in each page: an exit
 * animation needs the element to outlive the state that closed it. These keep
 * rendering after `open` flips false, play the reverse animation, then unmount
 * themselves. Callers still just pass `open` and `onClose`.
 *
 * Both also handle the things a hand-rolled overlay tends to miss — Escape to
 * dismiss, a scroll lock on the page underneath, and a backdrop click that
 * ignores clicks bubbling out of the panel.
 */

/** Longest exit animation in globals.css (--motion-fast), plus headroom. */
const EXIT_FALLBACK_MS = 260

interface OverlayProps {
  open: boolean
  onClose: () => void
  children: React.ReactNode
  /** Blocks backdrop-click and Escape while a submission is in flight. */
  dismissible?: boolean
  className?: string
  'aria-label'?: string
}

/**
 * Tracks whether the overlay should still be in the DOM.
 *
 * Mounting is decided during render — adjusting state in render is cheaper
 * than an effect here, since an effect would paint one frame of the closed
 * state before the open animation began.
 */
function useOverlayPresence(open: boolean) {
  const [visible, setVisible] = useState(open)
  const [previousOpen, setPreviousOpen] = useState(open)

  if (previousOpen !== open) {
    setPreviousOpen(open)
    // Opening mounts at once; closing waits for the exit animation below.
    if (open) setVisible(true)
  }

  // Safety net for the case where no animationend arrives — reduced motion
  // turns the animation off entirely, and a backgrounded tab can swallow the
  // event. Without this the panel would stay mounted over the page forever.
  useEffect(() => {
    if (open || !visible) return
    const timer = setTimeout(() => setVisible(false), EXIT_FALLBACK_MS)
    return () => clearTimeout(timer)
  }, [open, visible])

  const handleAnimationEnd = (event: React.AnimationEvent<HTMLElement>) => {
    if (
      !open &&
      event.target === event.currentTarget &&
      event.animationName.endsWith('-out')
    ) {
      setVisible(false)
    }
  }

  return { visible, handleAnimationEnd }
}

/** Escape-to-close plus a scroll lock on the content behind the overlay. */
function useOverlayBehaviour(
  active: boolean,
  dismissible: boolean,
  onClose: () => void
) {
  // Callers pass an inline arrow, so `onClose` is a new function every render.
  // Kept in a ref (written in an effect, never during render) so the listener
  // below binds once per open rather than re-binding on every parent update.
  const onCloseRef = useRef(onClose)

  useEffect(() => {
    onCloseRef.current = onClose
  }, [onClose])

  useEffect(() => {
    if (!active) return

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && dismissible) onCloseRef.current()
    }
    window.addEventListener('keydown', onKeyDown)

    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [active, dismissible])
}

/**
 * Keyboard focus for a dialog: into it on open, back to what opened it on
 * close.
 *
 * Without this, focus stays on the button behind the overlay: Tab walks the
 * page underneath before it reaches the dialog, and a screen reader keeps
 * reading the background. A child that took focus itself (autoFocus) keeps
 * it. The opener only gets focus back while it is still on the page — an
 * action that succeeds often removes the button that started it, and the
 * caller then decides where focus goes.
 */
function useDialogFocus(
  open: boolean,
  panelRef: React.RefObject<HTMLDivElement | null>
) {
  useEffect(() => {
    if (!open) return
    const panel = panelRef.current
    const active = document.activeElement
    const opener =
      active instanceof HTMLElement && !panel?.contains(active) ? active : null
    if (panel && !panel.contains(active)) panel.focus()

    // Tab stays inside while it is open: aria-modal tells a screen reader the
    // page behind is out of reach, and the keyboard should agree. Tab from
    // the last control goes to the first, Shift+Tab from the first (or from
    // the panel itself) to the last.
    if (panel) openPanels.push(panel)
    const onKeyDown = (event: KeyboardEvent) => {
      // Only the dialog on top: one opened from inside another must keep
      // focus, not have the one beneath pull it back.
      if (event.key !== 'Tab' || !panel || openPanels[openPanels.length - 1] !== panel) return
      const focusable = Array.from(
        panel.querySelectorAll<HTMLElement>(FOCUSABLE)
      ).filter((el) => el.offsetParent !== null || el === document.activeElement)
      if (focusable.length === 0) {
        event.preventDefault()
        panel.focus()
        return
      }
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      const current = document.activeElement
      if (event.shiftKey && (current === first || current === panel)) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && current === last) {
        event.preventDefault()
        first.focus()
      } else if (!panel.contains(current)) {
        event.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKeyDown)

    return () => {
      document.removeEventListener('keydown', onKeyDown)
      const index = panel ? openPanels.lastIndexOf(panel) : -1
      if (index !== -1) openPanels.splice(index, 1)
      if (opener?.isConnected) opener.focus()
    }
  }, [open, panelRef])
}

/** The open dialogs' panels, the top one last. */
const openPanels: HTMLElement[] = []

/** What Tab can land on inside a dialog. */
const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  'video[controls]',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

/** Centred dialog — scales up from slightly small and low. */
export function ScModal({
  open,
  onClose,
  children,
  dismissible = true,
  className,
  'aria-label': ariaLabel,
}: OverlayProps) {
  const { visible, handleAnimationEnd } = useOverlayPresence(open)
  useOverlayBehaviour(visible, dismissible, onClose)
  const panelRef = useRef<HTMLDivElement>(null)
  useDialogFocus(open, panelRef)

  if (!visible) return null

  return (
    <div
      className={cn(
        'fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-6',
        open ? 'overlay-in' : 'overlay-out'
      )}
      onClick={() => dismissible && onClose()}
      role="dialog"
      aria-modal="true"
      aria-label={ariaLabel}
    >
      <div
        ref={panelRef}
        // Focusable from script only, so the dialog itself can take focus
        // when it opens; Tab still goes to its controls.
        tabIndex={-1}
        className={cn(
          'max-h-[80vh] w-full max-w-[360px] overflow-y-auto rounded-[20px] border border-border bg-brand-black px-4 pb-5 pt-4 focus:outline-none',
          open ? 'dialog-in' : 'dialog-out',
          className
        )}
        onClick={(e) => e.stopPropagation()}
        onAnimationEnd={handleAnimationEnd}
      >
        {children}
      </div>
    </div>
  )
}

/** Bottom sheet — slides up from the edge of the screen. */
export function ScSheet({
  open,
  onClose,
  children,
  dismissible = true,
  className,
  'aria-label': ariaLabel,
  /** Shows the drag-handle bar at the top of the panel. */
  showHandle = true,
}: OverlayProps & { showHandle?: boolean }) {
  const { visible, handleAnimationEnd } = useOverlayPresence(open)
  useOverlayBehaviour(visible, dismissible, onClose)
  // The same focus handling as the centred dialog: into the sheet on open,
  // kept there by Tab, and back to what opened it on close. Sheets had none,
  // so Tab walked the page behind the backdrop.
  const panelRef = useRef<HTMLDivElement>(null)
  useDialogFocus(open, panelRef)

  if (!visible) return null

  return (
    <div
      className={cn(
        'fixed inset-0 z-50 flex items-end justify-center bg-black/50 backdrop-blur-[3px]',
        open ? 'overlay-in' : 'overlay-out'
      )}
      onClick={() => dismissible && onClose()}
      role="dialog"
      aria-modal="true"
      aria-label={ariaLabel}
    >
      <div
        ref={panelRef}
        // Focusable from script only, as ScModal's panel is.
        tabIndex={-1}
        className={cn(
          'max-h-[88vh] w-full max-w-[428px] overflow-y-auto rounded-t-[22px] border-t border-border bg-brand-black pb-6 focus:outline-none',
          open ? 'sheet-in' : 'sheet-out',
          className
        )}
        onClick={(e) => e.stopPropagation()}
        onAnimationEnd={handleAnimationEnd}
      >
        {/* The handle is drawn, not a control: the backdrop, Escape and the
            sheet's own buttons close it. */}
        {showHandle && (
          <div aria-hidden="true" className="flex justify-center py-2.5">
            <span className="h-1 w-9 rounded-full bg-border" />
          </div>
        )}
        {children}
      </div>
    </div>
  )
}
