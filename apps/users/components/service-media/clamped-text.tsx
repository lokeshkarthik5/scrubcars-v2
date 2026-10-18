'use client'

import { useLayoutEffect, useRef, useState } from 'react'
import { cn } from '@repo/core/utils'

/**
 * A description held to two lines, with "More" at the end of the second
 * when there is more to read. Measured, not guessed from a character count,
 * so a short text never gets a "More" that opens nothing. Keyed by the
 * caller on what it shows, so it closes again for the next service.
 */
export function ClampedText({ text, className }: { text: string; className?: string }) {
  const ref = useRef<HTMLParagraphElement>(null)
  const [open, setOpen] = useState(false)
  const [overflows, setOverflows] = useState(false)

  useLayoutEffect(() => {
    const el = ref.current
    if (el && !open) setOverflows(el.scrollHeight > el.clientHeight + 1)
  }, [text, open])

  return (
    <div className="relative">
      <p ref={ref} className={cn('whitespace-pre-line', !open && 'line-clamp-2', className)}>
        {text}
      </p>
      {overflows && !open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          // A 44px target over the end of the second line; only the word has
          // the sheet's background, so the clamped words run under it.
          className="absolute -bottom-3 right-0 flex min-h-11 min-w-11 items-center justify-end"
        >
          <span className="relative bg-brand-black pl-1 text-[13px] font-semibold text-text-primary before:absolute before:-left-6 before:top-0 before:h-full before:w-6 before:bg-gradient-to-r before:from-transparent before:to-brand-black before:content-['']">
            More
          </span>
        </button>
      )}
    </div>
  )
}
