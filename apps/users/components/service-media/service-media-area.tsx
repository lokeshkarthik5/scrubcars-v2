'use client'

import { useState } from 'react'
import Image from 'next/image'
import { IconBuildingStore } from '@tabler/icons-react'
import { customerMedia } from '@repo/core/service-media'
import type { Service } from '@repo/core/types'
import { cn } from '@repo/core/utils'
import { PhotoViewer } from './photo-viewer'
import { ServiceVideo } from './service-video'

/**
 * The label over a picture's top-left corner: "From <garage>". Only the
 * garage's own photos and video are ever shown to a customer.
 */
function MediaTag({ garageName }: { garageName: string }) {
  return (
    <span className="flex max-w-full items-center gap-1.5 rounded-[8px] border border-white/10 bg-black/65 px-2.5 py-1 text-[13px] text-white backdrop-blur-sm">
      <IconBuildingStore size={15} stroke={1.6} aria-hidden="true" />
      {/* "From A.J Auto Garage", the name in the stronger weight. */}
      <span className="truncate">
        <span className="text-white/75">From</span>{' '}
        <span className="font-medium">{garageName}</span>
      </span>
    </span>
  )
}

/**
 * The top of a service's details sheet: its video (16:9, poster first, plays
 * on tap) or, without one, its first photo at the same size; then the rest of
 * its photos as thumbnails. Any photo opens full screen. Nothing at all for a
 * service without the garage's own photos or video (AI pictures never count):
 * the sheet then leads with the category icon and what's included instead
 * (ServiceSheetTop), never a drawn or made-up picture.
 */
export function ServiceMediaArea({
  service,
  garageName,
}: {
  service: Pick<Service, 'media' | 'name'>
  garageName: string
}) {
  const [viewing, setViewing] = useState<number | null>(null)
  const media = customerMedia(service.media)
  const video = media.find((item) => item.kind === 'video') ?? null
  const photos = media.filter((item) => item.kind === 'image')

  if (!video && photos.length === 0) return null

  // Without a video, the first photo takes the 16:9 place.
  const hero = video ? null : photos[0]
  const thumbs = video ? photos : photos.slice(1)

  return (
    <div className="flex flex-col gap-1.5">
      {video ? (
        <ServiceVideo
          video={video}
          serviceName={service.name}
          tag={<MediaTag garageName={garageName} />}
        />
      ) : (
        hero && (
          <button
            type="button"
            onClick={() => setViewing(0)}
            aria-label={`Open photo 1 of ${service.name}`}
            className="relative aspect-video w-full overflow-hidden rounded-[14px] border border-border bg-surface-elevated focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-text-primary/70"
          >
            <Image
              src={hero.url}
              alt=""
              fill
              sizes="(max-width: 428px) 100vw, 400px"
              className="object-cover"
            />
            <span className="absolute left-2.5 top-2.5">
              <MediaTag garageName={garageName} />
            </span>
          </button>
        )
      )}

      {thumbs.length > 0 && (
        <div className="grid grid-cols-3 gap-1.5">
          {thumbs.map((photo) => {
            const index = photos.indexOf(photo)
            return (
              <button
                key={photo.id}
                type="button"
                onClick={() => setViewing(index)}
                aria-label={`Open photo ${index + 1} of ${service.name}`}
                className={cn(
                  'relative aspect-[2/1] overflow-hidden rounded-[10px] border border-border bg-surface-elevated',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-text-primary/70'
                )}
              >
                <Image src={photo.url} alt="" fill sizes="(max-width: 428px) 33vw, 130px" className="object-cover" />
              </button>
            )
          })}
        </div>
      )}

      {viewing !== null && (
        <PhotoViewer
          photos={photos}
          startIndex={viewing}
          garageName={garageName}
          serviceName={service.name}
          onClose={() => setViewing(null)}
        />
      )}
    </div>
  )
}
