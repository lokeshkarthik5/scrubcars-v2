'use client'

import Link from 'next/link'
import {
  IconArrowLeft,
  IconArrowUpRight,
  IconChevronRight,
} from '@tabler/icons-react'
import { customerGarageUrl } from '@/lib/garage-edit'
import { STAGE_LABELS, displayPhone } from '@/lib/garage-status'
import { garageAreaName } from '@/lib/localities'
import type { GarageDraft } from './use-garage-draft'

/** "Velachery Car Care" → "VC". */
function initials(name: string): string {
  const letters = name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase() ?? '')
  return letters.join('') || 'G'
}

/**
 * The editor's header, across both columns (mockup 05): where you are
 * ("Garages › Velachery Car Care") with View as customer beside it, then the
 * garage itself: its initials, its name on one line, and "Owner Murugan
 * Rajendran · 98400 02102 · Velachery · Pending". As saved, not as drafted.
 */
export function EditorHeader({
  vendorId,
  backHref,
  saved,
}: {
  vendorId: string
  backHref: string
  saved: GarageDraft
}) {
  const name = saved.form.businessName || 'Edit garage'
  const area = garageAreaName({
    city: saved.form.city,
    lat: saved.pin?.lat ?? null,
    lng: saved.pin?.lng ?? null,
  })
  const subtitle: Array<{ text: string; numeric?: boolean }> = [
    saved.form.ownerName && { text: `Owner ${saved.form.ownerName}` },
    saved.form.ownerPhone && {
      text: displayPhone(saved.form.ownerPhone),
      numeric: true,
    },
    area && { text: area },
    { text: STAGE_LABELS[saved.status] ?? saved.status },
  ].filter((part): part is { text: string; numeric?: boolean } => Boolean(part))

  return (
    <header className="flex flex-col gap-3 lg:col-span-2">
      <div className="flex items-center gap-2">
        {/* A 44px target, pulled into the gutter so the crumbs line up
            with the name under them. */}
        <Link
          href={backHref}
          aria-label="Go back"
          className="-ml-2.5 flex size-11 shrink-0 items-center justify-center rounded-[10px] text-text-primary transition-colors hover:bg-surface"
        >
          <IconArrowLeft size={20} stroke={1.5} />
        </Link>
        <nav aria-label="Garage breadcrumb" className="min-w-0 flex-1">
          <ol className="flex min-w-0 items-center gap-1 text-[13px]">
            <li className="flex shrink-0 items-center gap-1 text-text-secondary">
              <Link
                href="/vendors"
                className="underline-offset-2 hover:text-text-primary hover:underline"
              >
                Garages
              </Link>
              <IconChevronRight size={14} aria-hidden="true" />
            </li>
            <li
              aria-current="page"
              className="min-w-0 truncate font-medium text-text-primary"
            >
              {name}
            </li>
          </ol>
        </nav>
        <a
          href={customerGarageUrl(vendorId)}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-[10px] border border-border px-3.5 text-[13px] font-medium text-text-primary transition-colors hover:border-text-secondary"
        >
          View as customer
          <IconArrowUpRight size={15} stroke={1.75} aria-hidden="true" />
          <span className="sr-only">(opens in a new tab)</span>
        </a>
      </div>

      <div className="flex min-w-0 items-center gap-3">
        <span
          aria-hidden="true"
          className="flex size-11 shrink-0 items-center justify-center rounded-[12px] border border-border bg-surface-elevated text-[14px] font-semibold text-text-primary"
        >
          {initials(saved.form.businessName)}
        </span>
        <div className="min-w-0">
          <h1
            title={name}
            className="truncate text-[20px] font-semibold leading-7 tracking-tight text-text-primary"
          >
            {name}
          </h1>
          <p className="text-[13px] text-text-secondary sm:truncate">
            {subtitle.map((part, i) => (
              <span key={i}>
                {i > 0 && ' · '}
                <span className={part.numeric ? 'font-numeric' : undefined}>
                  {part.text}
                </span>
              </span>
            ))}
          </p>
        </div>
      </div>
    </header>
  )
}
