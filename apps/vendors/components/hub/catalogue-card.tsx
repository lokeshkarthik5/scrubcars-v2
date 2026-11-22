'use client'

import { IconChevronLeft, IconChevronRight, IconPlayerPlayFilled, IconPlus } from '@tabler/icons-react'
import { useT } from '@repo/core/i18n'
import type { ServiceMedia } from '@repo/core/types'
import { Figures } from '@repo/ui/sc/figures'
import { cn } from '@repo/core/utils'
import { HubTag } from './parts'

/** How many thumbnails a card shows before the rest are left to its edit view. */
const THUMBS = 3

/**
 * A service or package on Services (mockup garage-hub 3): its photos on top
 * (or a dashed box saying none yet), Active or Off, the name and description,
 * the price large and light, and the minutes. The whole card is one button
 * that opens its edit view, where the photo-and-video block and Disable and
 * Delete now live.
 */
export function CatalogueCard({
  name,
  description,
  priceText,
  note,
  minutes,
  active,
  media,
  onOpen,
  children,
}: {
  name: string
  description: string | null
  /** formatServicePrice's words: "₹499", "From ₹399", "~₹15,000". */
  priceText: string
  /** A quiet line under the price (an inspection's approx price). */
  note?: string | null
  minutes: number | null
  active: boolean
  media: ServiceMedia[]
  onOpen: () => void
  /** Extra quiet lines (a package's services and savings). */
  children?: React.ReactNode
}) {
  const t = useT()
  const shown = media.slice(0, THUMBS)
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={t('Edit {name}', { name })}
      className="hub-card press flex w-full min-w-0 flex-col px-5 pt-4 pb-[18px] text-left"
    >
      <span className="flex items-start justify-between gap-3">
        <span aria-hidden className="flex min-w-0 gap-1.5">
          {shown.length > 0 ? (
            shown.map((item) => (
              <span key={item.id} className="relative block h-11 w-[58px] shrink-0 overflow-hidden rounded-[12px] bg-white/[0.06]">
                {(item.kind === 'image' ? item.url : item.posterUrl) && (
                  // eslint-disable-next-line @next/next/no-img-element -- R2 and Stream URLs at many sizes
                  <img
                    src={(item.kind === 'image' ? item.url : item.posterUrl) as string}
                    alt=""
                    loading="lazy"
                    className="size-full object-cover"
                  />
                )}
                {item.kind === 'video' && (
                  <span className="absolute inset-0 grid place-items-center bg-black/25 text-white">
                    <IconPlayerPlayFilled size={14} />
                  </span>
                )}
              </span>
            ))
          ) : (
            <span className="grid h-11 w-[58px] place-items-center rounded-[12px] border border-dashed border-white/25 text-dim">
              <IconPlus size={16} stroke={1.6} />
            </span>
          )}
          {media.length > THUMBS && (
            <span className="grid h-11 place-items-center px-1 font-numeric text-t5 text-dim">+{media.length - THUMBS}</span>
          )}
        </span>
        <HubTag tone={active ? 'green' : 'neutral'}>{active ? t('Active') : t('Off')}</HubTag>
      </span>
      <span className="mt-3 block min-w-0 text-[18px] leading-snug break-words text-text-primary">{name}</span>
      {description && <span className="mt-0.5 line-clamp-2 text-t4 text-dim">{description}</span>}
      {children}
      <span className="mt-2.5 flex min-w-0 items-baseline gap-2">
        <span className="min-w-0 font-numeric text-[26px] leading-none font-light tracking-[-0.02em] break-words text-text-primary">
          <Figures text={priceText} />
        </span>
        {minutes != null && (
          <span className="shrink-0 font-numeric text-t4 text-dim">
            {minutes} min
          </span>
        )}
        <IconChevronRight size={16} aria-hidden className="ml-auto shrink-0 self-center text-text-muted" />
      </span>
      {note && (
        <span className="mt-1 block text-t5 text-dim">
          <Figures text={note} />
        </span>
      )}
    </button>
  )
}

/**
 * The top of a service's or package's edit view: Back to the list (named as
 * the form's Cancel edit was, so it is found as it was) and the title.
 */
export function EditHeader({ title, onBack, backLabel }: { title: string; onBack: () => void; backLabel: string }) {
  return (
    <div className="flex items-center gap-2.5">
      <button
        type="button"
        onClick={onBack}
        aria-label={backLabel}
        className="press grid size-10 shrink-0 place-items-center rounded-full border border-line bg-white/[0.04] text-text-primary"
      >
        <IconChevronLeft size={20} aria-hidden />
      </button>
      <h2 className={cn('min-w-0 flex-1 text-[20px] font-semibold tracking-[-0.01em] text-text-primary')}>{title}</h2>
    </div>
  )
}
