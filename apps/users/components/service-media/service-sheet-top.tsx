'use client'

import { IconClock } from '@tabler/icons-react'
import { ScBadge } from '@repo/ui/sc/badge'
import { categoryLabel } from '@repo/core/categories'
import { customerMedia } from '@repo/core/service-media'
import { parseServiceDescription } from '@repo/core/service-points'
import type { Service } from '@repo/core/types'
import { formatDuration } from '@repo/core/utils'
import { ClampedText } from './clamped-text'
import { ServiceIconTile } from './service-icon-tile'
import { ServiceMediaArea } from './service-media-area'
import { WhatsIncluded } from './service-points'

/**
 * The top of a service's (or package's) details sheet, down to what it
 * includes. With the garage's own photos or video: the media first, as in
 * the approved design, then the name and its chips. Without: no picture area
 * at all (no-photo look, mockup D); the category icon sits beside the name,
 * so the sheet is shorter and leads with what the customer gets.
 *
 * Then the description: its intro, and its "- " points as "What's
 * included" with ticks. A description with no points reads exactly as it
 * always has. Keyed by the caller on the service, so "More" and "+N more"
 * fold again for the next one.
 */
export function ServiceSheetTop({
  service,
  garageName,
  isPackage,
}: {
  service: Pick<
    Service,
    'media' | 'category' | 'name' | 'description' | 'durationMins'
  >
  garageName: string
  isPackage: boolean
}) {
  const hasMedia = customerMedia(service.media).length > 0
  const { intro, points, note } = parseServiceDescription(service.description)

  const chips = (
    <div className="flex flex-wrap items-center gap-2">
      <ScBadge variant="muted">{categoryLabel(service.category)}</ScBadge>
      {/* "Duration not set" (0064) shows nothing to customers. */}
      {service.durationMins != null && (
        <span className="flex items-center gap-1.5 text-[11px] text-text-secondary">
          <IconClock size={12} />
          <span className="font-numeric font-medium">
            {formatDuration(service.durationMins)}
          </span>
        </span>
      )}
    </div>
  )

  return (
    <>
      {hasMedia ? (
        <>
          <ServiceMediaArea service={service} garageName={garageName} />
          <h2 className="mt-4 text-[17px] font-semibold text-text-primary">
            {service.name}
          </h2>
          <div className="mt-2">{chips}</div>
        </>
      ) : (
        <div className="flex items-center gap-3 pt-1">
          <ServiceIconTile service={service} size="sheet" />
          <div className="min-w-0 flex-1">
            <h2 className="text-[19px] font-semibold leading-tight tracking-[-0.02em] text-text-primary">
              {service.name}
            </h2>
            <div className="mt-1.5">{chips}</div>
          </div>
        </div>
      )}

      {points.length === 0 ? (
        // No points: the description as it has always read.
        <ClampedText
          className="mt-3 text-[13px] text-text-secondary"
          text={
            service.description ||
            (isPackage
              ? 'No description available for this package.'
              : 'No description available for this service.')
          }
        />
      ) : (
        intro && (
          <ClampedText
            className="mt-3 text-[13px] text-text-secondary"
            text={intro}
          />
        )
      )}

      <WhatsIncluded points={points} note={note} />
    </>
  )
}
