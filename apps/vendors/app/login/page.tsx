'use client'

import { Suspense } from 'react'
import { PhoneLogin } from '@repo/ui/auth/phone-login'

/**
 * Detlio's Privacy Policy lives on the customer site, and covers the people
 * who work at partner garages too (its "If you work at a partner garage"
 * section). Only the privacy link: the customer Terms of Use are not a
 * garage's agreement — the Partner Terms will be, once they exist.
 */
const PRIVACY_POLICY_URL = 'https://detlio.com/privacy'

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
        privacyHref={PRIVACY_POLICY_URL}
      />
    </Suspense>
  )
}
