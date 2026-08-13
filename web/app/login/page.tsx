'use client'

import { Suspense } from 'react'
import { PhoneLogin } from '@/components/auth/phone-login'

export default function LoginPage() {
  return (
    <Suspense>
      <PhoneLogin audience="customer" verifyHref="/verify-otp" />
    </Suspense>
  )
}
