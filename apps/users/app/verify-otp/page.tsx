'use client'

import { PhoneVerify } from '@repo/ui/auth/phone-verify'

export default function VerifyOtpPage() {
  return (
    <PhoneVerify
      fallbackAudience="customer"
      backHref="/login"
      registerPurpose="register"
      registerName="User"
      backdrop="/onboarding-car.jpg"
      resolveDestination={(result, next) => {
        if (!result.isNewUser) return next || '/home?welcome=1'
        // A new customer still has to give their name, but the page they were
        // headed for — usually the booking they started as a guest — rides
        // along so profile setup can hand them straight back to it. `next` was
        // checked by PhoneLogin when it arrived; profile-setup checks it again,
        // since that URL can be crafted too.
        return next
          ? `/profile-setup?next=${encodeURIComponent(next)}`
          : '/profile-setup'
      }}
    />
  )
}
