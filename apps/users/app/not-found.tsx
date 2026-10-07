import { ContactButtons } from '@repo/ui/sc/contact-buttons'
import { SUPPORT_TEL_HREF, SUPPORT_WHATSAPP_HREF } from '@repo/core/support'
import { CrashScreen } from '@repo/ui/sc/crash-screen'

/** Any URL with no page behind it, in this app's own look. */
export default function NotFound() {
  return (
    <CrashScreen
      title="Page not found"
      message="This page doesn't exist or has moved."
      homeHref="/"
      homeLabel="Go to home"
    >
      {/* A dead link from a message or an old bookmark: a person can point
          the way. */}
      <p className="pb-3 text-[12px] text-text-secondary">Looking for something? Our team can help.</p>
      <ContactButtons
        who="Detlio support"
        callHref={SUPPORT_TEL_HREF}
        whatsAppHref={SUPPORT_WHATSAPP_HREF}
      />
    </CrashScreen>
  )
}
