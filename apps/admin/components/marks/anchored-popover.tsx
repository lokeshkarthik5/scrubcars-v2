'use client'

import { useMemo, useSyncExternalStore, type ReactNode } from 'react'
import { Popover } from 'radix-ui'
import { cn } from '@repo/core/utils'
import { ScModal } from '@repo/ui/sc/modal'

/** The panel's laptop layout starts at Tailwind's `md`. */
const DESKTOP = '(min-width: 768px)'

function subscribe(onChange: () => void) {
  const query = window.matchMedia(DESKTOP)
  query.addEventListener('change', onChange)
  return () => query.removeEventListener('change', onChange)
}

/** True on a laptop-wide screen; false on a phone and while server-rendering. */
export function useIsDesktop(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(DESKTOP).matches,
    () => false
  )
}

/**
 * A small form opened from a button (mockup 06, panel 2): on a laptop a
 * popover next to the button that opened it, so the row stays in sight; on a
 * phone, or with no button to sit by, a centred dialog. Either way it is a
 * modal dialog named by `aria-label`: Escape and a click outside close it
 * (unless `dismissible` is false), and focus stays inside while it is open.
 *
 * Render it inside MarksOverlay, so a click in it never reaches a table row.
 */
export function AnchoredPopover({
  anchor,
  onClose,
  dismissible = true,
  side = 'bottom',
  'aria-label': ariaLabel,
  className,
  children,
}: {
  /** The button that opened it; null or gone opens a dialog instead. */
  anchor?: HTMLElement | null
  onClose: () => void
  dismissible?: boolean
  side?: 'top' | 'bottom'
  'aria-label': string
  className?: string
  children: ReactNode
}) {
  const desktop = useIsDesktop()
  const virtualRef = useMemo(() => ({ current: anchor ?? null }), [anchor])

  if (!desktop || !anchor?.isConnected) {
    return (
      <ScModal
        open
        onClose={onClose}
        dismissible={dismissible}
        aria-label={ariaLabel}
        className={cn('max-w-[420px]', className)}
      >
        {children}
      </ScModal>
    )
  }

  return (
    <Popover.Root
      open
      modal
      onOpenChange={(open) => {
        if (!open && dismissible) onClose()
      }}
    >
      <Popover.Anchor virtualRef={virtualRef as { current: HTMLElement }} />
      <Popover.Portal>
        <Popover.Content
          aria-label={ariaLabel}
          side={side}
          align="end"
          sideOffset={6}
          collisionPadding={12}
          onEscapeKeyDown={(event) => {
            if (!dismissible) event.preventDefault()
          }}
          onInteractOutside={(event) => {
            if (!dismissible) event.preventDefault()
          }}
          className={cn(
            'z-50 max-h-(--radix-popover-content-available-height) w-[400px] max-w-[calc(100vw-24px)] overflow-y-auto rounded-[16px] border border-border bg-brand-black px-4 pb-4 pt-3 shadow-[0_16px_48px_rgba(0,0,0,0.55)] focus:outline-none',
            'fade-in',
            className
          )}
        >
          {children}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}
