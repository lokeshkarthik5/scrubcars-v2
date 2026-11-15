'use client'

import type { ReactNode } from 'react'
import { cn } from '@repo/core/utils'

/** A mark to draw: its box on the photo (0-1 from the top left) and its words. */
export interface PhotoMark {
  id: string
  box: { x: number; y: number; w: number; h: number } | null
  label: string
}

/**
 * A car condition check photo (0075) with its marks drawn on it: a red
 * circle round each box and, with `labels`, a small tag naming it
 * ("Scratch – rear left door"). Shared by the garage's "Check the marks",
 * its warning before Complete job, and the customer's condition card, so
 * both sides see the same circles.
 *
 * The photo keeps its own shape (no cropping), so the boxes land where the
 * model put them. Plain <img>: the photos are already sized for upload. The
 * circles are decoration: the marks are listed in words beside every use,
 * so the picture's alt names the photo only.
 */
export function MarkedPhoto({
  src,
  alt,
  marks,
  labels = true,
  className,
  children,
}: {
  src: string
  alt: string
  marks: readonly PhotoMark[]
  labels?: boolean
  className?: string
  /** Laid over the photo, e.g. the angle's chip. */
  children?: ReactNode
}) {
  return (
    <div className={cn('relative w-full overflow-hidden rounded-[16px] bg-surface ring-1 ring-inset ring-border', className)}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt={alt} className="block h-auto w-full" />
      {marks.map((mark) =>
        mark.box ? (
          <span key={mark.id} aria-hidden="true">
            <span
              className="pointer-events-none absolute rounded-[50%] border-2 border-brand-red shadow-[0_0_0_1px_rgba(0,0,0,0.35)]"
              style={{
                left: `${mark.box.x * 100}%`,
                top: `${mark.box.y * 100}%`,
                width: `${mark.box.w * 100}%`,
                height: `${mark.box.h * 100}%`,
              }}
            />
            {labels && (
              <span
                className="pointer-events-none absolute max-w-[60%] truncate rounded-full border border-brand-red/70 bg-brand-black/85 px-2 py-0.5 text-[11px] font-medium leading-tight text-text-primary"
                style={{
                  // From the circle's left edge, or its right edge on the
                  // right half of the photo, so a tag stays on the photo.
                  ...(mark.box.x + mark.box.w / 2 <= 0.5
                    ? { left: `${mark.box.x * 100}%` }
                    : { right: `${(1 - mark.box.x - mark.box.w) * 100}%` }),
                  // Above the circle, or under it when it is near the top.
                  ...(mark.box.y > 0.14
                    ? { bottom: `${(1 - mark.box.y) * 100 + 1}%` }
                    : { top: `${(mark.box.y + mark.box.h) * 100 + 1}%` }),
                }}
              >
                {mark.label}
              </span>
            )}
          </span>
        ) : null
      )}
      {children}
    </div>
  )
}
