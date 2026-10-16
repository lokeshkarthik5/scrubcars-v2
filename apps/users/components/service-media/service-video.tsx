'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'
import Image from 'next/image'
import {
  IconMaximize,
  IconPlayerPauseFilled,
  IconPlayerPlayFilled,
  IconVolume,
  IconVolumeOff,
} from '@tabler/icons-react'
import { formatClipLength } from '@repo/core/service-media'
import type { ServiceMedia } from '@repo/core/types'

type HlsInstance = { destroy(): void }

/**
 * A garage's service video in the details sheet: the poster first, and
 * nothing downloaded until the customer taps Play (no autoplay,
 * preload="none") — on a phone plan, a minute of video is not something to
 * spend for them.
 *
 * Stream serves it as HLS, which adapts to the connection up to Full HD.
 * Safari plays HLS itself; elsewhere hls.js is loaded on the first Play and
 * not before. Controls per the approved design: progress, pause, sound,
 * full screen.
 */
export function ServiceVideo({
  video,
  serviceName,
  tag,
}: {
  video: ServiceMedia
  serviceName: string
  /** The "From <garage>" label over the top-left corner. */
  tag: ReactNode
}) {
  const ref = useRef<HTMLVideoElement>(null)
  const hlsRef = useRef<HlsInstance | null>(null)
  const [started, setStarted] = useState(false)
  const [playing, setPlaying] = useState(false)
  const [muted, setMuted] = useState(false)
  const [time, setTime] = useState(0)
  const [failed, setFailed] = useState(false)
  const duration = video.durationSecs ?? 0

  // Let go of hls.js (and its buffers) when the sheet closes.
  useEffect(() => () => hlsRef.current?.destroy(), [])

  const start = async () => {
    const el = ref.current
    if (!el) return
    setStarted(true)
    try {
      if (!el.src && !hlsRef.current) {
        if (el.canPlayType('application/vnd.apple.mpegurl')) {
          el.src = video.url
        } else {
          const { default: Hls } = await import('hls.js')
          if (Hls.isSupported()) {
            const hls = new Hls({ capLevelToPlayerSize: true })
            hls.loadSource(video.url)
            hls.attachMedia(el)
            hlsRef.current = hls
          } else {
            el.src = video.url
          }
        }
      }
      await el.play()
    } catch {
      setFailed(true)
    }
  }

  const toggle = () => {
    const el = ref.current
    if (!el) return
    if (!started) {
      void start()
    } else if (el.paused) {
      void el.play().catch(() => setFailed(true))
    } else {
      el.pause()
    }
  }

  const fullscreen = () => {
    const el = ref.current as
      | (HTMLVideoElement & { webkitEnterFullscreen?: () => void })
      | null
    if (!el) return
    // iPhone Safari only takes a video full screen through its own call.
    if (el.requestFullscreen) void el.requestFullscreen().catch(() => el.webkitEnterFullscreen?.())
    else el.webkitEnterFullscreen?.()
  }

  return (
    <div className="relative aspect-video w-full overflow-hidden rounded-[14px] border border-border bg-surface-elevated">
      <video
        ref={ref}
        poster={video.posterUrl ?? undefined}
        preload="none"
        playsInline
        muted={muted}
        aria-label={`Video of ${serviceName}`}
        className="absolute inset-0 size-full object-cover"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
        onTimeUpdate={(e) => setTime(e.currentTarget.currentTime)}
        onError={() => setFailed(true)}
      />
      {/* The poster as an image too, until playback starts: the <video>
          poster attribute is not shown everywhere with preload="none". */}
      {!started && video.posterUrl && (
        <Image
          src={video.posterUrl}
          alt=""
          fill
          unoptimized
          sizes="(max-width: 428px) 100vw, 400px"
          className="object-cover"
        />
      )}

      <div className="absolute left-2.5 top-2.5 z-10">{tag}</div>

      {!started || !playing ? (
        <button
          type="button"
          onClick={toggle}
          aria-label={`Play video of ${serviceName}`}
          className="absolute inset-0 z-[5] flex items-center justify-center focus-visible:outline-none"
        >
          <span className="flex size-14 items-center justify-center rounded-full bg-black/55 text-white backdrop-blur-sm ring-1 ring-white/15">
            <IconPlayerPlayFilled size={22} aria-hidden="true" />
          </span>
        </button>
      ) : (
        // While playing, a tap anywhere pauses, as on every phone player.
        <button
          type="button"
          onClick={toggle}
          aria-label="Pause video"
          className="absolute inset-0 z-[5] focus-visible:outline-none"
        />
      )}

      {!started && duration > 0 && (
        <span className="absolute bottom-2.5 right-2.5 z-10 rounded-[8px] bg-black/70 px-2 py-1 text-[13px] font-medium text-white">
          <span className="font-numeric">{formatClipLength(duration)}</span>
        </span>
      )}

      {started && (
        <div className="absolute inset-x-0 bottom-0 z-10 bg-gradient-to-t from-black/70 to-transparent px-3 pb-1 pt-6">
          <input
            type="range"
            min={0}
            max={duration || 1}
            step={0.1}
            value={Math.min(time, duration || 1)}
            onChange={(e) => {
              if (ref.current) ref.current.currentTime = Number(e.target.value)
            }}
            aria-label="Video position"
            className="h-1 w-full cursor-pointer accent-brand-white"
          />
          <div className="flex items-center text-white">
            <button
              type="button"
              onClick={toggle}
              aria-label={playing ? 'Pause video' : 'Play video'}
              className="flex size-11 items-center justify-center"
            >
              {playing ? (
                <IconPlayerPauseFilled size={20} aria-hidden="true" />
              ) : (
                <IconPlayerPlayFilled size={20} aria-hidden="true" />
              )}
            </button>
            <span className="font-numeric text-[13px]">
              {formatClipLength(time)} / {formatClipLength(duration)}
            </span>
            <button
              type="button"
              onClick={() => setMuted((m) => !m)}
              aria-label={muted ? 'Sound on' : 'Sound off'}
              className="ml-auto flex size-11 items-center justify-center"
            >
              {muted ? (
                <IconVolumeOff size={20} aria-hidden="true" />
              ) : (
                <IconVolume size={20} aria-hidden="true" />
              )}
            </button>
            <button
              type="button"
              onClick={fullscreen}
              aria-label="Full screen"
              className="flex size-11 items-center justify-center"
            >
              <IconMaximize size={20} aria-hidden="true" />
            </button>
          </div>
        </div>
      )}

      {failed && (
        <p
          role="status"
          className="absolute inset-x-0 bottom-0 z-10 bg-black/75 px-3 py-2 text-[12px] text-error"
        >
          The video did not load. Check the connection and try again.
        </p>
      )}
    </div>
  )
}
