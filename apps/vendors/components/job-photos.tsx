'use client'

import { useState } from 'react'
import { IconCameraPlus, IconLoader2 } from '@tabler/icons-react'
import { toast } from 'react-toastify'
import { ScButton } from '@repo/ui/sc/button'
import { ScModal } from '@repo/ui/sc/modal'
import { deleteJobPhoto, uploadJobPhoto } from '@repo/core/api/job-records'
import { MAX_JOB_PHOTOS_PER_STAGE } from '@repo/core/job-records'
import type { Booking, JobPhoto } from '@repo/core/types'
import { cn } from '@repo/core/utils'
import { resizeForUpload } from '@/lib/resize-image'

const LABELS: Record<JobPhoto['stage'], string> = {
  before: 'Before photos',
  after: 'After photos',
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

const capitalise = (text: string) => text.charAt(0).toUpperCase() + text.slice(1)

interface JobPhotosProps {
  booking: Booking
  stage: JobPhoto['stage']
  /** Re-read the job list once photos change. */
  onChanged: () => void
  /**
   * The record is closed (a week after completion): photos show, but can no
   * longer be added or removed. The server holds the same rule.
   */
  readOnly?: boolean
}

/**
 * One row of a job's photos: thumbnails, and an add button while there is
 * room. Optional — nothing waits on them — but they are the garage's record
 * if a customer later questions the work.
 *
 * So removing one takes deliberate steps: a tap on a thumbnail opens it full
 * size, and Remove lives there, behind "Remove this photo?". A remove button
 * on the thumbnail itself covered half of a 64px photo, and a mechanic
 * tapping to look would delete the evidence as often as not.
 *
 * Phone photos are shrunk to a 1600px JPEG in the browser before upload
 * (lib/resize-image.ts), so a 10 MB camera shot is never refused for size.
 */
export function JobPhotos({ booking, stage, onChanged, readOnly = false }: JobPhotosProps) {
  const [uploading, setUploading] = useState(false)
  const [removingId, setRemovingId] = useState<string | null>(null)
  // The photo open full size, and whether its Remove has been asked to confirm.
  const [viewing, setViewing] = useState<{ photo: JobPhoto; name: string } | null>(null)
  const [confirming, setConfirming] = useState(false)
  const photos = booking.jobPhotos.filter((photo) => photo.stage === stage)
  const room = readOnly ? 0 : MAX_JOB_PHOTOS_PER_STAGE - photos.length
  const who = booking.customerName ?? 'this customer'
  const stageWord = stage === 'before' ? 'before' : 'after'

  const handleFiles = async (input: HTMLInputElement) => {
    const files = Array.from(input.files ?? []).slice(0, Math.max(0, room))
    input.value = ''
    if (files.length === 0) return

    setUploading(true)
    try {
      for (const file of files) {
        try {
          const prepared = await resizeForUpload(file)
          await uploadJobPhoto(booking.id, stage, prepared)
        } catch (error) {
          toast.error(error instanceof Error ? error.message : 'Upload failed')
        }
      }
    } finally {
      setUploading(false)
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
      toast.error(error instanceof Error ? error.message : 'Could not remove this photo')
    } finally {
      setRemovingId(null)
    }
  }

  if (readOnly && photos.length === 0) return null

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-[12px] font-medium text-text-primary">{LABELS[stage]}</p>
        <p className="font-numeric text-[11px] text-text-muted">
          {photos.length}/{MAX_JOB_PHOTOS_PER_STAGE}
        </p>
      </div>
      {photos.length === 0 && (
        <p className="text-[11px] text-text-secondary">
          {(booking.bookingType === 'pickup' ? PICKUP_HINTS : HINTS)[stage]}
        </p>
      )}
      {readOnly && (
        <p className="text-[11px] text-text-muted">Closed a week after the job was completed.</p>
      )}

      <ul className="flex flex-wrap gap-2">
        {photos.map((photo, i) => {
          const name = `${stageWord} photo ${i + 1} for ${who}`
          return (
            <li key={photo.id}>
              <button
                type="button"
                onClick={() => setViewing({ photo, name })}
                aria-label={`View ${name}`}
                className="block size-16 overflow-hidden rounded-[10px] bg-surface ring-1 ring-inset ring-border"
              >
                {/* A plain <img>: the photo is already sized for the screen,
                    and the optimiser would only fetch it again. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={photo.url} alt="" className="h-full w-full object-cover" />
              </button>
            </li>
          )
        })}

        {room > 0 && (
          <li>
            {/* The input sits inside its label, so the whole tile opens the
                camera or the gallery and the input carries the name. */}
            <label
              className={cn(
                'flex size-16 cursor-pointer items-center justify-center rounded-[10px] border border-dashed border-border text-text-secondary transition-colors hover:border-text-secondary',
                uploading && 'pointer-events-none opacity-60'
              )}
            >
              <input
                type="file"
                accept="image/*"
                multiple
                className="sr-only"
                aria-label={`Add ${stageWord} photos for ${who}`}
                disabled={uploading}
                onChange={(event) => handleFiles(event.currentTarget)}
              />
              {uploading ? (
                <IconLoader2 size={18} className="animate-spin" aria-hidden />
              ) : (
                <IconCameraPlus size={18} aria-hidden />
              )}
            </label>
          </li>
        )}
      </ul>

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
                <p className="text-[13px] text-text-primary">
                  Remove this {stageWord} photo? It is your record of the job if the customer
                  questions the work later.
                </p>
                <div className="flex gap-2">
                  <ScButton
                    variant="secondary"
                    disabled={removingId !== null}
                    onClick={() => setConfirming(false)}
                    className="min-h-11"
                  >
                    Keep
                  </ScButton>
                  <ScButton
                    variant="secondary"
                    disabled={removingId !== null}
                    onClick={() => handleRemove(viewing.photo.id)}
                    aria-label={`Remove ${viewing.name}`}
                    className="min-h-11 text-error"
                  >
                    {removingId === viewing.photo.id ? 'Removing…' : 'Remove'}
                  </ScButton>
                </div>
              </>
            ) : (
              <div className="flex gap-2">
                <ScButton variant="secondary" onClick={closeViewer} className="min-h-11">
                  Close
                </ScButton>
                {!readOnly && (
                  <ScButton
                    variant="secondary"
                    onClick={() => setConfirming(true)}
                    className="min-h-11"
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
