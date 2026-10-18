'use client'

import { useState } from 'react'
import { angleLabel, beforeAfterPairs } from '@repo/core/job-photo-standards'
import type { JobPhoto } from '@repo/core/types'
import { cn } from '@repo/core/utils'
import { Chip } from '@repo/ui/sc/chip'

/**
 * Before and after, of the same angle (0045): one picture with a slider —
 * the before on the left of the line, the after on the right — and a row of
 * angle chips when more than one angle has both. Shared by the customer's
 * booking page, the garage's job card and admin's booking detail, so all
 * three show a job the same way. Nothing renders while no angle has both.
 *
 * The slider is a plain range input over the picture, so it works by touch,
 * mouse and keyboard, and says where it is. Plain <img>: the photos are
 * already sized for upload, and the optimiser would only fetch them again.
 */
export function BeforeAfterCompare({
  photos,
  className,
  title = 'Before and after',
}: {
  photos: readonly JobPhoto[]
  className?: string
  title?: string
}) {
  const pairs = beforeAfterPairs(photos)
  const [index, setIndex] = useState(0)
  const [split, setSplit] = useState(50)

  if (pairs.length === 0) return null
  const pair = pairs[Math.min(index, pairs.length - 1)]
  const label = angleLabel(pair.angle)

  return (
    <section aria-label={title} className={cn('flex flex-col gap-2', className)}>
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-[12px] font-medium text-text-primary">{title}</p>
        <p className="text-[11px] text-text-muted">{label}</p>
      </div>

      <div className="relative aspect-[4/3] w-full overflow-hidden rounded-[12px] bg-surface ring-1 ring-inset ring-border">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={pair.before.url}
          alt={`Before, ${label.toLowerCase()}`}
          className="absolute inset-0 h-full w-full object-cover"
        />
        {/* The after picture, cut away left of the line. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={pair.after.url}
          alt={`After, ${label.toLowerCase()}`}
          className="absolute inset-0 h-full w-full object-cover"
          style={{ clipPath: `inset(0 0 0 ${split}%)` }}
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 w-0.5 -translate-x-1/2 bg-white shadow-[0_0_0_1px_rgba(0,0,0,0.25)]"
          style={{ left: `${split}%` }}
        />
        <span
          aria-hidden="true"
          className="pointer-events-none absolute left-2 top-2 rounded-md bg-black/55 px-1.5 py-0.5 text-[11px] font-medium text-white"
        >
          Before
        </span>
        <span
          aria-hidden="true"
          className="pointer-events-none absolute right-2 top-2 rounded-md bg-black/55 px-1.5 py-0.5 text-[11px] font-medium text-white"
        >
          After
        </span>
        <input
          type="range"
          min={0}
          max={100}
          value={split}
          onChange={(event) => setSplit(Number(event.currentTarget.value))}
          aria-label={`Slide between before and after, ${label.toLowerCase()}`}
          aria-valuetext={`${split}% before`}
          className="absolute inset-0 h-full w-full cursor-ew-resize opacity-0"
        />
      </div>

      {pairs.length > 1 && (
        <div role="group" aria-label="Angle" className="flex flex-wrap gap-1.5">
          {pairs.map((p, i) => (
            <Chip
              key={p.angle}
              label={angleLabel(p.angle)}
              selected={i === index}
              onClick={() => {
                setIndex(i)
                setSplit(50)
              }}
            />
          ))}
        </div>
      )}
    </section>
  )
}
