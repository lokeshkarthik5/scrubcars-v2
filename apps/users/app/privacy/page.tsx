import { LegalPage } from '@/components/legal/legal-page'
import { LEGAL_VIEWPORT, legalMetadata } from '@/lib/legal/metadata'
import { PRIVACY } from '@/lib/legal/privacy'

// The text lives in lib/legal/privacy.ts; see lib/legal/details.ts for the
// business details and the draft switch.
export const dynamic = 'force-static'
export const metadata = legalMetadata(PRIVACY)
export const viewport = LEGAL_VIEWPORT

export default function PrivacyPage() {
  return <LegalPage doc={PRIVACY} />
}
