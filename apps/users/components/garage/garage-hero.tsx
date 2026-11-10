'use client'

import { useRef, useState } from 'react'
import Image from 'next/image'
import type { Vendor } from '@repo/core/types'
import { cn } from '@repo/core/utils'
import { GarageCover } from '@repo/ui/features/garage-cover'

/**
 * The garage page's tall hero (§5): every photo of the garage, swiped by
 * hand (a sideways drag of 40px turns the page) with dots that stretch, a
 * shade into the page below, and a slow drift as the page scrolls
 * (`--hy`, set by the page). Without a photo, the garage's designed cover,
 * never stock imagery that could pass for the garage.
 *
 * It sits above the screen's red glow (`.gp-hero`, z-index 1), so the photo
 * is never tinted. The first photo is named after the garage; the rest are
 * the same place again, so they say nothing more to a screen reader. The
 * dots are the keyboard's way through them.
 */
export function GarageHero({ vendor }: { vendor: Vendor }) {
  const photos = vendor.photos
  const [photo, setPhoto] = useState(0)
  const [dragX, setDragX] = useState(0)
  const swipe = useRef<{ x: number; y: number; dx: number; sideways: boolean } | null>(null)

  const onPointerDown = (event: React.PointerEvent) => {
    if (photos.length < 2) return
    swipe.current = { x: event.clientX, y: event.clientY, dx: 0, sideways: false }
  }
  const onPointerMove = (event: React.PointerEvent) => {
    const s = swipe.current
    if (!s) return
    const dx = event.clientX - s.x
    const dy = event.clientY - s.y
    if (!s.sideways && Math.abs(dx) > 8 && Math.abs(dx) > Math.abs(dy)) s.sideways = true
    if (!s.sideways) return
    s.dx = dx
    setDragX(dx)
  }
  const onPointerUp = () => {
    const s = swipe.current
    swipe.current = null
    setDragX(0)
    if (!s?.sideways) return
    if (s.dx < -40) setPhoto((i) => Math.min(photos.length - 1, i + 1))
    else if (s.dx > 40) setPhoto((i) => Math.max(0, i - 1))
  }

  return (
    <div className="gp-hero w-full shrink-0">
      {photos.length > 0 ? (
        <div
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          className="gp-hero__track"
          style={{
            transform: `translateX(calc(${-photo * 100}% + ${dragX}px))`,
            transitionDuration: dragX ? '0ms' : undefined,
          }}
        >
          {photos.map((src, i) => (
            <div key={src} className="relative h-full w-full shrink-0 overflow-hidden">
              <Image
                src={src}
                alt={i === 0 ? vendor.name : ''}
                fill
                // Only the first is needed for the first paint.
                priority={i === 0}
                // The column is the screen's width up to 428px: a 360px
                // phone asks for a 360px-wide picture, not one for 428.
                sizes="(max-width: 428px) 100vw, 428px"
                className="gp-hero__photo object-cover"
                draggable={false}
              />
            </div>
          ))}
        </div>
      ) : (
        // The small-caps line sits under the back button, not behind it.
        <GarageCover vendor={vendor} size="hero" metaClassName="left-4 top-[72px]" />
      )}
      <span aria-hidden="true" className="gp-hero__shade" />
      {photos.length > 1 && (
        <div className="absolute inset-x-0 bottom-9 z-[2] flex justify-center gap-0.5">
          {photos.map((src, i) => (
            <button
              key={src}
              type="button"
              aria-label={`Photo ${i + 1} of ${photos.length}`}
              aria-current={i === photo ? 'true' : undefined}
              onClick={() => setPhoto(i)}
              className="grid h-6 place-items-center px-0.5"
            >
              <span
                className={cn(
                  'block h-1.5 rounded-[3px] transition-[width,background-color] duration-300 ease-[cubic-bezier(.34,1.56,.64,1)] motion-reduce:transition-none',
                  i === photo ? 'w-4 bg-white' : 'w-1.5 bg-white/45'
                )}
              />
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
