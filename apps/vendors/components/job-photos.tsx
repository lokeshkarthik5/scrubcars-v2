'use client'

import { useState } from 'react'
import {
  IconCamera,
  IconCameraPlus,
  IconCheck,
  IconLoader2,
} from '@tabler/icons-react'
import { toast } from 'react-toastify'
import { useT } from '@repo/core/i18n'
import { msg } from '@repo/core/i18n/translate'
import { ScButton } from '@repo/ui/sc/button'
import { ScModal } from '@repo/ui/sc/modal'
import { deleteJobPhoto, uploadJobPhoto } from '@repo/core/api/job-records'
import { MAX_JOB_PHOTOS_PER_STAGE } from '@repo/core/job-records'
import {
  JOB_PHOTO_ANGLE_LABELS,
  MIN_GARAGE_PHOTOS,
  PHOTO_ANGLES,
  angleLabel,
  angleSlots,
  extraPhotos,
  photosOf,
  type JobPhotoAngle,
} from '@repo/core/job-photo-standards'
import {
  CAR_CHECK_ANGLES,
  CAR_CHECK_PHOTO_CAP,
  isCarCheckAngle,
} from '@repo/core/condition-check'
import type { Booking, JobPhoto } from '@repo/core/types'
import { cn } from '@repo/core/utils'
import { resizeForUpload } from '@/lib/resize-image'

// English, shown as `t(…)`.
const LABELS: Record<JobPhoto['stage'], string> = {
  before: msg('Before photos'),
  after: msg('After photos'),
}

/** What each stage asks for while the standard is on (0045); `{count}` is MIN_GARAGE_PHOTOS. */
const REQUIRED_HINTS: Record<JobPhoto['stage'], string> = {
  before: msg('Walk round the car before you start: at least {count} photos, any marks up close.'),
  after: msg('The finished work, before the car goes back: at least {count} photos.'),
}

const HINTS: Record<JobPhoto['stage'], string> = {
  before: msg('Optional. The car as it came in, if anything is already marked.'),
  after: msg('Optional. The finished work, before the car goes back.'),
}

// Pickup & drop: the car is in the garage's care from the moment it is
// collected, so its before photos are taken at the customer's door.
const PICKUP_HINTS: Record<JobPhoto['stage'], string> = {
  before: msg(
    'Recommended: the car as you collect it, every side and any marks. They are your record of how it was handed over.'
  ),
  after: msg('Optional. The finished work, before the car goes back.'),
}

/** The car condition check's walk-round (0075): what each stage asks for. */
const CAR_CHECK_LABELS: Record<JobPhoto['stage'], string> = {
  before: msg('Car check · before'),
  after: msg('Car check · after'),
}

const CAR_CHECK_HINTS: Record<JobPhoto['stage'], string> = {
  before: msg(
    'Walk round the car with the customer. Detlio marks the scratches and dents it sees; you check them.'
  ),
  after: msg(
    'The same 8 angles, once the work is done. Detlio compares them with the before photos.'
  ),
}

/** The small chips' words: the angle without " side", and Inside for the interior. */
const SHORT_LABELS: Record<JobPhotoAngle, string> = {
  front: msg('Front'),
  back: msg('Back'),
  left: msg('Left'),
  right: msg('Right'),
  interior: msg('Inside'),
  front_left: msg('Front left'),
  front_right: msg('Front right'),
  back_left: msg('Back left'),
  back_right: msg('Back right'),
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
  const t = useT()
  // The slot uploading now ('extra' for the More tile), if any.
  const [uploading, setUploading] = useState<JobPhotoAngle | 'extra' | null>(
    null
  )
  const [removingId, setRemovingId] = useState<string | null>(null)
  const [viewing, setViewing] = useState<Viewing | null>(null)
  const [confirming, setConfirming] = useState(false)

  const standard = booking.photoStandard
  // The car condition check (0075): while it is on for the garage the
  // checklist is its 8-angle walk-round, every angle a big tile.
  const carCheck = booking.conditionCheck
  const angles: readonly JobPhotoAngle[] = carCheck
    ? CAR_CHECK_ANGLES
    : PHOTO_ANGLES
  const required = carCheck
    ? stage === 'before' && carCheck.required
    : Boolean(standard?.required && !standard.waived)
  // Sent to the customer, the before angles are the record (no retake, no
  // removal); extras stay the garage's.
  const locked = Boolean(carCheck?.sentAt) && stage === 'before'
  const own = photosOf(booking.jobPhotos, 'garage', stage)
  const slots = angleSlots(booking.jobPhotos, 'garage', stage, angles)
  const extras = extraPhotos(booking.jobPhotos, 'garage', stage, angles)
  const customers = photosOf(booking.jobPhotos, 'customer', stage)
  const taken = slots.filter((slot) => slot.photo).length
  const cap = carCheck ? CAR_CHECK_PHOTO_CAP : MAX_JOB_PHOTOS_PER_STAGE
  const room = readOnly ? 0 : cap - own.length
  const who = booking.customerName ?? t('this customer')
  const before = stage === 'before'
  // "front before photo for Ravi": each stage its own sentence, so Tamil can
  // order it its own way.
  const angleName = (angle: JobPhotoAngle) =>
    t(JOB_PHOTO_ANGLE_LABELS[angle]).toLowerCase()
  const photoName = (angle: JobPhotoAngle) =>
    before
      ? t('{angle} before photo for {who}', { angle: angleName(angle), who })
      : t('{angle} after photo for {who}', { angle: angleName(angle), who })

  const upload = async (files: File[], angle: JobPhotoAngle | undefined) => {
    if (files.length === 0) return
    setUploading(angle ?? 'extra')
    try {
      for (const file of files) {
        try {
          const prepared = await resizeForUpload(file)
          await uploadJobPhoto(booking.id, stage, prepared, angle)
        } catch (error) {
          toast.error(error instanceof Error ? error.message : t('Upload failed'))
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
        error instanceof Error ? error.message : t('Could not remove this photo')
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
      aria-label={t('View {photo}', { photo: name })}
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
  // The car check's walk-round is eight big tiles (condition-check mockup 1).
  const big = carCheck ? slots : slots.slice(0, 2)
  const small = carCheck ? [] : slots.slice(2)
  const nextAngle =
    readOnly || locked
      ? null
      : (big.find((slot) => !slot.photo)?.angle ?? null)
  const shortLabel = (angle: JobPhotoAngle) => t(SHORT_LABELS[angle])

  const camera = (
    angle: JobPhotoAngle | undefined,
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
            ? before
              ? t('Add {angle} before photo for {who}', { angle: angleName(angle), who })
              : t('Add {angle} after photo for {who}', { angle: angleName(angle), who })
            : before
              ? t('Add before photos for {who}', { who })
              : t('Add after photos for {who}', { who })
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
          {carCheck ? t(CAR_CHECK_LABELS[stage]) : t(LABELS[stage])}
        </h2>
        {carCheck ? (
          <p
            className={cn(
              'rounded-full border px-3 py-1 font-numeric text-[14px] font-medium',
              taken >= CAR_CHECK_ANGLES.length
                ? 'border-success/40 text-success'
                : 'border-white/20 text-text-primary'
            )}
          >
            {t('{done} of {count}', {
              done: taken,
              count: CAR_CHECK_ANGLES.length,
            })}
          </p>
        ) : (
          <p
            className={cn(
              'rounded-full border px-3 py-1 font-numeric text-[14px] font-medium',
              required && own.length >= MIN_GARAGE_PHOTOS
                ? 'border-success/40 text-success'
                : 'border-white/20 text-text-primary'
            )}
          >
            {required
              ? t('{done} of {count}', {
                  done: Math.min(own.length, MIN_GARAGE_PHOTOS),
                  count: MIN_GARAGE_PHOTOS,
                })
              : `${own.length}/${MAX_JOB_PHOTOS_PER_STAGE}`}
          </p>
        )}
      </div>
      {carCheck && !readOnly && !locked && taken < CAR_CHECK_ANGLES.length && (
        <p className="text-[14px] text-text-secondary">
          {t(CAR_CHECK_HINTS[stage])}
        </p>
      )}
      {!carCheck && own.length === 0 && !readOnly && (
        <p className="text-[14px] text-text-secondary">
          {required
            ? t(REQUIRED_HINTS[stage], { count: MIN_GARAGE_PHOTOS })
            : t((booking.bookingType === 'pickup' ? PICKUP_HINTS : HINTS)[stage])}
        </p>
      )}
      {/* While the standard is optional (the pilot default), a nudge rather
          than a block: why the photos are worth taking. */}
      {!required && !readOnly && own.length < MIN_GARAGE_PHOTOS && (
        <p className="text-[13px] text-text-secondary">
          {t('Photos protect you if a customer complains, and count toward Gold.')}
        </p>
      )}
      {locked && !readOnly && (
        <p className="text-[13px] text-text-secondary">
          {t('Sent to the customer: these photos stay with the booking.')}
        </p>
      )}
      {readOnly && own.length > 0 && (
        <p className="text-[13px] text-text-secondary">
          {stage === 'before'
            ? t('Closed once the job was completed.')
            : t('Closed an hour after the job was completed.')}
        </p>
      )}

      <ul className="grid grid-cols-2 gap-3">
        {big.map(({ angle, photo }) => {
          const label = t(JOB_PHOTO_ANGLE_LABELS[angle])
          if (photo) {
            return (
              <li key={angle} className="relative">
                <button
                  type="button"
                  onClick={() =>
                    setViewing({
                      photo,
                      name: photoName(angle),
                      own: true,
                    })
                  }
                  aria-label={t('View {photo}', { photo: photoName(angle) })}
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
          if (room <= 0 || locked) return null
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
            const label = t(JOB_PHOTO_ANGLE_LABELS[angle])
            return (
              <li key={angle} className="flex flex-col items-center gap-1">
                <span className="relative">
                  {thumb(photo, photoName(angle), true)}
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
            {thumb(
              photo,
              before
                ? t('extra before photo {n} for {who}', { n: i + 1, who })
                : t('extra after photo {n} for {who}', { n: i + 1, who }),
              true
            )}
            <span className="text-[13px] text-text-secondary">{t('Extra')}</span>
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
                {t('More')}
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
          <p className="text-[13px] text-text-secondary">{t('From {who}', { who })}</p>
          <ul className="flex flex-wrap gap-2">
            {customers.map((photo, i) => (
              <li
                key={photo.id}
                className="flex w-16 flex-col items-center gap-0.5"
              >
                {thumb(
                  photo,
                  before
                    ? t("customer's before photo {n}", { n: i + 1 })
                    : t("customer's after photo {n}", { n: i + 1 }),
                  false
                )}
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
        aria-label={viewing ? capitalise(viewing.name) : t('Job photo')}
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
                  {before
                    ? t(
                        'Remove this before photo? It is your record of the job if the customer questions the work later.'
                      )
                    : t(
                        'Remove this after photo? It is your record of the job if the customer questions the work later.'
                      )}
                </p>
                <div className="flex gap-2">
                  <ScButton
                    variant="outline"
                    size="md"
                    disabled={removingId !== null}
                    onClick={() => setConfirming(false)}
                  >
                    {t('Keep')}
                  </ScButton>
                  <ScButton
                    variant="danger-outline"
                    size="md"
                    disabled={removingId !== null}
                    onClick={() => handleRemove(viewing.photo.id)}
                    aria-label={t('Remove {photo}', { photo: viewing.name })}
                  >
                    {removingId === viewing.photo.id ? t('Removing…') : t('Remove')}
                  </ScButton>
                </div>
              </>
            ) : (
              <div className="flex gap-2">
                <ScButton variant="outline" size="md" onClick={closeViewer}>
                  {t('Close')}
                </ScButton>
                {!readOnly &&
                  viewing.own &&
                  !(locked && isCarCheckAngle(viewing.photo.angle)) && (
                    <ScButton
                      variant="outline"
                      size="md"
                      onClick={() => setConfirming(true)}
                    >
                      {t('Remove photo')}
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
