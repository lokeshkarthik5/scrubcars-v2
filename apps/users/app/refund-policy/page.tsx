import { LegalPage } from '@/components/legal/legal-page'
import { LEGAL_VIEWPORT, legalMetadata } from '@/lib/legal/metadata'
import { REFUNDS } from '@/lib/legal/refunds'

// The text lives in lib/legal/refunds.ts; see lib/legal/details.ts for the
// business details and the draft switch.
export const dynamic = 'force-static'
export const metadata = legalMetadata(REFUNDS)
export const viewport = LEGAL_VIEWPORT

export default function RefundPolicyPage() {
  return <LegalPage doc={REFUNDS} />
}
