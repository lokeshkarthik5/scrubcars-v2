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
        className={cn(
          'max-h-[80vh] w-full max-w-[360px] overflow-y-auto rounded-[20px] border border-border bg-brand-black px-4 pb-5 pt-4',
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
        className={cn(
          'max-h-[88vh] w-full max-w-[428px] overflow-y-auto rounded-t-[22px] border-t border-border bg-brand-black pb-6',
          open ? 'sheet-in' : 'sheet-out',
          className
        )}
        onClick={(e) => e.stopPropagation()}
        onAnimationEnd={handleAnimationEnd}
      >
        {showHandle && (
          <div className="flex justify-center py-2.5">
            <span className="h-1 w-9 rounded-full bg-border" />
          </div>
        )}
        {children}
      </div>
    </div>
  )
}
