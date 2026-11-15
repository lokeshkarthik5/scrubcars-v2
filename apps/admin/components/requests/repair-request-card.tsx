'use client'

import { useState } from 'react'
import { IconPhoto, IconPhone, IconX } from '@tabler/icons-react'
import { ScModal } from '@repo/ui/sc/modal'
import type { AdminRepairRequest } from '@repo/core/api/repair-quotes'
import { telHref } from '@repo/core/contact-links'
import { cn } from '@repo/core/utils'
import { repairClockLine, repairQuoteLine, repairStateChip } from '@/lib/repair-quotes'

const TONE_CHIP = {
  attention: 'bg-tone-attention-tint text-tone-attention-text',
  progress: 'bg-tone-progress-tint text-tone-progress-text',
  done: 'bg-tone-done-tint text-tone-done-text',
  late: 'bg-tone-late-tint text-tone-late-text',
  closed: 'bg-tone-closed-tint text-tone-closed-text',
} as const

/**
 * One repair quote request on admin's list (0075): the damage and car, the
 * customer (the last four digits only), where it stands, its clock, each
 * garage's answer — with a call link for a garage still waiting — and the
 * video, pictures and brief behind "Video & photos".
 */
export function RepairRequestCard({ request, now }: { request: AdminRepairRequest; now: number }) {
  const [open, setOpen] = useState(false)
  const chip = repairStateChip(request)
  return (
    <article
      aria-label={`Repair request: ${request.title}, ${request.vehicle}`}
      className="flex flex-col gap-2 rounded-[14px] border border-border bg-surface px-4 py-3.5"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[13.5px] font-medium text-text-primary">
            {request.title} · {request.vehicle}{' '}
            <span className="font-numeric text-[12px] font-normal text-text-secondary">#{request.ref}</span>
          </p>
          <p className="text-[12px] text-text-secondary">
            {[request.customer.name ?? 'A customer', request.customer.phone, request.area].filter(Boolean).join(' · ')}
          </p>
        </div>
        <span className={cn('shrink-0 rounded-full px-2.5 py-1 text-[11.5px] font-medium', TONE_CHIP[chip.tone])}>
          {chip.label}
        </span>
      </div>
      <p className="text-[12.5px] text-text-primary">{repairClockLine(request, now)}</p>
      <ul className="flex flex-col gap-1">
        {request.quotes.map((quote) => {
          const tel = quote.state === 'waiting' ? telHref(quote.garage.phone) : null
          return (
            <li key={quote.id} className="flex flex-wrap items-center gap-x-2 text-[12.5px]">
              <span className="text-text-primary">{quote.garage.name}</span>
              <span className="font-numeric text-text-secondary">{repairQuoteLine(quote)}</span>
              {tel && (
                <a
                  href={tel}
                  aria-label={`Call ${quote.garage.name}`}
                  className="inline-flex min-h-9 items-center gap-1 font-medium text-text-primary underline underline-offset-4"
                >
                  <IconPhone size={13} aria-hidden /> Call
                </a>
              )}
            </li>
          )
        })}
      </ul>
      <div className="flex flex-wrap items-center gap-2 pt-1">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex min-h-10 items-center gap-1.5 rounded-full border border-white/25 px-3.5 text-[12.5px] font-medium text-text-primary"
        >
          <IconPhoto size={14} aria-hidden /> Video &amp; photos
        </button>
      </div>
      <ScModal open={open} onClose={() => setOpen(false)} aria-label="Video and photos" className="max-w-[520px]">
        <div className="flex flex-col gap-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-[15px] font-semibold text-text-primary">{request.title}</h2>
              <p className="text-[12px] text-text-secondary">{request.vehicle}</p>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close"
              className="grid size-9 place-items-center rounded-full text-text-secondary hover:text-text-primary"
            >
              <IconX size={16} aria-hidden />
            </button>
          </div>
          {request.video && <video src={request.video.url} controls playsInline className="w-full rounded-[12px] bg-black" />}
          {request.photos.length > 0 && (
            <div className="grid grid-cols-3 gap-2">
              {request.photos.map((photo, index) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  key={photo.url || index}
                  src={photo.url}
                  alt={`${photo.kind === 'frame' ? 'Frame' : 'Photo'} ${index + 1}`}
                  className="aspect-square w-full rounded-[10px] object-cover"
                />
              ))}
            </div>
          )}
          <div className="rounded-[12px] border border-border px-3 py-2.5">
            <p className="text-[12px] text-text-secondary">
              {request.brief.source === 'customer' ? 'Brief (written by the customer)' : 'Brief (Detlio’s, from the pictures)'}
            </p>
            <p className="mt-0.5 text-[13.5px] text-text-primary">{request.brief.text}</p>
            <p className="mt-1.5 text-[12px] text-text-secondary">Customer wrote: “{request.note}”</p>
          </div>
        </div>
      </ScModal>
    </article>
  )
}
