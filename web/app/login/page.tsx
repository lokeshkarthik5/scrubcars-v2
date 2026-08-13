'use client'

import { Suspense, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { IconChevronDown } from '@tabler/icons-react'
import { AppShell } from '@/components/sc/app-shell'
import { ScButton } from '@/components/sc/button'
import { TopBar } from '@/components/sc/top-bar'
import { sendOtp } from '@/lib/api/auth'
import { ApiError } from '@/lib/api/client'
import { cn } from '@/lib/utils'

function LoginContent() {
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
      const purpose = await sendOtp({ phone, audience: 'customer' })
      sessionStorage.setItem('auth_phone', phone)
      sessionStorage.setItem('auth_audience', 'customer')
      sessionStorage.setItem('auth_purpose', purpose)
      if (next) sessionStorage.setItem('auth_next', next)
      router.push('/verify-otp')
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to send OTP')
    } finally {
      setLoading(false)
    }
  }

  return (
    <AppShell className="justify-between py-6">
      <TopBar showBack />

      <div className="flex flex-1 flex-col justify-center gap-10 pb-16">
        <div className="flex flex-col items-center gap-3">
          <h1 className="text-[34px] font-bold tracking-tight text-text-primary">Login</h1>
          <p className="text-[14px] text-text-secondary">
            Enter your phone number to continue
          </p>
        </div>

        <div className="w-full space-y-4">
          <div className="flex overflow-hidden rounded-[12px] border border-border bg-surface focus-within:border-brand-red">
            <button
              type="button"
              className="flex shrink-0 items-center gap-1.5 border-r border-border px-3.5 text-[15px] text-text-primary"
            >
              <span className="text-[15px] leading-none">🇮🇳</span>
              +91
              <IconChevronDown size={16} className="text-text-secondary" />
            </button>
            <input
              type="tel"
              inputMode="numeric"
              maxLength={10}
              placeholder="Phone number"
              value={phone}
              onChange={(e) => setPhone(e.target.value.replace(/\D/g, ''))}
              className="w-full flex-1 bg-transparent px-3.5 py-4 text-[15px] text-text-primary outline-none"
            />
          </div>

          {error && <p className="text-[12px] text-brand-red">{error}</p>}

          {/* Design: the CTA sits muted until a full 10-digit number is entered,
              then fills with the brand red. */}
          <ScButton
            disabled={!isValid || loading}
            onClick={handleSubmit}
            variant={isValid ? 'primary' : 'secondary'}
            className={cn(
              'rounded-full py-4 text-[15px]',
              !isValid && 'border-transparent bg-surface-elevated text-text-secondary opacity-100'
            )}
          >
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

export default function LoginPage() {
  return (
    <Suspense>
      <LoginContent />
    </Suspense>
  )
}
