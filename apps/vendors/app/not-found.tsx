import { CrashScreen } from '@repo/ui/sc/crash-screen'

/** Any URL with no page behind it, in this app's own look. */
export default function NotFound() {
  return (
    <CrashScreen
      title="Page not found"
      message="This page doesn't exist or has moved."
      homeHref="/home"
      homeLabel="Go to your dashboard"
    />
  )
}
