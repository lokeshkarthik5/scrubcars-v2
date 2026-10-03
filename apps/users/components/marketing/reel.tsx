'use client'

import { useEffect, useRef, useState } from 'react'
import { IconPlayerPlayFilled } from '@tabler/icons-react'
import { cn } from '@repo/core/utils'
import type { Reel as ReelContent } from './content'

/**
 * A vertical clip of a real job. Shows its poster until tapped, then plays
 * inline with the native controls — nothing downloads until someone asks for
 * it (`preload="none"`), and nothing plays on its own.
 *
 * A sample has no file yet: it renders the same frame with a placeholder, so
 * the layout can be reviewed before marketing supplies footage.
 */
export function Reel({ reel }: { reel: ReelContent }) {
  const video = useRef<HTMLVideoElement>(null)
  const playButton = useRef<HTMLButtonElement>(null)
  const refocus = useRef(false)
  const [started, setStarted] = useState(false)

  // The play button unmounts once the clip starts. If it had focus, hand
  // focus to the video — which now has its controls — rather than letting it
  // fall back to the top of the page.
  useEffect(() => {
    if (started && refocus.current) video.current?.focus()
  }, [started])

  const start = () => {
    refocus.current = document.activeElement === playButton.current
    setStarted(true)
  }

  const frame =
    'relative aspect-[9/16] w-full overflow-hidden rounded-xl border border-white/[0.08] bg-brand-rich'

  if (!reel.src) {
    return (
      <div
        className={cn(
          frame,
          'flex flex-col items-center justify-center gap-3 bg-[radial-gradient(ellipse_70%_50%_at_50%_40%,rgba(255,255,255,0.07),transparent_75%)]'
        )}
      >
        <span className="flex size-14 items-center justify-center rounded-full border border-white/20 text-text-secondary">
          <IconPlayerPlayFilled size={22} aria-hidden />
        </span>
        <span className="text-[13px] text-text-muted">Video goes here</span>
      </div>
    )
  }

  return (
    <div className={frame}>
      <video
        ref={video}
        src={reel.src}
        poster={reel.poster}
        preload="none"
        playsInline
        controls={started}
        aria-label={reel.title}
        onPlay={start}
        className="absolute inset-0 h-full w-full object-cover"
      />
      {!started && (
        <button
          ref={playButton}
          type="button"
          // A refused play (autoplay policy, a missing file) still reveals the
          // native controls, which show the error and can retry.
          onClick={() => video.current?.play().catch(start)}
          className="group absolute inset-0 flex items-center justify-center bg-gradient-to-t from-black/60 via-transparent to-transparent focus-visible:outline-2 focus-visible:-outline-offset-4 focus-visible:outline-brand-white"
        >
          <span className="flex size-16 items-center justify-center rounded-full bg-brand-white text-brand-black transition-transform duration-200 group-hover:scale-105">
            <IconPlayerPlayFilled size={26} aria-hidden />
          </span>
          <span className="sr-only">{`Play: ${reel.title}`}</span>
        </button>
      )}
    </div>
  )
}
