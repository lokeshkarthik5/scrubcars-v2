'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'
import Image from 'next/image'
import {
  IconAlertTriangle,
  IconCheck,
  IconPhotoPlus,
  IconPlayerPlayFilled,
  IconVideo,
  IconVideoPlus,
  IconX,
} from '@tabler/icons-react'
import {
  uploadVideoFile,
  type MediaApi,
  type MediaConfig,
} from '@repo/core/api/service-media'
import {
  CONSENT_TEXT,
  MAX_PHOTO_BYTES,
  MAX_VIDEO_BYTES,
  PHOTO_TYPES,
  VIDEO_TOO_LONG_MESSAGE,
  formatClipLength,
  isClipTooLong,
  readVideoDuration,
} from '@repo/core/service-media'
import type { ServiceMedia } from '@repo/core/types'
import { cn } from '@repo/core/utils'

/** How often a processing video is checked while the block is open. */
const POLL_MS = 4000

const TILE =
  'relative aspect-square w-full overflow-hidden rounded-[12px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-text-primary/70'
const EMPTY_TILE = cn(
  TILE,
  'flex flex-col items-center justify-center gap-1 border border-dashed border-border px-1 text-center text-text-secondary',
  'transition-colors hover:border-text-secondary hover:text-text-primary',
  'disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-border disabled:hover:text-text-secondary'
)

/**
 * The list after a polled video settles, as the server left it: a video that
 * is now ready has taken the place of the earlier one it replaced and of any
 * AI samples (removedWhenVideoReady on the server); a failed one changes
 * nothing else.
 */
function settledList(media: readonly ServiceMedia[], fresh: ServiceMedia): ServiceMedia[] {
  const next = media.map((item) => (item.id === fresh.id ? fresh : item))
  if (fresh.videoStatus !== 'ready') return next
  return next.filter((item) => item.id === fresh.id || (item.kind !== 'video' && item.source !== 'ai'))
}

/** A video's moment-to-moment state on this screen, beyond what the row says. */
type VideoWork =
  | { step: 'idle' }
  | { step: 'checking' }
  | { step: 'uploading'; fraction: number }
  /** Refused before uploading (too long, too big, not a video). */
  | { step: 'refused'; message: string; durationSecs: number | null }

/**
 * "Photos and video": the upload block for one service, the same in the
 * garage's app and in admin (the MediaApi decides which routes it calls).
 *
 * The privacy tick comes first and every add stays disabled until it is
 * ticked; the server refuses an upload without it too. Up to the configured
 * number of photos and, when Stream is set up, one video of at most 60
 * seconds — checked on the phone before anything is uploaded, so a long clip
 * costs nobody a wait. A video then shows its progress, "Processing…" while
 * Stream encodes it (polled every few seconds as a backstop to the webhook),
 * and either Ready with Replace / Remove or a plain error.
 *
 * `extra` sits under the hint: admin's "Make a picture with AI".
 */
export function ServiceMediaEditor({
  serviceId,
  serviceName,
  media,
  onMediaChange,
  api,
  config,
  extra,
}: {
  serviceId: string
  serviceName: string
  media: ServiceMedia[]
  onMediaChange: (media: ServiceMedia[]) => void
  api: MediaApi
  /** Null while loading: photos only until it says video is on. */
  config: MediaConfig | null
  extra?: ReactNode
}) {
  const [consent, setConsent] = useState(false)
  const [busy, setBusy] = useState<'photo' | 'remove' | null>(null)
  const [video, setVideo] = useState<VideoWork>({ step: 'idle' })
  const [error, setError] = useState<string | null>(null)
  const photoInput = useRef<HTMLInputElement>(null)
  const videoInput = useRef<HTMLInputElement>(null)
  // The latest list, for the poll and the upload, which outlive a render.
  const mediaRef = useRef(media)
  useEffect(() => {
    mediaRef.current = media
  }, [media])
  // Callers pass an inline arrow, so `onMediaChange` is a new function every
  // render. Kept in a ref (written in an effect, never during render) so the
  // poll below is not restarted by every parent update: a screen re-rendering
  // faster than POLL_MS (someone typing in a form) would otherwise never let
  // it fire.
  const onMediaChangeRef = useRef(onMediaChange)
  useEffect(() => {
    onMediaChangeRef.current = onMediaChange
  }, [onMediaChange])

  const maxPhotos = config?.maxPhotos ?? 3
  const videoOn = config?.video === true
  const photos = media.filter((item) => item.kind === 'image')
  // While a replacement uploads and processes, the earlier video stays ready
  // on the garage page; the slot shows the replacement's progress.
  const liveVideo = media.find((item) => item.kind === 'video' && item.videoStatus === 'ready')
  const pendingVideo = media.find((item) => item.kind === 'video' && item.videoStatus !== 'ready')
  const currentVideo = pendingVideo ?? liveVideo ?? null
  const processingId =
    currentVideo?.videoStatus === 'processing' && video.step !== 'uploading'
      ? currentVideo.id
      : null

  // Poll a processing video until Stream has an answer.
  useEffect(() => {
    if (!processingId) return
    const timer = window.setInterval(async () => {
      try {
        const fresh = await api.getMedia(serviceId, processingId)
        if (fresh.videoStatus !== 'processing') {
          onMediaChangeRef.current(settledList(mediaRef.current, fresh))
        }
      } catch {
        // A missed poll is retried on the next tick.
      }
    }, POLL_MS)
    return () => window.clearInterval(timer)
  }, [api, serviceId, processingId])

  const fail = (err: unknown, fallback: string) =>
    setError(err instanceof Error && err.message ? err.message : fallback)

  const pickPhoto = async (files: FileList | null) => {
    const file = files?.[0]
    if (photoInput.current) photoInput.current.value = ''
    if (!file) return
    setError(null)
    if (!PHOTO_TYPES.split(',').includes(file.type)) {
      setError('Use a JPEG, PNG or WebP photo.')
      return
    }
    if (file.size > MAX_PHOTO_BYTES) {
      setError('That photo is over 5 MB. Pick a smaller one.')
      return
    }
    setBusy('photo')
    try {
      onMediaChange(await api.uploadPhoto(serviceId, file))
    } catch (err) {
      fail(err, 'The photo did not upload. Try again.')
    } finally {
      setBusy(null)
    }
  }

  const pickVideo = async (files: FileList | null) => {
    const file = files?.[0]
    if (videoInput.current) videoInput.current.value = ''
    if (!file) return
    setError(null)

    if (!file.type.startsWith('video/')) {
      setVideo({ step: 'refused', message: 'That file is not a video.', durationSecs: null })
      return
    }
    if (file.size > MAX_VIDEO_BYTES) {
      setVideo({ step: 'refused', message: 'That file is over 2 GB.', durationSecs: null })
      return
    }

    setVideo({ step: 'checking' })
    const durationSecs = await readVideoDuration(file)
    if (durationSecs !== null && isClipTooLong(durationSecs)) {
      setVideo({ step: 'refused', message: VIDEO_TOO_LONG_MESSAGE, durationSecs })
      return
    }

    // A failed or unfinished replacement is replaced itself; otherwise the
    // ready video, which the server keeps until the new one is ready.
    const replacing =
      mediaRef.current.find((item) => item.kind === 'video' && item.videoStatus !== 'ready') ??
      mediaRef.current.find((item) => item.kind === 'video')
    let started: Awaited<ReturnType<MediaApi['startVideo']>> | null = null
    try {
      started = await api.startVideo(serviceId, {
        sizeBytes: file.size,
        ...(durationSecs !== null ? { durationSecs } : {}),
        ...(replacing ? { replaces: replacing.id } : {}),
      })
      const row = started.media
      // Only a replaced video that was not ready went on the server.
      const goneId = replacing && replacing.videoStatus !== 'ready' ? replacing.id : null
      onMediaChange([row, ...mediaRef.current.filter((item) => item.id !== goneId)])
      setVideo({ step: 'uploading', fraction: 0 })
      await uploadVideoFile(started, file, (fraction) =>
        setVideo({ step: 'uploading', fraction })
      )
      setVideo({ step: 'idle' })
    } catch (err) {
      setVideo({ step: 'idle' })
      // An upload that never arrived leaves a row Stream will never finish:
      // take it away so the slot is free again. A video it was replacing is
      // still there and comes back into the slot.
      if (started) {
        try {
          onMediaChange(await api.remove(serviceId, started.media.id))
        } catch {
          // Left as processing; the server gives up on it after two hours.
        }
      }
      fail(err, 'The video did not upload. Try again.')
    }
  }

  const remove = async (item: ServiceMedia) => {
    setError(null)
    setBusy('remove')
    try {
      onMediaChange(await api.remove(serviceId, item.id))
      if (item.kind === 'video') setVideo({ step: 'idle' })
    } catch (err) {
      fail(err, 'That did not go. Try again.')
    } finally {
      setBusy(null)
    }
  }

  const addDisabled = !consent || busy !== null
  const videoBusy = video.step === 'checking' || video.step === 'uploading'
  const emptyPhotoSlots = Math.max(0, maxPhotos - photos.length)

  return (
    // Named for its service: a screen lists several of these.
    <div role="group" aria-label={`Photos and video of ${serviceName}`} className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-[13px] font-medium text-text-secondary">Photos and video</p>
        <p className="text-[12px] text-text-muted">
          Up to <span className="font-numeric">{maxPhotos}</span> photos
          {videoOn && (
            <>
              {' '}
              and <span className="font-numeric">1</span> video
            </>
          )}
        </p>
      </div>

      {/* The privacy tick, first: nothing can be added until it is given. */}
      <label className="flex min-h-11 cursor-pointer items-start gap-3">
        <input
          type="checkbox"
          checked={consent}
          onChange={(e) => setConsent(e.target.checked)}
          className="peer sr-only"
        />
        <span
          aria-hidden="true"
          className={cn(
            'mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-[7px] border transition-colors',
            'peer-focus-visible:ring-2 peer-focus-visible:ring-text-primary/70',
            consent ? 'border-brand-white bg-brand-white text-brand-black' : 'border-border bg-surface'
          )}
        >
          {consent && <IconCheck size={16} stroke={3} />}
        </span>
        <span className="text-[13px] leading-snug text-text-secondary">
          <span className="font-semibold text-text-primary">Before adding:</span> {CONSENT_TEXT}
        </span>
      </label>

      <div
        className={cn(
          'grid items-stretch gap-2',
          videoOn ? 'grid-cols-[1fr_1fr_1fr_1px_1fr]' : 'grid-cols-3'
        )}
      >
        {photos.map((photo, i) => (
          <div key={photo.id} className={cn(TILE, 'bg-surface-elevated')}>
            <Image
              src={photo.url}
              alt={`Photo ${i + 1} of ${serviceName}`}
              fill
              sizes="96px"
              className="object-cover"
            />
            {photo.source === 'ai' && (
              <span className="absolute bottom-1 left-1 rounded-[6px] bg-black/70 px-1.5 py-0.5 text-[10px] font-medium text-text-primary">
                Sample
              </span>
            )}
            {/* A 44px target in the corner; the disc stays small so it covers
                less of the photo. */}
            <button
              type="button"
              disabled={busy !== null}
              onClick={() => remove(photo)}
              aria-label={`Remove photo ${i + 1} of ${serviceName}`}
              className="absolute right-0 top-0 flex size-11 items-center justify-center text-white disabled:opacity-50"
            >
              <span className="flex size-7 items-center justify-center rounded-full bg-black/70 transition-colors hover:bg-black/85">
                <IconX size={14} stroke={2.5} aria-hidden="true" />
              </span>
            </button>
          </div>
        ))}

        {Array.from({ length: emptyPhotoSlots }, (_, i) => (
          <button
            key={`empty-${i}`}
            type="button"
            disabled={addDisabled}
            onClick={() => photoInput.current?.click()}
            aria-label={`Add a photo of ${serviceName}`}
            title={consent ? undefined : 'Tick the box above first'}
            className={EMPTY_TILE}
          >
            <IconPhotoPlus size={22} stroke={1.6} aria-hidden="true" />
            <span className="text-[12px] font-medium">
              {busy === 'photo' && i === 0 ? 'Adding…' : 'Add photo'}
            </span>
          </button>
        ))}

        {videoOn && (
          <>
            <span aria-hidden="true" className="my-3 w-px bg-border" />
            <VideoSlot
              video={currentVideo}
              work={video}
              serviceName={serviceName}
              disabled={!consent || busy !== null || videoBusy}
              onAdd={() => videoInput.current?.click()}
            />
          </>
        )}
      </div>

      {videoOn && (
        <VideoStatusLine
          video={currentVideo}
          keepsEarlier={pendingVideo !== undefined && liveVideo !== undefined}
          work={video}
          busy={busy !== null || videoBusy}
          canReplace={consent}
          onReplace={() => videoInput.current?.click()}
          onRemove={() => currentVideo && remove(currentVideo)}
        />
      )}

      {error && (
        <p role="alert" className="text-[13px] text-error">
          {error}
        </p>
      )}

      <p className="text-[12px] leading-snug text-text-muted">
        Upload the original file from the phone’s gallery — not a WhatsApp forward — for the
        sharpest result.
      </p>

      {extra}

      <input
        ref={photoInput}
        type="file"
        accept={PHOTO_TYPES}
        hidden
        aria-label={`Photo file for ${serviceName}`}
        onChange={(e) => pickPhoto(e.target.files)}
      />
      {videoOn && (
        <input
          ref={videoInput}
          type="file"
          accept="video/*"
          hidden
          aria-label={`Video file for ${serviceName}`}
          onChange={(e) => pickVideo(e.target.files)}
        />
      )}
    </div>
  )
}

function VideoSlot({
  video,
  work,
  serviceName,
  disabled,
  onAdd,
}: {
  video: ServiceMedia | null
  work: VideoWork
  serviceName: string
  disabled: boolean
  onAdd: () => void
}) {
  // Refused on the phone: amber, with the clip's length when known.
  if (work.step === 'refused') {
    return (
      <button
        type="button"
        disabled={disabled}
        onClick={onAdd}
        aria-label={`Add a different video of ${serviceName}`}
        className={cn(
          TILE,
          'flex flex-col items-center justify-center gap-2 border border-dashed border-error bg-error-muted text-error disabled:opacity-60'
        )}
      >
        <IconAlertTriangle size={24} stroke={1.8} aria-hidden="true" />
        {work.durationSecs !== null && (
          <span className="flex items-center gap-1 rounded-[6px] bg-black/40 px-1.5 py-0.5 text-[11px] font-medium">
            <IconVideo size={12} aria-hidden="true" />
            <span className="font-numeric">{formatClipLength(work.durationSecs)}</span>
          </span>
        )}
      </button>
    )
  }

  if (work.step === 'checking' || work.step === 'uploading') {
    const pct = work.step === 'uploading' ? Math.round(work.fraction * 100) : 0
    return (
      <div
        role="status"
        aria-label={work.step === 'checking' ? 'Checking the video' : `Uploading, ${pct}%`}
        className={cn(TILE, 'flex items-center justify-center bg-surface-elevated')}
      >
        <Ring fraction={work.step === 'uploading' ? work.fraction : null} />
        <IconVideo size={14} className="absolute bottom-2 left-2 text-text-secondary" aria-hidden="true" />
      </div>
    )
  }

  if (!video) {
    return (
      <button
        type="button"
        disabled={disabled}
        onClick={onAdd}
        aria-label={`Add a video of ${serviceName}`}
        title={disabled ? 'Tick the box above first' : undefined}
        className={EMPTY_TILE}
      >
        <IconVideoPlus size={22} stroke={1.6} aria-hidden="true" />
        <span className="text-[12px] font-medium leading-tight">Add video</span>
        <span className="text-[11px] leading-tight text-text-muted">
          up to <span className="font-numeric">60</span> sec
        </span>
      </button>
    )
  }

  if (video.videoStatus === 'error') {
    return (
      <div
        className={cn(
          TILE,
          'flex items-center justify-center border border-dashed border-error bg-error-muted text-error'
        )}
      >
        <IconAlertTriangle size={24} stroke={1.8} aria-label="Video failed" />
      </div>
    )
  }

  if (video.videoStatus === 'ready' && video.posterUrl) {
    return (
      <div className={cn(TILE, 'bg-surface-elevated')}>
        {/* Stream serves its own sized poster; nothing to optimise. */}
        <Image
          src={video.posterUrl}
          alt={`Video of ${serviceName}`}
          fill
          unoptimized
          sizes="96px"
          className="object-cover"
        />
        <span className="absolute inset-0 flex items-center justify-center" aria-hidden="true">
          <span className="flex size-8 items-center justify-center rounded-full bg-black/55">
            <IconPlayerPlayFilled size={14} className="text-white" />
          </span>
        </span>
        {video.durationSecs !== null && (
          <span className="absolute bottom-1.5 left-1.5 flex items-center gap-1 rounded-[6px] bg-black/70 px-1.5 py-0.5 text-[11px] font-medium text-white">
            <IconVideo size={12} aria-hidden="true" />
            <span className="font-numeric">{formatClipLength(video.durationSecs)}</span>
          </span>
        )}
      </div>
    )
  }

  // Processing: Stream has the file and is encoding it.
  return (
    <div
      role="status"
      aria-label="Video processing"
      className={cn(TILE, 'flex items-center justify-center bg-surface-elevated')}
    >
      <Ring fraction={null} />
      <IconVideo size={14} className="absolute bottom-2 left-2 text-text-secondary" aria-hidden="true" />
    </div>
  )
}

/** A thin progress ring; spins when there is no figure to show. */
function Ring({ fraction }: { fraction: number | null }) {
  const r = 14
  const c = 2 * Math.PI * r
  return (
    <svg
      viewBox="0 0 36 36"
      className={cn('size-9', fraction === null && 'animate-spin motion-reduce:animate-none')}
      aria-hidden="true"
    >
      <circle cx="18" cy="18" r={r} fill="none" stroke="currentColor" strokeOpacity=".15" strokeWidth="3" className="text-text-primary" />
      <circle
        cx="18"
        cy="18"
        r={r}
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={fraction === null ? c * 0.7 : c * (1 - fraction)}
        transform="rotate(-90 18 18)"
        className="text-text-primary"
      />
    </svg>
  )
}

function VideoStatusLine({
  video,
  keepsEarlier,
  work,
  busy,
  canReplace,
  onReplace,
  onRemove,
}: {
  video: ServiceMedia | null
  /** A replacement is on its way and customers still see the earlier video. */
  keepsEarlier: boolean
  work: VideoWork
  busy: boolean
  canReplace: boolean
  onReplace: () => void
  onRemove: () => void
}) {
  if (work.step === 'refused') {
    return (
      <p role="alert" className="flex items-start gap-2 text-[13px] text-error">
        <IconVideo size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
        {work.message}
      </p>
    )
  }
  if (work.step === 'checking') {
    return <p className="text-[13px] text-text-secondary">Checking the video…</p>
  }
  if (work.step === 'uploading') {
    return (
      <p className="flex items-center gap-2 text-[13px] text-text-secondary">
        <IconVideo size={16} aria-hidden="true" />
        <span className="font-semibold text-text-primary">Uploading…</span>
        <span className="font-numeric">{Math.round(work.fraction * 100)}%</span>
      </p>
    )
  }
  if (!video) return null

  const earlierNote = keepsEarlier ? (
    <p className="text-[12px] leading-snug text-text-muted">
      Customers see the earlier video until the new one is ready.
    </p>
  ) : null

  if (video.videoStatus === 'processing') {
    return (
      <div className="flex flex-col gap-1">
        <p className="flex items-center gap-2 text-[13px] text-text-secondary">
          <IconVideo size={16} aria-hidden="true" />
          <span className="font-semibold text-text-primary">Processing…</span>
          ready in about a minute
        </p>
        {earlierNote}
      </div>
    )
  }

  const actions = (
    <span className="ml-auto flex shrink-0 items-center">
      <button
        type="button"
        disabled={busy || !canReplace}
        onClick={onReplace}
        title={canReplace ? undefined : 'Tick the box above first'}
        className="min-h-11 px-2 text-[13px] font-semibold text-text-primary disabled:opacity-40"
      >
        Replace
      </button>
      <button
        type="button"
        disabled={busy}
        onClick={onRemove}
        aria-label="Remove video"
        className="min-h-11 pl-2 text-[13px] font-semibold text-text-primary disabled:opacity-40"
      >
        Remove
      </button>
    </span>
  )

  if (video.videoStatus === 'error') {
    return (
      <div className="flex flex-col gap-1">
        <div className="flex items-start gap-2">
          <p role="alert" className="flex items-start gap-2 pt-3 text-[13px] text-error">
            <IconVideo size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
            {video.videoError ?? 'This video could not be processed — try uploading it again'}
          </p>
          {actions}
        </div>
        {keepsEarlier && (
          <p className="text-[12px] leading-snug text-text-muted">
            Customers still see the earlier video. Remove this one to go back to it.
          </p>
        )}
      </div>
    )
  }

  return (
    <div className="flex items-center gap-2 text-[13px] text-text-secondary">
      <IconVideo size={16} aria-hidden="true" />
      {video.durationSecs !== null && (
        <>
          <span className="font-numeric font-semibold text-text-primary">
            {formatClipLength(video.durationSecs)}
          </span>
          <span aria-hidden="true">·</span>
        </>
      )}
      <span className="flex items-center gap-1">
        <IconCheck size={14} stroke={2.5} className="text-success" aria-hidden="true" />
        Ready
      </span>
      {actions}
    </div>
  )
}
