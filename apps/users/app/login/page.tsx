'use client'

import { Suspense } from 'react'
import { PhoneLogin } from '@repo/ui/auth/phone-login'

export default function LoginPage() {
  return (
    <Suspense>
      <PhoneLogin
        audience="customer"
        verifyHref="/verify-otp"
        backdrop="/onboarding-car.jpg"
      />
    </Suspense>
  )
}
