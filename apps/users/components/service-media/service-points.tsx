'use client'

import { useId, useState } from 'react'
import { IconCheck } from '@tabler/icons-react'
import {
  cardPointsLine,
  parseServiceDescription,
  sheetPoints,
} from '@repo/core/service-points'
import { cn } from '@repo/core/utils'

/**
 * "What's included" in a service's sheet: the description's points, each
 * with a green tick, the first five and then "+N more", a real disclosure
 * button that shows the rest (and "Show less" to fold them again). A note
 * written after the points follows as plain text.
 */
export function WhatsIncluded({
  points,
  note,
}: {
  points: string[]
  note: string | null
}) {
  const [expanded, setExpanded] = useState(false)
  const headingId = useId()
  const listId = useId()
  if (points.length === 0) return null
  const { shown, more } = sheetPoints(points, expanded)
  const foldable = points.length > sheetPoints(points, false).shown.length

  return (
    <section aria-labelledby={headingId} className="mt-3">
      <h3
        id={headingId}
        className="text-[11px] font-semibold uppercase tracking-[0.07em] text-text-muted"
      >
        What&apos;s included
      </h3>
      <ul id={listId} className="mt-1 flex flex-col">
        {shown.map((point, i) => (
          <li
            key={`${i}-${point}`}
            // overflow-wrap: anywhere, so one long unbroken word (a pasted
            // link, say) wraps instead of pushing the sheet wider than a
            // 375px phone.
            className="flex items-start gap-2.5 py-1.5 text-[14px] leading-snug text-text-primary [overflow-wrap:anywhere]"
          >
            <span
              aria-hidden="true"
              className="mt-px flex size-[18px] shrink-0 items-center justify-center rounded-full bg-success-muted"
            >
              <IconCheck size={11} stroke={3} className="text-success" />
            </span>
            {point}
          </li>
        ))}
      </ul>
      {foldable && (
        <button
          type="button"
          aria-expanded={expanded}
          aria-controls={listId}
          onClick={() => setExpanded((open) => !open)}
          className="-ml-1 mt-0.5 flex min-h-11 items-center px-1 text-[13px] font-semibold text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-text-primary/70"
        >
          {expanded ? (
            'Show less'
          ) : (
            // One inline run, so the flex button keeps the space.
            <span>
              <span className="font-numeric">+{more}</span> more
            </span>
          )}
        </button>
      )}
      {note && (
        <p className="mt-2 whitespace-pre-line text-[13px] text-text-secondary [overflow-wrap:anywhere]">
          {note}
        </p>
      )}
    </section>
  )
}

/**
 * A service card's line under its price: the first points joined with " · "
 * and "+N" for the rest ("Foam wash · Vacuum · Dashboard polish +1"); with
 * no points, the description held to two lines, as before.
 */
export function ServiceCardLine({
  description,
  className,
}: {
  description: string | null
  className?: string
}) {
  if (!description) return null
  const line = cardPointsLine(parseServiceDescription(description).points)
  return (
    <p className={cn('[overflow-wrap:anywhere]', className)}>
      {line ? (
        <>
          {line.text}
          {line.more > 0 && (
            <span className="text-text-muted">
              {' '}
              <span className="font-numeric">+{line.more}</span>
            </span>
          )}
        </>
      ) : (
        description
      )}
    </p>
  )
}
