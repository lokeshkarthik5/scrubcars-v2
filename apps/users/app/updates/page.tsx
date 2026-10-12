import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { UpdatesScreen } from '@/components/home/updates-screen'
import { isHomeHubEnabled } from '@/lib/home-hub'

export const metadata: Metadata = {
  title: 'Updates · Detlio',
}

// Part of the new Home: the bell on the hub opens it. Behind the same flag,
// so a build with the hub off has no /updates at all.
export default function UpdatesPage() {
  if (!isHomeHubEnabled()) notFound()
  return <UpdatesScreen />
}
