'use client'

import { Suspense } from 'react'
import { PhoneLogin } from '@repo/ui/auth/phone-login'

export default function VendorLoginPage() {
  return (
    <Suspense>
      {/* The customer app's glass stage, worded for a garage. The number
          is the garage's own: a new one goes on to set the garage up, so the
          note under the button says that rather than "your account". */}
      <PhoneLogin
        audience="vendor"
        verifyHref="/verify-otp"
        showBack={false}
        backdrop="/onboarding-car.jpg"
        title="Detlio for Partners"
        subtitle="Log in with the number registered for your garage."
        newNumberNote="New to Detlio? You can set up your garage once your number is verified."
      />
    </Suspense>
  )
}
