'use client'

import { Suspense } from 'react'
import { PhoneLogin } from '@repo/ui/auth/phone-login'
import { LEGAL_PATHS } from '@/lib/legal/routes'

export default function LoginPage() {
  return (
    <Suspense>
      <PhoneLogin
        audience="customer"
        verifyHref="/verify-otp"
        backdrop="/onboarding-car.jpg"
        termsHref={LEGAL_PATHS.terms}
        privacyHref={LEGAL_PATHS.privacy}
      />
    </Suspense>
  )
}
