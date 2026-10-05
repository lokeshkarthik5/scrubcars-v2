import { LegalPage } from '@/components/legal/legal-page'
import { LEGAL_VIEWPORT, legalMetadata } from '@/lib/legal/metadata'
import { SERVICE_DELIVERY } from '@/lib/legal/service-delivery'

// The text lives in lib/legal/service-delivery.ts; see lib/legal/details.ts for the
// business details and the draft switch.
export const dynamic = 'force-static'
export const metadata = legalMetadata(SERVICE_DELIVERY)
export const viewport = LEGAL_VIEWPORT

export default function ServiceDeliveryPage() {
  return <LegalPage doc={SERVICE_DELIVERY} />
}
