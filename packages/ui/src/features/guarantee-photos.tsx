'use client'

import { useState } from 'react'
import { IconX } from '@tabler/icons-react'
import { angleLabel } from '@repo/core/job-photo-standards'
import type { JobPhoto } from '@repo/core/types'
import { cn } from '@repo/core/utils'
import { BeforeAfterCompare } from '@repo/ui/features/before-after'

/** A photo the customer took of the problem (Detlio Guarantee, 0051). */
export interface ClaimPhotoView {
  id: string
  url: string
}

function Thumb({ url, label, onOpen }: { url: string; label: string; onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={`View ${label}`}
      className="block size-20 shrink-0 overflow-hidden rounded-[10px] bg-surface ring-1 ring-inset ring-border"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={url} alt="" className="h-full w-full object-cover" />
    </button>
  )
}

/**
 * What Detlio compares on a free redo claim: the customer's photos of the
 * problem beside the garage's own before and after photos of the job. One
 * component for the customer's claim screen, the garage's claims list and
 * admin's claim page, so all three see the same evidence the same way.
 * Plain <img>, like the before/after slider: the photos are already sized
 * for upload.
 */
export function GuaranteeEvidence({
  customerPhotos,
  garagePhotos,
  className,
  customerTitle = "Customer's photos of the problem",
  garageTitle = "Garage's before and after photos",
}: {
  customerPhotos?: readonly ClaimPhotoView[]
  garagePhotos: readonly JobPhoto[]
  className?: string
  customerTitle?: string
  garageTitle?: string
}) {
  const [open, setOpen] = useState<{ url: string; label: string } | null>(null)
  const garage = garagePhotos.filter((photo) => photo.by === 'garage')
  const stageOf = (stage: JobPhoto['stage']) => garage.filter((photo) => photo.stage === stage)

  return (
    <div className={cn('flex flex-col gap-3', className)}>
      {customerPhotos && (
        <section aria-label={customerTitle} className="flex flex-col gap-1.5">
          <p className="text-[11px] font-medium uppercase tracking-wide text-text-secondary">{customerTitle}</p>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {customerPhotos.map((photo, index) => (
              <Thumb
                key={photo.id}
                url={photo.url}
                label={`problem photo ${index + 1}`}
                onOpen={() => setOpen({ url: photo.url, label: `Problem photo ${index + 1}` })}
              />
            ))}
          </div>
        </section>
      )}

      <section aria-label={garageTitle} className="flex flex-col gap-1.5">
        <p className="text-[11px] font-medium uppercase tracking-wide text-text-secondary">{garageTitle}</p>
        {garage.length === 0 ? (
          <p className="text-[12px] text-text-secondary">The garage took no photos of this job.</p>
        ) : (
          <>
            <BeforeAfterCompare photos={garage} title="Compare before and after" />
            {(['before', 'after'] as const).map((stage) =>
              stageOf(stage).length > 0 ? (
                <div key={stage} className="flex flex-col gap-1">
                  <p className="text-[11px] text-text-secondary">{stage === 'before' ? 'Before' : 'After'}</p>
                  <div className="flex gap-2 overflow-x-auto pb-1">
                    {stageOf(stage).map((photo) => {
                      const label = `${stage} — ${angleLabel(photo.angle)}`
                      return <Thumb key={photo.id} url={photo.url} label={label} onOpen={() => setOpen({ url: photo.url, label })} />
                    })}
                  </div>
                </div>
              ) : (
                <p key={stage} className="text-[12px] text-text-secondary">
                  No {stage} photos from the garage.
                </p>
              )
            )}
          </>
        )}
      </section>

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={open.label}
          className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-3 bg-black/90 p-4"
          onClick={() => setOpen(null)}
        >
          <button
            type="button"
            onClick={() => setOpen(null)}
            aria-label="Close photo"
            className="absolute right-4 top-4 flex size-11 items-center justify-center rounded-full bg-surface text-text-primary"
          >
            <IconX size={20} aria-hidden />
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={open.url} alt={open.label} className="max-h-[80dvh] max-w-full rounded-[12px] object-contain" />
          <p className="text-[13px] text-text-secondary">{open.label}</p>
        </div>
      )}
    </div>
  )
}
