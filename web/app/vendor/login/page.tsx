'use client'

import { Suspense } from 'react'
import { PhoneLogin } from '@/components/auth/phone-login'

export default function VendorLoginPage() {
  return (
    <Suspense>
      <PhoneLogin audience="vendor" verifyHref="/vendor/verify-otp" showBack={false} />
    </Suspense>
  )
}
