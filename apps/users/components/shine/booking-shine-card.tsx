'use client'

import { toast } from 'react-toastify'
import { IconChevronRight, IconShare2 } from '@tabler/icons-react'
import { shineOn, useBookingShine, useShineConfig } from '@repo/core/api/hooks/use-shine-score'
import { SHINE_AREA_LABELS, jobPhotoForArea } from '@repo/core/shine-score'
import type { JobPhoto } from '@repo/core/types'
import { useT } from '@repo/core/i18n'
import { ScCard } from '@/components/ui/card'
import { shareShineScore } from '@/lib/shine-share'

/**
 * "Your Shine went 46 → 92" (0078): on the customer's booking page once the
 * job is done, scored from the garage's own before and after job photos of
 * the same areas. Nothing while Shine Score is off, while it is being scored,
 * or when the two sets share fewer than two areas (the server says `none`).
 */
export function BookingShineCard({
  bookingId,
  completed,
  photos,
}: {
  bookingId: string
  completed: boolean
  photos: JobPhoto[]
}) {
  const t = useT()
  const config = useShineConfig(completed)
  const on = shineOn(config.data) && completed
  const shine = useBookingShine(bookingId, on)
  const data = shine.data
  if (!on || data?.state !== 'scored') return null

  const area = data.biggestChange ?? data.areas[0]?.area ?? null
  const before = area ? jobPhotoForArea(photos, area, 'before') : null
  const after = area ? jobPhotoForArea(photos, area, 'after') : null

  const share = async () => {
    const outcome = await shareShineScore({ before: data.before, after: data.after })
    if (outcome === 'copied') toast.success(t('Copied. Paste it anywhere to share.'))
    if (outcome === 'failed') toast.error(t("Couldn't share right now."))
  }

  return (
    <ScCard className="flex flex-col gap-3 px-5" aria-labelledby="booking-shine">
      <h2 id="booking-shine" className="text-t5 text-text-secondary">
        {t('Shine Score, from the garage’s photos')}
      </h2>
      <p className="flex items-center gap-2" aria-hidden>
        <span className="font-numeric text-[40px] leading-[0.9] font-medium tracking-[-0.045em] text-text-muted">
          {data.before}
        </span>
        <IconChevronRight size={18} stroke={1.6} className="text-text-muted" />
        <span className="font-numeric text-[40px] leading-[0.9] font-medium tracking-[-0.045em] text-text-primary">
          {data.after}
        </span>
      </p>
      <p className="text-t3 leading-snug text-text-secondary">
        <b className="font-medium text-text-primary">
          {t('Your Shine went {before} → {after}.', { before: data.before, after: data.after })}
        </b>
        {data.biggestChange && (
          <> {t('Biggest change: {area}.', { area: t(SHINE_AREA_LABELS[data.biggestChange]).toLowerCase() })}</>
        )}
      </p>
      {before && after && (
        <div className="grid grid-cols-2 gap-2">
          {[
            { photo: before, label: t('Before · {score}', { score: data.before }) },
            { photo: after, label: t('After · {score}', { score: data.after }) },
          ].map(({ photo, label }) => (
            <figure key={photo.id} className="relative aspect-[4/3] overflow-hidden rounded-[12px] bg-surface">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={photo.url} alt="" className="size-full object-cover" />
              <figcaption className="absolute bottom-1.5 left-1.5 rounded-full bg-black/60 px-2 py-0.5 font-numeric text-t5 font-medium text-white">
                {label}
              </figcaption>
            </figure>
          ))}
        </div>
      )}
      <div className="flex items-center justify-between gap-3">
        <p className="text-t5 text-text-muted">{t('Scored from the before & after job photos.')}</p>
        <button
          type="button"
          onClick={() => void share()}
          className="-mr-2 flex min-h-11 items-center gap-1.5 px-2 text-t4 font-medium text-text-primary"
        >
          <IconShare2 size={16} stroke={1.5} aria-hidden />
          {t('Share')}
        </button>
      </div>
    </ScCard>
  )
}
