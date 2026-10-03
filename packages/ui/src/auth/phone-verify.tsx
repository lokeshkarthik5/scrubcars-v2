'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { IconAlertCircle } from '@tabler/icons-react'
import { AuthStage } from '@repo/ui/auth/auth-stage'
import { AppShell } from '@repo/ui/sc/app-shell'
import { ScButton } from '@repo/ui/sc/button'
import { OtpInput } from '@repo/ui/sc/otp-input'
import { TopBar } from '@repo/ui/sc/top-bar'
import { resendOtp } from '@repo/core/api/auth'
import type { AuthAudience, OtpPurpose } from '@repo/core/api/types'
import { ApiError } from '@repo/core/api/client'
import { useAuthStore } from '@repo/core/stores/auth-store'

const RESEND_SECONDS = 300

function formatPhone(phone: string) {
  if (phone.length !== 10) return `+91 ${phone}`
  return `+91 ${phone.slice(0, 5)} ${phone.slice(5)}`
}

interface PhoneVerifyProps {
  /** Used only when sessionStorage has no audience (direct navigation). */
  fallbackAudience: AuthAudience
  backHref: string
  /** The purpose that means "this is a sign-up", so a placeholder name is sent. */
  registerPurpose: OtpPurpose
  /** Placeholder name recorded for a brand-new account. */
  registerName: string
  /** Where to go once verified. `next` is the stashed post-login destination. */
  resolveDestination: (result: { isNewUser: boolean }, next: string) => string
  /** Stage the screen on this photo, as PhoneLogin does — see AuthStage. */
  backdrop?: string
}

/**
 * The OTP verification screen, shared by the customer and vendor flows. Both
 * routes render this so the two can't drift apart — only the audience,
 * sign-up purpose and post-verify destination differ.
 */
export function PhoneVerify({
  fallbackAudience,
  backHref,
  registerPurpose,
  registerName,
  resolveDestination,
  backdrop,
}: PhoneVerifyProps) {
  const router = useRouter()
  const verifyOtp = useAuthStore((s) => s.verifyOtp)
  const [phone, setPhone] = useState('')
  const [purpose, setPurpose] = useState<OtpPurpose>('login')
  const [audience, setAudience] = useState<AuthAudience>(fallbackAudience)
  const [next, setNext] = useState('')
  const [timer, setTimer] = useState(RESEND_SECONDS)
  const [loading, setLoading] = useState(false)
  const [resending, setResending] = useState(false)
  const [error, setError] = useState('')
  const [otp, setOtp] = useState('')

  useEffect(() => {
    setPhone(sessionStorage.getItem('auth_phone') ?? '')
    setPurpose((sessionStorage.getItem('auth_purpose') as OtpPurpose) ?? 'login')
    setAudience(
      (sessionStorage.getItem('auth_audience') as AuthAudience) ?? fallbackAudience
    )
    setNext(sessionStorage.getItem('auth_next') ?? '')
  }, [fallbackAudience])

  useEffect(() => {
    if (timer <= 0) return
    const interval = setInterval(() => setTimer((t) => t - 1), 1000)
    return () => clearInterval(interval)
  }, [timer])

  const mins = String(Math.floor(timer / 60)).padStart(2, '0')
  const secs = String(timer % 60).padStart(2, '0')

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
        name: purpose === registerPurpose ? registerName : undefined,
      })
      sessionStorage.removeItem('auth_next')
      router.push(resolveDestination(result, next))
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Verification failed')
    } finally {
      setLoading(false)
    }
  }

  // Only restart the countdown once the resend actually succeeds — otherwise a
  // failed send would look identical to a successful one.
  const handleResend = async () => {
    setResending(true)
    setError('')
    try {
      await resendOtp(phone, audience, purpose)
      setTimer(RESEND_SECONDS)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to resend OTP')
    } finally {
      setResending(false)
    }
  }

  const intro = (
    <>
      <h1 className="text-[26px] font-bold leading-8 tracking-[-0.02em] text-text-primary">
        Verify your number
      </h1>
      <div className="pt-2 text-center">
        <p className="text-[15px] leading-6 text-text-secondary">
          Enter the 6-digit code sent to
        </p>
        <p className="text-[15px] font-semibold text-text-primary">
          {formatPhone(phone)}
        </p>
      </div>
    </>
  )

  const code = (
    <>
      <div className="pt-7">
        <OtpInput onComplete={setOtp} />
      </div>

      {/* Amber, as on the login screen — red is the Verify button's. */}
      {error && (
        <p role="alert" className="flex items-start gap-1.5 pt-4 text-[12px] text-error">
          <IconAlertCircle size={14} className="mt-px shrink-0" aria-hidden="true" />
          {error}
        </p>
      )}

      <p className="pt-6 text-[12px] text-text-secondary">
        Expires in{' '}
        <span className="font-numeric font-medium text-text-primary">
          {mins}:{secs}
        </span>
      </p>

      <button
        type="button"
        disabled={timer > 0 || resending}
        onClick={handleResend}
        className="pt-3 text-[13px] font-semibold text-text-primary underline disabled:text-text-muted disabled:no-underline"
      >
        {resending ? 'Sending...' : 'Resend OTP'}
      </button>
    </>
  )

  const verifyButton = (
    <ScButton
      variant="cta"
      disabled={loading || !phone || otp.length !== 6}
      onClick={() => handleVerify(otp)}
      className={
        backdrop ? 'disabled:bg-white/10 disabled:hover:bg-white/10' : undefined
      }
    >
      {loading ? 'Verifying...' : 'Verify'}
    </ScButton>
  )

  if (backdrop) {
    return (
      <AuthStage backdrop={backdrop} showBack backHref={backHref}>
        <div className="flex flex-col items-center text-center">
          {intro}
          {code}
          <div className="mt-8 w-full">{verifyButton}</div>
        </div>
      </AuthStage>
    )
  }

  return (
    <AppShell className="py-4">
      <TopBar showBack backHref={backHref} />

      <div className="flex flex-1 flex-col items-center">
        <div className="flex flex-col items-center pt-10">{intro}</div>
        {code}
        <div className="mt-auto w-full pb-2">{verifyButton}</div>
      </div>
    </AppShell>
  )
}
