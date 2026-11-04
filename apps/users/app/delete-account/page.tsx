import { LegalPage } from '@/components/legal/legal-page'
import { DELETE_ACCOUNT } from '@/lib/legal/delete-account'
import { LEGAL_VIEWPORT, legalMetadata } from '@/lib/legal/metadata'

// The text lives in lib/legal/delete-account.ts. Unlike the legal pages it is a
// `standing` how-to (the app stores' listings link to it): indexable even while
// the legal pages are drafts. Static, and it needs no sign-in or API.
export const dynamic = 'force-static'
export const metadata = legalMetadata(DELETE_ACCOUNT)
export const viewport = LEGAL_VIEWPORT

export default function DeleteAccountPage() {
  return <LegalPage doc={DELETE_ACCOUNT} />
}
