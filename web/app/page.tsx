import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'

// First-run visitors get the onboarding carousel; anyone with a live session
// (or a refresh token we can still exchange) goes straight to the feed.
export default async function RootPage() {
  const jar = await cookies()
  const signedIn = jar.has('access_token') || jar.has('refresh_token')
  redirect(signedIn ? '/home' : '/welcome')
}
