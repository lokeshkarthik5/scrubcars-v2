import type { Metadata } from 'next'
import { HelpScreen } from '@/components/help/help-screen'
import { HELP_DRAFT } from '@/components/help/content'

// Open to everyone, signed in or not (the route gate treats it as public):
// a question about booking comes before an account. The words live in
// components/help/content.ts. Kept out of search engines while the copy is
// a draft, like the legal pages.
export const metadata: Metadata = {
  title: 'Help centre · Detlio',
  description: 'Answers about booking, payments and refunds, pickup & drop, doorstep, your account and complaints.',
  alternates: { canonical: '/help' },
  robots: HELP_DRAFT ? { index: false, follow: false } : undefined,
}

export default function HelpPage() {
  return <HelpScreen />
}
