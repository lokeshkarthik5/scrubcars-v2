'use client'

import { Suspense } from 'react'
import { PhoneLogin } from '@repo/ui/auth/phone-login'

export default function VendorLoginPage() {
  return (
    <Suspense>
      <PhoneLogin audience="vendor" verifyHref="/verify-otp" showBack={false} />
    </Suspense>
  )
}
