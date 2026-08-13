'use client'

import { PhoneVerify } from '@/components/auth/phone-verify'

export default function VerifyOtpPage() {
  return (
    <PhoneVerify
      fallbackAudience="customer"
      backHref="/login"
      registerPurpose="register"
      registerName="User"
      resolveDestination={(result, next) =>
        result.isNewUser ? '/profile-setup' : next || '/home?welcome=1'
      }
    />
  )
}
