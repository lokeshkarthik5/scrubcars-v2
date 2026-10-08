import { LegalPage } from '@/components/legal/legal-page'
import { LEGAL_VIEWPORT, legalMetadata } from '@/lib/legal/metadata'
import { TERMS } from '@/lib/legal/terms'

// The text lives in lib/legal/terms.ts; see lib/legal/details.ts for the
// business details and the draft switch.
export const dynamic = 'force-static'
export const metadata = legalMetadata(TERMS)
export const viewport = LEGAL_VIEWPORT

export default function TermsPage() {
  return <LegalPage doc={TERMS} />
}
