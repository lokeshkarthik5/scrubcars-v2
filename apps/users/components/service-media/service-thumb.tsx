'use client'

import Image from 'next/image'
import { IconPlayerPlayFilled } from '@tabler/icons-react'
import { ServiceSampleArt } from '@repo/ui/features/service-sample-art'
import {
  cardThumbnail,
  formatClipLength,
  sampleArtFor,
} from '@repo/core/service-media'
import type { Service } from '@repo/core/types'

/**
 * A service card's 64px picture: the video's poster with its length, else
 * the first photo, else the drawn category art. An AI picture says "Sample"
 * on it, so a customer never takes it for this garage's work. Decorative to a screen reader: the card
 * already names the service, and the details sheet describes its media.
 */
export function ServiceThumb({
  service,
}: {
  service: Pick<Service, 'media' | 'category' | 'name'>
}) {
  const thumb = cardThumbnail(service.media)

  return (
    <div
      aria-hidden="true"
      className="relative size-16 shrink-0 overflow-hidden rounded-[12px] border border-border bg-surface-elevated"
    >
      {thumb === null ? (
        <ServiceSampleArt
          art={sampleArtFor(service.category, service.name)}
          square
          className="size-full"
        />
      ) : (
        <Image
          src={thumb.url}
          alt=""
          fill
          sizes="64px"
          // Stream sizes its own posters; there is nothing to optimise.
          unoptimized={thumb.kind === 'video'}
          className="object-cover"
        />
      )}

      {thumb?.kind === 'video' && thumb.durationSecs !== null && (
        <span className="absolute bottom-1 left-1 flex items-center gap-0.5 rounded-[6px] bg-black/75 px-1 py-px text-[11px] font-medium text-white">
          <IconPlayerPlayFilled size={8} />
          <span className="font-numeric">
            {formatClipLength(thumb.durationSecs)}
          </span>
        </span>
      )}
      {/* An AI picture says "Sample", so it is never taken for this
          garage's work. The drawn category art needs no badge (F14): it is
          plainly a drawing. */}
      {thumb?.kind === 'photo' && thumb.sample && (
        <span className="absolute bottom-1 left-1 rounded-[6px] bg-black/75 px-1 py-px text-[11px] font-medium text-white">
          Sample
        </span>
      )}
    </div>
  )
}
