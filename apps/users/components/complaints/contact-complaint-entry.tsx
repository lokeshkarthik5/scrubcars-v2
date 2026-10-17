'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { IconMessageReport } from '@tabler/icons-react'
import { ScButton } from '@repo/ui/sc/button'
import { useAuthStore } from '@repo/core/stores/auth-store'
import { track } from '@repo/core/analytics'
import { COMPLAINT_ACKNOWLEDGE_HOURS } from '@repo/core/complaints'
import { RaiseComplaintSheet } from '@/components/complaints/raise-complaint-sheet'

/**
 * "Raise a complaint" on the Contact page, for a complaint that is not about
 * one booking (a booking's own Help attaches the booking for you). Signed
 * in, it opens the complaint sheet; signed out, it says to sign in, and the
 * phone, WhatsApp and email below still work for anyone.
 *
 * The page is static; this is the one part that knows who is reading it.
 * Until the session has been checked it holds its place without a button,
 * so a signed-in customer never sees "Sign in" flash first. Left off the
 * printed page (`legal-chrome`).
 */
export function ContactComplaintEntry() {
  const user = useAuthStore((s) => s.user)
  const ready = useAuthStore((s) => s.isSessionReady)
  const [open, setOpen] = useState(false)

  // Someone looking for help, from the Contact page.
  useEffect(() => {
    track('help_view', { step: 'contact' })
  }, [])

  return (
    <section
      aria-labelledby="raise-complaint"
      className="legal-chrome my-6 flex flex-col gap-3 rounded-xl border border-border bg-surface px-4 py-4"
    >
      <div>
        <h2 id="raise-complaint" className="text-[16px] font-semibold text-text-primary">
          Raise a complaint
        </h2>
        <p className="mt-1 text-[14px] leading-relaxed text-text-secondary">
          Write it down in the app and you get a complaint number at once. We reply within{' '}
          <span className="font-numeric">{COMPLAINT_ACKNOWLEDGE_HOURS}</span> hours.
        </p>
      </div>

      {!ready ? (
        <div className="min-h-11" aria-hidden />
      ) : user ? (
        <ScButton variant="secondary" onClick={() => setOpen(true)} className="min-h-11 sm:w-auto sm:self-start sm:px-5">
          <span className="flex items-center justify-center gap-2">
            <IconMessageReport size={18} aria-hidden />
            Raise a complaint
          </span>
        </ScButton>
      ) : (
        <p className="text-[14px] text-text-secondary">
          <Link
            href={`/login?next=${encodeURIComponent('/contact#raise-complaint')}`}
            className="font-medium text-text-primary underline decoration-white/30 underline-offset-[3px] hover:decoration-white"
          >
            Sign in to raise a complaint
          </Link>
          , or reach us by phone, WhatsApp or email below.
        </p>
      )}

      {user && <RaiseComplaintSheet open={open} onClose={() => setOpen(false)} booking={null} />}
    </section>
  )
}
