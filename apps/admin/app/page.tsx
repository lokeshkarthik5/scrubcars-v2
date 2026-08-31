import { redirect } from 'next/navigation'

// The panel has no landing page; '/' is the login door.
export default function RootPage() {
  redirect('/login')
}
