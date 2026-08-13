'use client'

import { useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { AppShell } from '@/components/sc/app-shell'
import { ScButton } from '@/components/sc/button'
import { ScPhoneInput } from '@/components/sc/phone-input'
import { TopBar } from '@/components/sc/top-bar'
import { sendOtp } from '@/lib/api/auth'
import { ApiError } from '@/lib/api/client'
import type { AuthAudience } from '@/lib/api/types'

interface PhoneLoginProps {
  /** Which side of the app is signing in — drives the OTP audience. */
  audience: AuthAudience
  /** Where to send the user once the OTP is on its way. */
  verifyHref: string
  /**
   * Show the back arrow. Off for the vendor portal, which is a direct entry
   * point — there's usually no history to go back to.
   */
  showBack?: boolean
}

/**
 * The OTP login screen, shared by the customer and vendor entry points. Both
 * routes render this so the two can't drift apart again — only the audience
 * and the verify destination differ.
 */
export function PhoneLogin({ audience, verifyHref, showBack = true }: PhoneLoginProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const next = searchParams.get('next') ?? ''
  const [phone, setPhone] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const isValid = /^\d{10}$/.test(phone)

  const handleSubmit = async () => {
    if (!isValid) return
    setLoading(true)
    setError('')
    try {
      const purpose = await sendOtp({ phone, audience })
      sessionStorage.setItem('auth_phone', phone)
      sessionStorage.setItem('auth_audience', audience)
      sessionStorage.setItem('auth_purpose', purpose)
      if (next) sessionStorage.setItem('auth_next', next)
      router.push(verifyHref)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to send OTP')
    } finally {
      setLoading(false)
    }
  }

  return (
    <AppShell className="justify-between py-6">
      <TopBar showBack={showBack} />

      <div className="flex flex-1 flex-col justify-center gap-10 pb-16">
        <div className="flex flex-col items-center gap-3">
          <span className="mb-2 text-[17px] font-bold text-text-primary">Detlio</span>
          <h1 className="text-[34px] font-bold tracking-tight text-text-primary">Login</h1>
          <p className="text-[14px] text-text-secondary">
            Enter your phone number to continue
          </p>
        </div>

        <div className="w-full space-y-4">
          <ScPhoneInput value={phone} onChange={setPhone} />

          {error && <p className="text-[12px] text-brand-red">{error}</p>}

          {/* The CTA sits muted until a full 10-digit number is entered. */}
          <ScButton variant="cta" disabled={!isValid || loading} onClick={handleSubmit}>
            {loading ? 'Sending...' : 'Send OTP'}
          </ScButton>
        </div>
      </div>

      <p className="pb-2 text-center text-[12px] text-text-muted">
        By continuing, you agree to our
        <br />
        <span className="underline">Terms</span> &amp;{' '}
        <span className="underline">Privacy Policy</span>
      </p>
    </AppShell>
  )
}
