'use client'

import { useState } from 'react'
import { ScButton } from '@repo/ui/sc/button'
import { ScCard } from '@/components/ui/card'
import { ScModal } from '@repo/ui/sc/modal'
import { BeforeAfterCompare } from '@repo/ui/features/before-after'
import type { JobPhoto } from '@repo/core/types'
import { msg, useT } from '@repo/core/i18n'

const STAGES: Array<{ stage: JobPhoto['stage']; label: string }> = [
  { stage: 'before', label: msg('Before') },
  { stage: 'after', label: msg('After') },
]

/**
 * The garage's photos of the job: the car as it came in, and the work as it
 * was handed back. Shown once the work has started — the server leaves them
 * out before then — so the customer sees what the garage recorded, the same
 * record either side can point to if something is questioned later. Once
 * the job is done, a before/after slider of the angles photographed both
 * times leads the card (0045); the customer's own photos are in "Your car's
 * condition", not here.
 *
 * Thumbnails open full size. Plain <img> on purpose: the photos are already
 * sized by the garage's phone before upload, and the image optimiser would
 * only fetch them again.
 */
export function JobPhotosCard({
  photos: all,
  completed = false,
}: {
  photos: JobPhoto[]
  completed?: boolean
}) {
  const t = useT()
  const [open, setOpen] = useState<{ photo: JobPhoto; label: string } | null>(
    null
  )
  const photos = all.filter((photo) => photo.by === 'garage')

  if (photos.length === 0) return null

  return (
    // #job-photos: a car's history links straight to them.
    <ScCard id="job-photos" className="flex scroll-mt-4 flex-col gap-3">
      <h2 className="text-sm font-semibold text-text-primary">{t('Job photos')}</h2>
      {completed && <BeforeAfterCompare photos={all} />}
      {STAGES.map(({ stage, label: english }) => {
        const label = t(english)
        const ofStage = photos.filter((photo) => photo.stage === stage)
        if (ofStage.length === 0) return null
        return (
          <div key={stage} className="flex flex-col gap-1.5">
            <p className="text-t5 font-medium uppercase tracking-wide text-text-secondary">
              {label}
            </p>
            <ul className="flex flex-wrap gap-2">
              {ofStage.map((photo, i) => {
                const name = t('{label} photo {number} of {total}', { label, number: i + 1, total: ofStage.length })
                return (
                  <li key={photo.id}>
                    <button
                      type="button"
                      onClick={() => setOpen({ photo, label: name })}
                      aria-label={t('View {name}', { name: name.toLowerCase() })}
                      className="block size-16 overflow-hidden rounded-[10px] bg-surface ring-1 ring-inset ring-border"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={photo.url}
                        alt=""
                        className="h-full w-full object-cover"
                      />
                    </button>
                  </li>
                )
              })}
            </ul>
          </div>
        )
      })}

      <ScModal
        open={open !== null}
        onClose={() => setOpen(null)}
        aria-label={open?.label ?? t('Job photo')}
        className="max-w-[420px] px-3"
      >
        {open && (
          <div className="flex flex-col gap-3">
            <p className="text-t4 font-medium text-text-primary">
              {open.label}
            </p>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={open.photo.url}
              alt={open.label}
              className="max-h-[60vh] w-full rounded-[12px] object-contain"
            />
            <ScButton
              variant="secondary"
              onClick={() => setOpen(null)}
              className="min-h-11"
            >
              {t('Close')}
            </ScButton>
          </div>
        )}
      </ScModal>
    </ScCard>
  )
}
