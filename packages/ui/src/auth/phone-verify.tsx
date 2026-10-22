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
import { useNow } from '@repo/core/hooks/use-now'
import {
  formatCountdown,
  otpDeadlines,
  otpErrorMessage,
  retryAt as retryMoment,
  secondsUntil,
} from '@repo/core/otp'
import { useAuthStore } from '@repo/core/stores/auth-store'

/** A stored epoch-ms moment, or null when absent or unreadable. */
function readMoment(key: string): number | null {
  const value = Number(sessionStorage.getItem(key))
  return Number.isFinite(value) && value > 0 ? value : null
}

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
  // Two clocks, both set by the send that brought the customer here (see
  // @repo/core/otp): when the code stops working, and when Resend opens.
  const [expiresAt, setExpiresAt] = useState<number | null>(null)
  const [resendAt, setResendAt] = useState<number | null>(null)
  const now = useNow(1000)
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
    // Missing only on a direct visit with no send behind it: the code's
    // expiry is then unknown, and Resend is open straight away.
    setExpiresAt(readMoment('auth_expires_at'))
    setResendAt(readMoment('auth_resend_at'))
  }, [fallbackAudience])

  const expirySeconds = expiresAt ? secondsUntil(expiresAt, now) : null
  const resendSeconds = resendAt ? secondsUntil(resendAt, now) : 0

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
      setError(otpErrorMessage(err, 'Verification failed'))
    } finally {
      setLoading(false)
    }
  }

  // Only restart the clocks once the resend actually succeeds — otherwise a
  // failed send would look identical to a successful one.
  const handleResend = async () => {
    if (resending || resendSeconds > 0) return
    setResending(true)
    setError('')
    try {
      const sent = await resendOtp(phone, audience, purpose)
      const deadlines = otpDeadlines(Date.now(), sent.expiresInSeconds)
      setExpiresAt(deadlines.expiresAt)
      setResendAt(deadlines.resendAt)
      sessionStorage.setItem('auth_expires_at', String(deadlines.expiresAt))
      sessionStorage.setItem('auth_resend_at', String(deadlines.resendAt))
    } catch (err) {
      setError(otpErrorMessage(err, 'Failed to resend OTP'))
      // Refused for timing: Resend counts down to when the server will say yes.
      const at = retryMoment(err, Date.now())
      if (at) {
        setResendAt(at)
        sessionStorage.setItem('auth_resend_at', String(at))
      }
    } finally {
      setResending(false)
    }
  }

  const intro = (
    <>
      <h1 className="text-[28px] font-bold leading-9 tracking-[-0.02em] text-text-primary">
        Verify your number
      </h1>
      <div className="pt-2 text-center">
        <p className="text-base leading-6 text-text-secondary">
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
        <OtpInput
          onComplete={setOtp}
          tone={backdrop ? 'glass' : 'solid'}
          errorId={error ? 'otp-error' : undefined}
        />
      </div>

      {/* Amber, as on the login screen — red is the Verify button's. */}
      {error && (
        <p id="otp-error" role="alert" className="flex items-start gap-1.5 pt-4 text-[12px] text-error">
          <IconAlertCircle size={14} className="mt-px shrink-0" aria-hidden="true" />
          {error}
        </p>
      )}

      {/* The countdown itself is plain text: in a live region every tick
          would be read out. The expiry is announced by the status below,
          which is on the page from the first render — a live region that
          mounts with its text already in it is usually not announced at
          all — and only its text changes, once, when the code runs out. */}
      {expirySeconds !== null && (
        <p className="pt-6 text-[12px] text-text-secondary">
          {expirySeconds > 0 ? (
            <>
              Code expires in{' '}
              <span className="font-numeric font-medium text-text-primary">
                {formatCountdown(expirySeconds)}
              </span>
            </>
          ) : (
            // Read out by the status below; hidden here so it isn't heard twice.
            <span aria-hidden="true">Code expired — resend</span>
          )}
        </p>
      )}
      <span role="status" className="sr-only">
        {expirySeconds === 0 ? 'Code expired — resend' : ''}
      </span>

      <button
        type="button"
        disabled={resendSeconds > 0 || resending}
        onClick={handleResend}
        className="mt-2 min-h-11 px-3 text-[13px] font-semibold text-text-primary underline disabled:text-text-muted disabled:no-underline"
      >
        {resending ? (
          'Sending...'
        ) : resendSeconds > 0 ? (
          <>
            Resend OTP in{' '}
            <span className="font-numeric">{formatCountdown(resendSeconds)}</span>
          </>
        ) : (
          'Resend OTP'
        )}
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
