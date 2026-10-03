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
      resolveDestination={(result, next) =>
        result.isNewUser ? '/profile-setup' : next || '/home?welcome=1'
      }
    />
  )
}
