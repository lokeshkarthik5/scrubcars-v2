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

function formatPhone(phone: string) {
  if (phone.length !== 10) return `+91 ${phone}`
  return `+91 ${phone.slice(0, 5)} ${phone.slice(5)}`
}

export default function VerifyOtpPage() {
  const router = useRouter()
  const verifyOtp = useAuthStore((s) => s.verifyOtp)
  const [phone, setPhone] = useState('')
  const [purpose, setPurpose] = useState<OtpPurpose>('login')
  const [audience, setAudience] = useState<AuthAudience>('customer')
  const [timer, setTimer] = useState(272)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [otp, setOtp] = useState('')

  useEffect(() => {
    setPhone(sessionStorage.getItem('auth_phone') ?? '')
    setPurpose((sessionStorage.getItem('auth_purpose') as OtpPurpose) ?? 'login')
    setAudience((sessionStorage.getItem('auth_audience') as AuthAudience) ?? 'customer')
  }, [])

  useEffect(() => {
    if (timer <= 0) return
    const interval = setInterval(() => setTimer((t) => t - 1), 1000)
    return () => clearInterval(interval)
  }, [timer])

  const mins = String(Math.floor(timer / 60)).padStart(2, '0')
  const secs = String(timer % 60).padStart(2, '0')

  const handleVerify = async (otp: string) => {
    if (!phone) return
    setLoading(true)
    setError('')
    try {
      const result = await verifyOtp({
        phone,
        otp,
        audience,
        purpose,
        name: purpose === 'register' ? 'User' : undefined,
      })
      if (result.isNewUser) {
        router.push('/profile-setup')
      } else {
        router.push('/home?welcome=1')
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Verification failed')
    } finally {
      setLoading(false)
    }
  }

  const handleResend = async () => {
    await resendOtp(phone, audience, purpose)
    setTimer(300)
  }

  return (
    <AppShell className="py-4">
      <TopBar showBack backHref="/login" />

      <div className="flex flex-1 flex-col items-center gap-6 pt-8">
        <IconMessage size={32} className="text-brand-red" />
        <div className="text-center">
          <p className="text-[13px] font-medium text-text-primary">Enter the OTP sent to</p>
          <p className="text-[13px] font-semibold text-brand-red">{formatPhone(phone)}</p>
        </div>

        <OtpInput onComplete={setOtp} />

        {error && <p className="text-[12px] text-brand-red">{error}</p>}

        <p className="text-[11px] text-text-secondary">
          Expires in {mins}:{secs}
        </p>

        <div className="mt-auto w-full space-y-3 pb-4">
          <ScButton disabled={loading || !phone || otp.length !== 6} onClick={() => handleVerify(otp)}>
            {loading ? 'Verifying...' : 'Verify OTP'}
          </ScButton>
          <ScButton
            variant="ghost"
            disabled={timer > 0}
            onClick={handleResend}
          >
            Resend OTP
          </ScButton>
        </div>
      </div>
    </AppShell>
  )
}
