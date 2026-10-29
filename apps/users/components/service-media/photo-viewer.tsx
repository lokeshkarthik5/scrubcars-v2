'use client'

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import Image from 'next/image'
import { IconX } from '@tabler/icons-react'
import type { ServiceMedia } from '@repo/core/types'
import { cn } from '@repo/core/utils'

/**
 * A service's photos full screen: swipe between them (native scroll-snap,
 * so it moves with the finger), "2 / 4" at the top, the garage and the
 * service at the bottom. × or Escape closes; arrow keys step on a keyboard.
 * Only the garage's own photos come here: AI pictures never reach a
 * customer (customerMedia).
 */
export function PhotoViewer({
  photos,
  startIndex,
  garageName,
  serviceName,
  onClose,
}: {
  photos: ServiceMedia[]
  startIndex: number
  garageName: string
  serviceName: string
  onClose: () => void
}) {
  const track = useRef<HTMLDivElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)
  const [index, setIndex] = useState(startIndex)

  // Open on the photo that was tapped, focus the close button, and keep the
  // page behind from scrolling.
  useEffect(() => {
    const el = track.current
    if (el) el.scrollLeft = startIndex * el.clientWidth
    closeRef.current?.focus()
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = overflow
    }
  }, [startIndex])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = track.current
      if (e.key === 'Escape') {
        // The sheet underneath closes on Escape too; this one is first.
        e.stopPropagation()
        onClose()
      }
      if (!el) return
      if (e.key === 'ArrowRight') el.scrollBy({ left: el.clientWidth, behavior: 'smooth' })
      if (e.key === 'ArrowLeft') el.scrollBy({ left: -el.clientWidth, behavior: 'smooth' })
    }
    // Capturing, so it runs before the sheet's own Escape handler.
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [onClose])

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Photos of ${serviceName}`}
      className="fixed inset-0 z-[60] flex flex-col bg-black"
    >
      <div className="relative flex h-16 shrink-0 items-center justify-center px-4 pt-[env(safe-area-inset-top)]">
        <button
          ref={closeRef}
          type="button"
          onClick={onClose}
          aria-label="Close photos"
          className="absolute left-4 flex size-11 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/15"
        >
          <IconX size={22} aria-hidden="true" />
        </button>
        <p className="font-numeric text-[15px] font-medium text-white" aria-live="polite">
          {index + 1} <span className="text-white/50">/</span> {photos.length}
        </p>
      </div>

      <div
        ref={track}
        onScroll={(e) => {
          const el = e.currentTarget
          setIndex(Math.round(el.scrollLeft / Math.max(1, el.clientWidth)))
        }}
        className="flex min-h-0 flex-1 snap-x snap-mandatory overflow-x-auto overscroll-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {photos.map((photo, i) => (
          <div key={photo.id} className="relative h-full w-full shrink-0 snap-center">
            <Image
              src={photo.url}
              alt={`${serviceName}, photo ${i + 1} of ${photos.length}`}
              fill
              sizes="100vw"
              className="object-contain"
              priority={i === startIndex}
            />
          </div>
        ))}
      </div>

      <div className="shrink-0 px-4 pb-[calc(env(safe-area-inset-bottom)+24px)] pt-4 text-center">
        {photos.length > 1 && (
          <div className="mb-4 flex justify-center gap-1.5" aria-hidden="true">
            {photos.map((photo, i) => (
              <span
                key={photo.id}
                className={cn(
                  'h-1.5 rounded-full transition-all',
                  i === index ? 'w-5 bg-white' : 'w-1.5 bg-white/35'
                )}
              />
            ))}
          </div>
        )}
        <p className="text-[16px] font-semibold text-white">{garageName}</p>
        <p className="mt-0.5 text-[14px] text-white/60">{serviceName}</p>
      </div>
    </div>,
    document.body
  )
}
