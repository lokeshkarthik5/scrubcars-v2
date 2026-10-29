'use client'

import { useState } from 'react'
import {
  IconCamera,
  IconCameraPlus,
  IconCheck,
  IconLoader2,
} from '@tabler/icons-react'
import { toast } from 'react-toastify'
import { ScButton } from '@repo/ui/sc/button'
import { ScModal } from '@repo/ui/sc/modal'
import { deleteJobPhoto, uploadJobPhoto } from '@repo/core/api/job-records'
import { MAX_JOB_PHOTOS_PER_STAGE } from '@repo/core/job-records'
import {
  MIN_GARAGE_PHOTOS,
  PHOTO_ANGLE_LABELS,
  angleLabel,
  angleSlots,
  extraPhotos,
  photosOf,
  type PhotoAngle,
} from '@repo/core/job-photo-standards'
import type { Booking, JobPhoto } from '@repo/core/types'
import { cn } from '@repo/core/utils'
import { resizeForUpload } from '@/lib/resize-image'

const LABELS: Record<JobPhoto['stage'], string> = {
  before: 'Before photos',
  after: 'After photos',
}

/** What each stage asks for while the standard is on (0045). */
const REQUIRED_HINTS: Record<JobPhoto['stage'], string> = {
  before: `Walk round the car before you start: at least ${MIN_GARAGE_PHOTOS} photos, any marks up close.`,
  after: `The finished work, before the car goes back: at least ${MIN_GARAGE_PHOTOS} photos.`,
}

const HINTS: Record<JobPhoto['stage'], string> = {
  before: 'Optional. The car as it came in, if anything is already marked.',
  after: 'Optional. The finished work, before the car goes back.',
}

// Pickup & drop: the car is in the garage's care from the moment it is
// collected, so its before photos are taken at the customer's door.
const PICKUP_HINTS: Record<JobPhoto['stage'], string> = {
  before:
    'Recommended: the car as you collect it, every side and any marks. They are your record of how it was handed over.',
  after: 'Optional. The finished work, before the car goes back.',
}

const capitalise = (text: string) =>
  text.charAt(0).toUpperCase() + text.slice(1)

interface JobPhotosProps {
  booking: Booking
  stage: JobPhoto['stage']
  /** Re-read the job list once photos change. */
  onChanged: () => void
  /**
   * The record is closed for this stage (before photos once the job is
   * completed, after photos an hour after): photos show, but can no longer
   * be added or removed. The server holds the same rule.
   */
  readOnly?: boolean
}

type Viewing = { photo: JobPhoto; name: string; own: boolean }

/**
 * One stage of a job's photos, as a guided checklist (0045): the five
 * angles (Front, Back, Left side, Right side, Interior), each a tile that
 * opens the camera, then a thumbnail once taken; extras after them; and the
 * customer's own photos of the car, read-only. While the photo standard is
 * on, Start waits for two before photos and Complete for two after photos —
 * the count beside the heading says how far along it is.
 *
 * Removing one takes deliberate steps: a tap on a thumbnail opens it full
 * size, and Remove lives there, behind "Remove this photo?". A remove button
 * on the thumbnail itself covered half of a 64px photo, and a mechanic
 * tapping to look would delete the evidence as often as not.
 *
 * Phone photos are shrunk to a 1600px JPEG in the browser before upload
 * (lib/resize-image.ts), which also strips their location metadata.
 */
export function JobPhotos({
  booking,
  stage,
  onChanged,
  readOnly = false,
}: JobPhotosProps) {
  // The slot uploading now ('extra' for the More tile), if any.
  const [uploading, setUploading] = useState<PhotoAngle | 'extra' | null>(null)
  const [removingId, setRemovingId] = useState<string | null>(null)
  const [viewing, setViewing] = useState<Viewing | null>(null)
  const [confirming, setConfirming] = useState(false)

  const standard = booking.photoStandard
  const required = Boolean(standard?.required && !standard.waived)
  const own = photosOf(booking.jobPhotos, 'garage', stage)
  const slots = angleSlots(booking.jobPhotos, 'garage', stage)
  const extras = extraPhotos(booking.jobPhotos, 'garage', stage)
  const customers = photosOf(booking.jobPhotos, 'customer', stage)
  const room = readOnly ? 0 : MAX_JOB_PHOTOS_PER_STAGE - own.length
  const who = booking.customerName ?? 'this customer'
  const stageWord = stage === 'before' ? 'before' : 'after'

  const upload = async (files: File[], angle: PhotoAngle | undefined) => {
    if (files.length === 0) return
    setUploading(angle ?? 'extra')
    try {
      for (const file of files) {
        try {
          const prepared = await resizeForUpload(file)
          await uploadJobPhoto(booking.id, stage, prepared, angle)
        } catch (error) {
          toast.error(error instanceof Error ? error.message : 'Upload failed')
        }
      }
    } finally {
      setUploading(null)
      onChanged()
    }
  }

  const closeViewer = () => {
    setViewing(null)
    setConfirming(false)
  }

  const handleRemove = async (photoId: string) => {
    setRemovingId(photoId)
    try {
      await deleteJobPhoto(booking.id, photoId)
      closeViewer()
      onChanged()
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'Could not remove this photo'
      )
    } finally {
      setRemovingId(null)
    }
  }

  if (readOnly && own.length === 0 && customers.length === 0) return null

  const thumb = (photo: JobPhoto, name: string, isOwn: boolean) => (
    <button
      type="button"
      onClick={() => setViewing({ photo, name, own: isOwn })}
      aria-label={`View ${name}`}
      className="block size-16 overflow-hidden rounded-[12px] bg-surface ring-1 ring-inset ring-border"
    >
      {/* A plain <img>: the photo is already sized for the screen, and the
          optimiser would only fetch it again. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={photo.url} alt="" className="h-full w-full object-cover" />
    </button>
  )

  // The two big tiles (garage mockup 03): Front and Back, the two angles the
  // standard's two photos usually are, with the next one to take outlined in
  // red. The other angles are small "+" chips, and extras go under More.
  const big = slots.slice(0, 2)
  const small = slots.slice(2)
  const nextAngle = readOnly
    ? null
    : (big.find((slot) => !slot.photo)?.angle ?? null)
  const shortLabel = (angle: PhotoAngle) =>
    angle === 'interior'
      ? 'Inside'
      : PHOTO_ANGLE_LABELS[angle].replace(' side', '')

  const camera = (
    angle: PhotoAngle | undefined,
    children: React.ReactNode,
    className: string
  ) => (
    // The input sits inside its label, so the whole tile opens the camera
    // (the back one, on a phone) and the input carries the name.
    <label
      className={cn(
        'cursor-pointer',
        uploading !== null && 'pointer-events-none opacity-60',
        className
      )}
    >
      <input
        type="file"
        accept="image/*"
        capture={angle ? 'environment' : undefined}
        multiple={!angle}
        className="sr-only"
        aria-label={
          angle
            ? `Add ${PHOTO_ANGLE_LABELS[angle].toLowerCase()} ${stageWord} photo for ${who}`
            : `Add ${stageWord} photos for ${who}`
        }
        disabled={uploading !== null}
        onChange={(event) => {
          const files = Array.from(event.currentTarget.files ?? []).slice(
            0,
            angle ? 1 : Math.max(0, room)
          )
          event.currentTarget.value = ''
          void upload(files, angle)
        }}
      />
      {children}
    </label>
  )

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-[20px] font-semibold text-text-primary">
          {LABELS[stage]}
        </h2>
        <p
          className={cn(
            'rounded-full border px-3 py-1 font-numeric text-[14px] font-medium',
            required && own.length >= MIN_GARAGE_PHOTOS
              ? 'border-success/40 text-success'
              : 'border-white/20 text-text-primary'
          )}
        >
          {required
            ? `${Math.min(own.length, MIN_GARAGE_PHOTOS)} of ${MIN_GARAGE_PHOTOS}`
            : `${own.length}/${MAX_JOB_PHOTOS_PER_STAGE}`}
        </p>
      </div>
      {own.length === 0 && !readOnly && (
        <p className="text-[14px] text-text-secondary">
          {required
            ? REQUIRED_HINTS[stage]
            : (booking.bookingType === 'pickup' ? PICKUP_HINTS : HINTS)[stage]}
        </p>
      )}
      {/* While the standard is optional (the pilot default), a nudge rather
          than a block: why the photos are worth taking. */}
      {!required && !readOnly && own.length < MIN_GARAGE_PHOTOS && (
        <p className="text-[13px] text-text-secondary">
          Photos protect you if a customer complains, and count toward Gold.
        </p>
      )}
      {readOnly && own.length > 0 && (
        <p className="text-[13px] text-text-secondary">
          {stage === 'before'
            ? 'Closed once the job was completed.'
            : 'Closed an hour after the job was completed.'}
        </p>
      )}

      <ul className="grid grid-cols-2 gap-3">
        {big.map(({ angle, photo }) => {
          const label = PHOTO_ANGLE_LABELS[angle]
          if (photo) {
            return (
              <li key={angle} className="relative">
                <button
                  type="button"
                  onClick={() =>
                    setViewing({
                      photo,
                      name: `${label.toLowerCase()} ${stageWord} photo for ${who}`,
                      own: true,
                    })
                  }
                  aria-label={`View ${label.toLowerCase()} ${stageWord} photo for ${who}`}
                  className="block aspect-[4/3] w-full overflow-hidden rounded-[16px] bg-surface ring-1 ring-inset ring-border"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={photo.url}
                    alt=""
                    className="h-full w-full object-cover"
                  />
                </button>
                <span
                  aria-hidden="true"
                  className="absolute right-2 top-2 flex size-7 items-center justify-center rounded-full bg-success text-brand-black"
                >
                  <IconCheck size={16} stroke={3} />
                </span>
                <span className="pointer-events-none absolute bottom-2 left-2 rounded-full bg-brand-black/80 px-2.5 py-0.5 text-[14px] font-medium text-text-primary">
                  {label}
                </span>
              </li>
            )
          }
          if (room <= 0) return null
          return (
            <li key={angle}>
              {camera(
                angle,
                <span
                  className={cn(
                    'flex aspect-[4/3] w-full flex-col items-center justify-center gap-2 rounded-[16px] border-2 border-dashed text-[16px] font-semibold',
                    angle === nextAngle
                      ? 'border-brand-red bg-brand-red/10 text-text-primary'
                      : 'border-border text-text-secondary'
                  )}
                >
                  {uploading === angle ? (
                    <IconLoader2
                      size={30}
                      className="animate-spin"
                      aria-hidden
                    />
                  ) : (
                    <IconCamera size={30} aria-hidden />
                  )}
                  {label}
                </span>,
                'block'
              )}
            </li>
          )
        })}
      </ul>

      <ul className="flex flex-wrap gap-2">
        {small.map(({ angle, photo }) => {
          if (photo) {
            const label = PHOTO_ANGLE_LABELS[angle]
            return (
              <li key={angle} className="flex flex-col items-center gap-1">
                <span className="relative">
                  {thumb(
                    photo,
                    `${label.toLowerCase()} ${stageWord} photo for ${who}`,
                    true
                  )}
                  <span
                    aria-hidden="true"
                    className="absolute -right-1 -top-1 flex size-5 items-center justify-center rounded-full bg-success text-brand-black"
                  >
                    <IconCheck size={12} stroke={3} />
                  </span>
                </span>
                <span className="text-[13px] text-text-secondary">{label}</span>
              </li>
            )
          }
          if (room <= 0) return null
          return (
            <li key={angle}>
              {camera(
                angle,
                <span className="flex h-12 items-center gap-1 rounded-full border border-white/20 px-4 text-[16px] text-text-primary">
                  {uploading === angle ? (
                    <IconLoader2
                      size={16}
                      className="animate-spin"
                      aria-hidden
                    />
                  ) : (
                    '+'
                  )}{' '}
                  {shortLabel(angle)}
                </span>,
                'block'
              )}
            </li>
          )
        })}

        {extras.map((photo, i) => (
          <li key={photo.id} className="flex flex-col items-center gap-1">
            {thumb(photo, `extra ${stageWord} photo ${i + 1} for ${who}`, true)}
            <span className="text-[13px] text-text-secondary">Extra</span>
          </li>
        ))}

        {room > 0 && (
          <li>
            {/* Anything else: several at once, from the camera or the gallery. */}
            {camera(
              undefined,
              <span className="flex h-12 items-center gap-1.5 rounded-full border border-white/20 px-4 text-[16px] text-text-primary">
                {uploading === 'extra' ? (
                  <IconLoader2 size={16} className="animate-spin" aria-hidden />
                ) : (
                  <IconCameraPlus size={18} aria-hidden />
                )}
                More
              </span>,
              'block'
            )}
          </li>
        )}
      </ul>

      {/* The customer's own photos of the car (0045): the same record from
          their side. Theirs to add or remove, never the garage's. */}
      {customers.length > 0 && (
        <div className="flex flex-col gap-1 pt-1">
          <p className="text-[13px] text-text-secondary">{`From ${who}`}</p>
          <ul className="flex flex-wrap gap-2">
            {customers.map((photo, i) => (
              <li
                key={photo.id}
                className="flex w-16 flex-col items-center gap-0.5"
              >
                {thumb(photo, `customer's ${stageWord} photo ${i + 1}`, false)}
                <span className="text-[13px] text-text-secondary">
                  {angleLabel(photo.angle)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <ScModal
        open={viewing !== null}
        onClose={closeViewer}
        dismissible={removingId === null}
        aria-label={viewing ? capitalise(viewing.name) : 'Job photo'}
        className="max-w-[420px] px-3"
      >
        {viewing && (
          <div className="flex flex-col gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={viewing.photo.url}
              alt={capitalise(viewing.name)}
              className="max-h-[60vh] w-full rounded-[12px] object-contain"
            />
            {confirming ? (
              <>
                <p className="text-[15px] text-text-primary">
                  {`Remove this ${stageWord} photo? It is your record of the job if the customer questions the work later.`}
                </p>
                <div className="flex gap-2">
                  <ScButton
                    variant="outline"
                    size="md"
                    disabled={removingId !== null}
                    onClick={() => setConfirming(false)}
                  >
                    Keep
                  </ScButton>
                  <ScButton
                    variant="danger-outline"
                    size="md"
                    disabled={removingId !== null}
                    onClick={() => handleRemove(viewing.photo.id)}
                    aria-label={`Remove ${viewing.name}`}
                  >
                    {removingId === viewing.photo.id ? 'Removing…' : 'Remove'}
                  </ScButton>
                </div>
              </>
            ) : (
              <div className="flex gap-2">
                <ScButton variant="outline" size="md" onClick={closeViewer}>
                  Close
                </ScButton>
                {!readOnly && viewing.own && (
                  <ScButton
                    variant="outline"
                    size="md"
                    onClick={() => setConfirming(true)}
                  >
                    Remove photo
                  </ScButton>
                )}
              </div>
            )}
          </div>
        )}
      </ScModal>
    </div>
  )
}
