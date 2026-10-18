'use client'

import { useState } from 'react'
import { IconCamera, IconLoader2 } from '@tabler/icons-react'
import { toast } from 'react-toastify'
import { ScButton } from '@repo/ui/sc/button'
import { ScCard } from '@repo/ui/sc/card'
import { ScModal } from '@repo/ui/sc/modal'
import { deleteMyCarPhoto, uploadMyCarPhoto } from '@repo/core/api/job-records'
import {
  PHOTO_ANGLE_LABELS,
  angleLabel,
  angleSlots,
  extraPhotos,
  photosOf,
  type PhotoAngle,
} from '@repo/core/job-photo-standards'
import { formatStepTime } from '@repo/core/job-records'
import type { Booking, JobPhoto } from '@repo/core/types'
import { cn } from '@repo/core/utils'

const STAGE_WORD: Record<JobPhoto['stage'], string> = { before: 'before', after: 'after' }

/**
 * "Your car's condition" (0045): the customer's own photos of their car, on
 * the booking page. Optional and encouraged: before photos from booking
 * until the work starts (pickup & drop: until the car is collected), after
 * photos for 24 hours after the job is done, up to four of each, from the
 * same guided angles the garage uses. They stay with the booking, the
 * garage sees them too, and they are what Detlio looks at with the garage's
 * own photos if something is questioned.
 *
 * Each photo is re-encoded in the browser before upload, which drops its
 * location and camera details (uploadMyCarPhoto → stripImageMetadata).
 * Nothing renders when neither stage is open and none were added.
 */
export function CarConditionCard({
  booking,
  onChanged,
}: {
  booking: Booking
  /** Re-read the booking once a photo is added or removed. */
  onChanged: () => Promise<void> | void
}) {
  const windows = booking.conditionPhotos
  const [uploading, setUploading] = useState<string | null>(null)
  const [viewing, setViewing] = useState<{ photo: JobPhoto; name: string; canRemove: boolean } | null>(null)
  const [removing, setRemoving] = useState(false)

  if (!windows) return null
  const stages = (['before', 'after'] as const).filter(
    (stage) => windows[stage].open || photosOf(booking.jobPhotos, 'customer', stage).length > 0
  )
  if (stages.length === 0) return null

  const upload = async (stage: JobPhoto['stage'], file: File | undefined, angle: PhotoAngle | undefined) => {
    if (!file) return
    setUploading(`${stage}:${angle ?? 'extra'}`)
    try {
      await uploadMyCarPhoto(booking.id, stage, file, angle)
      await onChanged()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Your photo did not upload. Please try again.')
    } finally {
      setUploading(null)
    }
  }

  const remove = async (photo: JobPhoto) => {
    setRemoving(true)
    try {
      await deleteMyCarPhoto(booking.id, photo.id)
      setViewing(null)
      await onChanged()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't remove this photo")
    } finally {
      setRemoving(false)
    }
  }

  const intro = windows.before.open
    ? `Optional: add up to ${windows.max} photos of your car before the work starts, close up on any scratches or dents. The garage sees them too, and they stay with this booking.`
    : windows.after.open
      ? `Your car is done. Add up to ${windows.max} photos of how it came back${
          windows.after.closesAt ? `, until ${formatStepTime(windows.after.closesAt)}` : ''
        }.`
      : 'Your photos of your car, kept with this booking.'

  return (
    <ScCard className="flex flex-col gap-3">
      <div>
        <h2 className="text-sm font-semibold text-text-primary">Your car&apos;s condition</h2>
        <p className="mt-0.5 text-[12px] text-text-secondary">{intro}</p>
      </div>

      {stages.map((stage) => {
        const open = windows[stage].open
        const mine = photosOf(booking.jobPhotos, 'customer', stage)
        const room = open ? windows.max - mine.length : 0
        const slots = angleSlots(booking.jobPhotos, 'customer', stage)
        const extras = extraPhotos(booking.jobPhotos, 'customer', stage)
        const word = STAGE_WORD[stage]
        const thumb = (photo: JobPhoto, name: string) => (
          <button
            type="button"
            onClick={() => setViewing({ photo, name, canRemove: open })}
            aria-label={`View ${name}`}
            className="block size-16 overflow-hidden rounded-[10px] bg-surface ring-1 ring-inset ring-border"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={photo.url} alt="" className="h-full w-full object-cover" />
          </button>
        )

        return (
          <div key={stage} className="flex flex-col gap-1.5">
            <div className="flex items-baseline justify-between gap-2">
              <p className="text-[11px] font-medium uppercase tracking-wide text-text-secondary">
                {stage === 'before' ? 'Before the work' : 'After the work'}
              </p>
              <p className="font-numeric text-[11px] text-text-muted">
                {mine.length}/{windows.max}
              </p>
            </div>
            <ul className="flex flex-wrap gap-2">
              {slots.map(({ angle, photo }) => {
                const label = PHOTO_ANGLE_LABELS[angle]
                if (photo) {
                  return (
                    <li key={angle} className="flex w-16 flex-col items-center gap-0.5">
                      {thumb(photo, `your ${label.toLowerCase()} photo, ${word} the work`)}
                      <span className="text-[10px] text-text-secondary">{label}</span>
                    </li>
                  )
                }
                if (room <= 0) return null
                const key = `${stage}:${angle}`
                return (
                  <li key={angle} className="flex w-16 flex-col items-center gap-0.5">
                    {/* The input inside its label: the whole tile opens the
                        camera (the back one, on a phone). */}
                    <label
                      className={cn(
                        'flex size-16 cursor-pointer items-center justify-center rounded-[10px] border border-dashed border-border text-text-secondary transition-colors hover:border-text-secondary',
                        uploading !== null && 'pointer-events-none opacity-60'
                      )}
                    >
                      <input
                        type="file"
                        accept="image/*"
                        capture="environment"
                        className="sr-only"
                        aria-label={`Add a ${label.toLowerCase()} photo of your car, ${word} the work`}
                        disabled={uploading !== null}
                        onChange={(event) => {
                          const file = event.currentTarget.files?.[0]
                          event.currentTarget.value = ''
                          void upload(stage, file, angle)
                        }}
                      />
                      {uploading === key ? (
                        <IconLoader2 size={18} className="animate-spin" aria-hidden />
                      ) : (
                        <IconCamera size={18} aria-hidden />
                      )}
                    </label>
                    <span className="text-[10px] text-text-muted">{label}</span>
                  </li>
                )
              })}
              {extras.map((photo, i) => (
                <li key={photo.id} className="flex w-16 flex-col items-center gap-0.5">
                  {thumb(photo, `your extra photo ${i + 1}, ${word} the work`)}
                  <span className="text-[10px] text-text-secondary">{angleLabel(photo.angle)}</span>
                </li>
              ))}
            </ul>
          </div>
        )
      })}

      <ScModal
        open={viewing !== null}
        onClose={() => setViewing(null)}
        dismissible={!removing}
        aria-label={viewing ? `Your photo: ${viewing.name}` : 'Your photo'}
        className="max-w-[420px] px-3"
      >
        {viewing && (
          <div className="flex flex-col gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={viewing.photo.url}
              alt={viewing.name}
              className="max-h-[60vh] w-full rounded-[12px] object-contain"
            />
            <div className="flex gap-2">
              <ScButton variant="secondary" onClick={() => setViewing(null)} className="min-h-11">
                Close
              </ScButton>
              {viewing.canRemove && (
                <ScButton
                  variant="secondary"
                  disabled={removing}
                  onClick={() => remove(viewing.photo)}
                  className="min-h-11"
                >
                  {removing ? 'Removing…' : 'Remove'}
                </ScButton>
              )}
            </div>
          </div>
        )}
      </ScModal>
    </ScCard>
  )
}
