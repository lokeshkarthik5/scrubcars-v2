'use client'

import { PhoneVerify } from '@/components/auth/phone-verify'

export default function VendorVerifyOtpPage() {
  return (
    <PhoneVerify
      fallbackAudience="vendor"
      backHref="/vendor/login"
      registerPurpose="vendor_onboard"
      registerName="Vendor"
      resolveDestination={(result, next) =>
        result.isNewUser ? '/vendor/onboarding/step-1' : next || '/vendor/home'
      }
    />
  )
}
