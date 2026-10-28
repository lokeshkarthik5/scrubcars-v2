'use client'

import { Suspense } from 'react'
import { PhoneLogin } from '@repo/ui/auth/phone-login'
import { track } from '@repo/core/analytics'
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
        // Statistics → Behaviour's "gave a number": that a code went, never
        // the number.
        onOtpSent={() => track('otp_sent')}
      />
    </Suspense>
  )
}
