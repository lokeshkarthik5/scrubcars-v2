'use client'

import Link from 'next/link'
import { useCollectionLists } from '@repo/core/api/hooks/use-admin-collection'
import { cn } from '@repo/core/utils'
import {
  collectorCards,
  dueDate,
  listHref,
  plural,
  progressPercent,
} from '@/lib/collection'

/**
 * The Garages page's "With team" view, on top: one card per teammate with
 * open collection lists ("Raga · 4 garages · Due Thu 29 Oct · 3 of 11"),
 * and Open list. Nothing while loading, with no open lists, or from an API
 * older than collection lists.
 */
export function CollectorProgressCards({ className }: { className?: string }) {
  const { data } = useCollectionLists('all')
  const cards = collectorCards(data?.lists ?? [])
  if (cards.length === 0) return null
  return (
    <section
      aria-label="With the team"
      className={cn(
        'grid grid-cols-1 gap-2 md:grid-cols-2 md:gap-3',
        className
      )}
    >
      {cards.map((card) => {
        const percent = progressPercent(card)
        const initial = card.name.trim().charAt(0).toUpperCase() || '?'
        return (
          <article
            key={card.key}
            aria-label={`${card.name}, ${plural(card.garages, 'garage')}`}
            className="flex flex-col gap-2 rounded-[12px] border border-border bg-surface p-3 md:p-4"
          >
            <div className="flex items-start gap-3">
              <span
                aria-hidden="true"
                className="flex size-8 shrink-0 items-center justify-center rounded-full bg-tone-progress-tint text-[13px] font-semibold text-tone-progress-text"
              >
                {initial}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[14px] font-semibold text-text-primary">
                  {card.name} · {plural(card.garages, 'garage')}
                </p>
                <p className="text-[12px] text-text-secondary">
                  {card.lists > 1 ? `${card.lists} lists · ` : ''}
                  {card.dueOn ? `Due ${dueDate(card.dueOn)}` : 'No due date'}
                </p>
              </div>
              <Link
                href={listHref(card.listId)}
                aria-label={`Open ${card.name}’s list`}
                className="inline-flex min-h-8 shrink-0 items-center rounded-[8px] border border-border px-2.5 text-[12px] font-medium text-text-primary transition-colors hover:bg-surface-elevated"
              >
                Open list
              </Link>
            </div>
            <div className="flex items-center gap-3">
              <div
                role="progressbar"
                aria-label={`${card.name}’s progress`}
                aria-valuemin={0}
                aria-valuemax={card.total}
                aria-valuenow={card.done}
                className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-elevated"
              >
                <div
                  className="h-full rounded-full bg-tone-done-dot transition-[width] duration-300 motion-reduce:transition-none"
                  style={{ width: `${percent}%` }}
                />
              </div>
              <span className="shrink-0 font-numeric text-[12px] text-text-secondary">
                {card.done} of {card.total}
              </span>
            </div>
          </article>
        )
      })}
    </section>
  )
}
