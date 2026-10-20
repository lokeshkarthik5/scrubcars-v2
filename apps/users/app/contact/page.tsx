import { ContactComplaintEntry } from '@/components/complaints/contact-complaint-entry'
import { LegalPage } from '@/components/legal/legal-page'
import { LEGAL_VIEWPORT, legalMetadata } from '@/lib/legal/metadata'
import { CONTACT } from '@/lib/legal/contact'

// The text lives in lib/legal/contact.ts; see lib/legal/details.ts for the
// business details and the draft switch. The complaint entry under the intro
// is the page's one live part (a client component; the page stays static).
export const dynamic = 'force-static'
export const metadata = legalMetadata(CONTACT)
export const viewport = LEGAL_VIEWPORT

export default function ContactPage() {
  return <LegalPage doc={CONTACT} afterIntro={<ContactComplaintEntry />} />
}
