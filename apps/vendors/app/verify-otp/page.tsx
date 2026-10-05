'use client'

import { PhoneVerify } from '@repo/ui/auth/phone-verify'

export default function VendorVerifyOtpPage() {
  return (
    <PhoneVerify
      fallbackAudience="vendor"
      backHref="/login"
      registerPurpose="vendor_onboard"
      registerName="Vendor"
      // The same staging as the login screen before it.
      backdrop="/onboarding-car.jpg"
      resolveDestination={(result, next) =>
        result.isNewUser ? '/onboarding/step-1' : next || '/home'
      }
    />
  )
}
