import Link from 'next/link'
import { ContactComplaintEntry } from '@/components/complaints/contact-complaint-entry'
import { LegalPage } from '@/components/legal/legal-page'
import { LEGAL_VIEWPORT, legalMetadata } from '@/lib/legal/metadata'
import { CONTACT } from '@/lib/legal/contact'

// The text lives in lib/legal/contact.ts; see lib/legal/details.ts for the
// business details and the draft switch. Under the intro, the page's live
// parts: the way to the Help centre's answers, and the complaint entry (a
// client component; the page stays static). Both are left off the printed
// page and the lawyer's Markdown copy.
export const dynamic = 'force-static'
export const metadata = legalMetadata(CONTACT)
export const viewport = LEGAL_VIEWPORT

export default function ContactPage() {
  return (
    <LegalPage
      doc={CONTACT}
      afterIntro={
        <>
          <p className="legal-chrome my-4">
            Quick answers about booking, refunds, pickup &amp; drop and more are in our{' '}
            <Link
              href="/help"
              className="font-medium text-text-primary underline decoration-white/30 underline-offset-[3px] transition-colors hover:decoration-white"
            >
              Help centre
            </Link>
            .
          </p>
          <ContactComplaintEntry />
        </>
      }
    />
  )
}
