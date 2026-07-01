'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { IconMessage } from '@tabler/icons-react'
import { AppShell } from '@/components/sc/app-shell'
import { ScButton } from '@/components/sc/button'
import { OtpInput } from '@/components/sc/otp-input'
import { TopBar } from '@/components/sc/top-bar'
import { resendOtp } from '@/lib/api/auth'
import type { AuthAudience, OtpPurpose } from '@/lib/api/types'
import { ApiError } from '@/lib/api/client'
import { useAuthStore } from '@/lib/stores/auth-store'

export default function VendorVerifyOtpPage() {
  const router = useRouter()
  const verifyOtp = useAuthStore((s) => s.verifyOtp)
  const [phone, setPhone] = useState('')
  const [purpose, setPurpose] = useState<OtpPurpose>('login')
  const [audience, setAudience] = useState<AuthAudience>('vendor')
  const [timer, setTimer] = useState(272)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [otp, setOtp] = useState('')

  useEffect(() => {
    setPhone(sessionStorage.getItem('auth_phone') ?? '')
    setPurpose((sessionStorage.getItem('auth_purpose') as OtpPurpose) ?? 'login')
    setAudience((sessionStorage.getItem('auth_audience') as AuthAudience) ?? 'vendor')
  }, [])

  useEffect(() => {
    if (timer <= 0) return
    const interval = setInterval(() => setTimer((t) => t - 1), 1000)
    return () => clearInterval(interval)
  }, [timer])

  const handleVerify = async (code: string) => {
    if (!phone) return
    setLoading(true)
    setError('')
    try {
      const result = await verifyOtp({
        phone,
        otp: code,
        audience,
        purpose,
        name: purpose === 'vendor_onboard' ? 'Vendor' : undefined,
      })
      if (result.isNewUser) {
        router.push('/vendor/onboarding/step-1')
      } else {
        router.push('/vendor/home')
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Verification failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <AppShell className="py-4">
      <TopBar showBack backHref="/vendor/login" />
      <div className="flex flex-1 flex-col items-center gap-6 pt-8">
        <IconMessage size={32} className="text-brand-red" />
        <div className="text-center">
          <p className="text-[13px] font-medium text-text-primary">Enter the OTP sent to</p>
          <p className="text-[13px] font-semibold text-brand-red">+91 {phone}</p>
        </div>
        <OtpInput onComplete={setOtp} />
        {error && <p className="text-[12px] text-brand-red">{error}</p>}
        <p className="text-[11px] text-text-secondary">
          Expires in {String(Math.floor(timer / 60)).padStart(2, '0')}:{String(timer % 60).padStart(2, '0')}
        </p>
        <div className="mt-auto w-full space-y-3 pb-4">
          <ScButton disabled={loading || otp.length !== 6} onClick={() => handleVerify(otp)}>
            {loading ? 'Verifying...' : 'Verify OTP'}
          </ScButton>
          <ScButton variant="ghost" disabled={timer > 0} onClick={() => { resendOtp(phone, audience, purpose); setTimer(300) }}>
            Resend OTP
          </ScButton>
        </div>
      </div>
    </AppShell>
  )
}
