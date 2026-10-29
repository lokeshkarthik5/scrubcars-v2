'use client'

import Image from 'next/image'
import { IconPlayerPlayFilled } from '@tabler/icons-react'
import {
  cardThumbnail,
  customerMedia,
  formatClipLength,
} from '@repo/core/service-media'
import type { Service } from '@repo/core/types'
import { ServiceIconTile } from './service-icon-tile'

/**
 * A service card's 64px picture: the video's poster with its length, else
 * the garage's first photo, else the service's category icon on its tint.
 * AI pictures never reach a customer (customerMedia; the server leaves them
 * out too). Decorative to a screen reader: the card already names the
 * service, and the details sheet describes its media.
 */
export function ServiceThumb({
  service,
}: {
  service: Pick<Service, 'media' | 'category' | 'name'>
}) {
  const thumb = cardThumbnail(customerMedia(service.media))

  if (thumb === null) {
    return (
      <ServiceIconTile
        service={service}
        className="size-16 rounded-[12px] border border-border"
      />
    )
  }

  return (
    <div
      aria-hidden="true"
      className="relative size-16 shrink-0 overflow-hidden rounded-[12px] border border-border bg-surface-elevated"
    >
      <Image
        src={thumb.url}
        alt=""
        fill
        sizes="64px"
        // Stream sizes its own posters; there is nothing to optimise.
        unoptimized={thumb.kind === 'video'}
        className="object-cover"
      />

      {thumb.kind === 'video' && thumb.durationSecs !== null && (
        <span className="absolute bottom-1 left-1 flex items-center gap-0.5 rounded-[6px] bg-black/75 px-1 py-px text-[11px] font-medium text-white">
          <IconPlayerPlayFilled size={8} />
          <span className="font-numeric">
            {formatClipLength(thumb.durationSecs)}
          </span>
        </span>
      )}
    </div>
  )
}
