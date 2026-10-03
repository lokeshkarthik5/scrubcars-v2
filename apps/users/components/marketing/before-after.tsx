'use client'

import { useId, useState } from 'react'
import Image from 'next/image'
import { IconArrowsHorizontal } from '@tabler/icons-react'
import type { Media } from './content'

interface BeforeAfterProps {
  before: Media
  after: Media
  /** Names what is being compared, for the slider's accessible label. */
  label: string
}

/**
 * Two photos of the same car stacked, with the "before" clipped to the left of
 * a draggable divider.
 *
 * The control is a native range input stretched invisibly over the whole
 * image: dragging anywhere moves the divider, and keyboard, screen reader and
 * touch support come with the element rather than being rebuilt on pointer
 * events. Clipping uses clip-path, so moving the divider never triggers layout.
 */
export function BeforeAfter({ before, after, label }: BeforeAfterProps) {
  const [position, setPosition] = useState(50)
  const id = useId()

  return (
    <div className="relative aspect-[4/3] w-full select-none overflow-hidden rounded-xl bg-brand-rich has-[input:focus-visible]:outline-2 has-[input:focus-visible]:outline-offset-2 has-[input:focus-visible]:outline-brand-white">
      <Image
        src={after.src}
        alt={after.alt}
        fill
        sizes="(min-width: 1024px) 560px, 100vw"
        className="object-cover"
        style={after.filter ? { filter: after.filter } : undefined}
      />
      <div
        className="absolute inset-0"
        style={{ clipPath: `inset(0 ${100 - position}% 0 0)` }}
      >
        <Image
          src={before.src}
          alt={before.alt}
          fill
          sizes="(min-width: 1024px) 560px, 100vw"
          className="object-cover"
          style={before.filter ? { filter: before.filter } : undefined}
        />
      </div>

      <span className="pointer-events-none absolute left-3 top-3 rounded bg-black/60 px-2 py-1 text-[12px] font-medium text-brand-white">
        Before
      </span>
      <span className="pointer-events-none absolute right-3 top-3 rounded bg-black/60 px-2 py-1 text-[12px] font-medium text-brand-white">
        After
      </span>

      {/* Divider and handle — decorative; the range input below is the control. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-y-0 w-0.5 -translate-x-1/2 bg-brand-white/90"
        style={{ left: `${position}%` }}
      >
        <span className="absolute left-1/2 top-1/2 flex size-10 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-black/10 bg-brand-white text-brand-black">
          <IconArrowsHorizontal size={20} stroke={2} />
        </span>
      </div>

      <label htmlFor={id} className="sr-only">
        {`Compare ${label} before and after`}
      </label>
      <input
        id={id}
        type="range"
        min={0}
        max={100}
        step={1}
        value={position}
        onChange={(event) => setPosition(Number(event.target.value))}
        aria-valuetext={`${position}% before`}
        className="absolute inset-0 h-full w-full cursor-ew-resize appearance-none opacity-0"
      />
    </div>
  )
}
