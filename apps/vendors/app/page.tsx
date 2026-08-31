import { redirect } from 'next/navigation'

// The vendor portal has no marketing surface: '/' is the login door. Signed-in
// vendors are moved on to /home by AppProvider once the session resolves.
export default function RootPage() {
  redirect('/login')
}
