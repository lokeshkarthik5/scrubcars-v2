'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { IconArrowRight, IconX } from '@tabler/icons-react'
import {
  clearBookingDraft,
  draftResumePath,
  readBookingDraft,
  type BookingDraft,
} from '@repo/core/booking-draft'

/**
 * "Continue your booking at <garage>" (customer reach, 0062): a booking
 * started without signing in and left half way, offered back on the landing
 * page and Home for a day (@repo/core/booking-draft). Read from this phone
 * only, after the page has hydrated, so the server-rendered landing never
 * holds it. × forgets it.
 */
export function ContinueBookingCard() {
  const [draft, setDraft] = useState<BookingDraft | null>(null)

  // localStorage is only there in the browser, after hydration.
  useEffect(() => {
    setDraft(readBookingDraft())
  }, [])

  if (!draft) return null

  return (
    <div
      role="region"
      aria-label="Continue your booking"
      className="hub-card relative flex items-center gap-3 py-3 pl-4 pr-2"
    >
      <Link
        href={draftResumePath(draft)}
        className="flex min-h-11 min-w-0 flex-1 items-center gap-3"
      >
        <span className="min-w-0 flex-1">
          <span className="block text-[12px] text-text-muted">You started a booking</span>
          <span className="block truncate text-[15px] text-text-primary">
            Continue your booking at {draft.vendorName}
          </span>
        </span>
        <IconArrowRight size={18} aria-hidden className="shrink-0 text-text-secondary" />
      </Link>
      <button
        type="button"
        aria-label="Forget this booking"
        onClick={() => {
          clearBookingDraft()
          setDraft(null)
        }}
        className="grid size-11 shrink-0 place-items-center text-text-muted"
      >
        <IconX size={16} aria-hidden />
      </button>
    </div>
  )
}
