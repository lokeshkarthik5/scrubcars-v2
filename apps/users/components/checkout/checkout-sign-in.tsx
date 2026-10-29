'use client'

import { type FormEvent, type ReactNode, useState } from 'react'
import { IconAlertCircle, IconCheck } from '@tabler/icons-react'
import { ScButton } from '@repo/ui/sc/button'
import { ScInput } from '@repo/ui/sc/input'
import { OtpInput } from '@repo/ui/sc/otp-input'
import { ScPhoneInput } from '@repo/ui/sc/phone-input'
import { resendOtp, sendOtp } from '@repo/core/api/auth'
import type { OtpPurpose } from '@repo/core/api/types'
import { track } from '@repo/core/analytics'
import { useNow } from '@repo/core/hooks/use-now'
import {
  formatCountdown,
  otpDeadlines,
  otpErrorMessage,
  retryAt as retryMoment,
  secondsUntil,
} from '@repo/core/otp'
import { useAuthStore } from '@repo/core/stores/auth-store'
import { trackRegistration } from '@/lib/meta-pixel'
import { LEGAL_PATHS } from '@/lib/legal/routes'

/** The code's length: the server sends six digits (lib/otp.ts), as /verify-otp asks. */
export const OTP_LENGTH = 6

export type SignInPhase = 'phone' | 'code'

/**
 * Checkout's own sign-in (customer reach, 0062): the number, the code and,
 * for a new account, a name, inside the checkout page. The same endpoints
 * and the same session as /login → /verify-otp: `verify` is the sign-in,
 * through the auth store, so the session cookies are set exactly as there.
 * Nothing of the booking is sent before it.
 */
export function useCheckoutSignIn() {
  const verifyOtp = useAuthStore((s) => s.verifyOtp)
  const [phase, setPhase] = useState<SignInPhase>('phone')
  const [phone, setPhone] = useState('')
  const [otp, setOtp] = useState('')
  const [name, setName] = useState('')
  const [purpose, setPurpose] = useState<OtpPurpose | null>(null)
  const [sending, setSending] = useState(false)
  const [verifying, setVerifying] = useState(false)
  const [error, setError] = useState('')
  const [retryAt, setRetryAt] = useState<number | null>(null)
  const [expiresAt, setExpiresAt] = useState<number | null>(null)
  const [resendAt, setResendAt] = useState<number | null>(null)
  // Bumped on each new code, so the boxes start empty again.
  const [codeKey, setCodeKey] = useState(0)

  const phoneValid = /^\d{10}$/.test(phone)
  /** A new number: the account is made at verify, with this name. */
  const isNew = purpose === 'register'
  const readyToVerify =
    phase === 'code' && otp.length === OTP_LENGTH && (!isNew || name.trim().length > 0)

  const changePhone = (value: string) => {
    setPhone(value)
    if (retryAt) {
      setRetryAt(null)
      setError('')
    }
  }

  /** Sends a code to the number: a sign-in for a known number, a sign-up otherwise. */
  const sendCode = async (): Promise<boolean> => {
    if (!phoneValid || sending) return false
    setSending(true)
    setError('')
    try {
      const sent = await sendOtp({ phone, audience: 'customer' })
      const deadlines = otpDeadlines(Date.now(), sent.expiresInSeconds)
      setPurpose(sent.purpose)
      setExpiresAt(deadlines.expiresAt)
      setResendAt(deadlines.resendAt)
      setOtp('')
      setCodeKey((k) => k + 1)
      setPhase('code')
      // Statistics → Behaviour's "gave a number": that a code went, never the number.
      track('otp_sent')
      return true
    } catch (err) {
      setError(otpErrorMessage(err, 'Failed to send the code'))
      setRetryAt(retryMoment(err, Date.now()))
      return false
    } finally {
      setSending(false)
    }
  }

  const resend = async () => {
    if (!purpose || sending) return
    setSending(true)
    setError('')
    try {
      const sent = await resendOtp(phone, 'customer', purpose)
      const deadlines = otpDeadlines(Date.now(), sent.expiresInSeconds)
      setExpiresAt(deadlines.expiresAt)
      setResendAt(deadlines.resendAt)
      setOtp('')
      setCodeKey((k) => k + 1)
    } catch (err) {
      setError(otpErrorMessage(err, 'Failed to resend the code'))
      const at = retryMoment(err, Date.now())
      if (at) setResendAt(at)
    } finally {
      setSending(false)
    }
  }

  /** Back to the number, to correct it. */
  const editNumber = () => {
    setPhase('phone')
    setOtp('')
    setError('')
  }

  /**
   * The sign-in itself. True once the session is set (cookies and the auth
   * store, as /verify-otp does); false with the reason on the card.
   */
  const verify = async (): Promise<boolean> => {
    if (!readyToVerify || verifying || !purpose) return false
    setVerifying(true)
    setError('')
    try {
      await verifyOtp({
        phone,
        otp,
        audience: 'customer',
        purpose,
        name: isNew ? name.trim() : undefined,
      })
      // A new account is set up: Meta's CompleteRegistration (marketing
      // consent only; nothing about them), as profile setup sends it.
      if (isNew) trackRegistration()
      return true
    } catch (err) {
      setError(otpErrorMessage(err, 'Verification failed'))
      return false
    } finally {
      setVerifying(false)
    }
  }

  return {
    phase,
    phone,
    changePhone,
    phoneValid,
    otp,
    setOtp,
    name,
    setName,
    isNew,
    purpose,
    sending,
    verifying,
    error,
    retryAt,
    expiresAt,
    resendAt,
    codeKey,
    readyToVerify,
    sendCode,
    resend,
    editNumber,
    verify,
  }
}

export type CheckoutSignIn = ReturnType<typeof useCheckoutSignIn>

function formatPhone(phone: string) {
  return phone.length === 10 ? `+91 ${phone.slice(0, 5)} ${phone.slice(5)}` : `+91 ${phone}`
}

/**
 * The sign-in card: "Your phone number" → Send code → the six code boxes
 * (and "Your name" for a new number) → Verify. `verifyLabel` is the
 * button's words: "Verify and pay ₹X" when everything else is chosen,
 * "Verify" when signing in early from "Have an account? Sign in".
 * Every field that shows or takes the number, code or name is masked for
 * Clarity.
 */
export function CheckoutSignInCard({
  signIn,
  verifyLabel,
  onVerify,
  busy,
  headingRef,
}: {
  signIn: CheckoutSignIn
  verifyLabel: ReactNode
  /** Verify, and whatever follows it on the page (saving the car, paying). */
  onVerify: () => void
  /** The page is working after the verify (saving, opening the payment). */
  busy: boolean
  headingRef?: React.Ref<HTMLHeadingElement>
}) {
  const now = useNow(1000)
  const waitSeconds = signIn.retryAt ? secondsUntil(signIn.retryAt, now) : 0
  const expirySeconds = signIn.expiresAt ? secondsUntil(signIn.expiresAt, now) : null
  const resendSeconds = signIn.resendAt ? secondsUntil(signIn.resendAt, now) : 0
  const shownError = signIn.retryAt && waitSeconds === 0 ? '' : signIn.error

  const submitPhone = (event: FormEvent) => {
    event.preventDefault()
    if (waitSeconds > 0) return
    void signIn.sendCode()
  }

  return (
    <section
      aria-labelledby="checkout-sign-in"
      className="hub-card flex flex-col gap-4 p-5"
      data-checkout-sign-in=""
    >
      <div>
        <h2
          id="checkout-sign-in"
          ref={headingRef}
          tabIndex={-1}
          className="scroll-mt-20 text-[17px] font-medium tracking-[-0.01em] text-text-primary outline-none"
        >
          Your phone number
        </h2>
        <p className="mt-0.5 text-[13px] text-text-secondary">
          For your booking updates. No password: we text you a code.
        </p>
      </div>

      {signIn.phase === 'phone' ? (
        <form noValidate onSubmit={submitPhone} className="flex flex-col gap-3">
          <ScPhoneInput
            value={signIn.phone}
            onChange={signIn.changePhone}
            enterKeyHint="send"
            errorId={shownError ? 'checkout-sign-in-error' : undefined}
          />
          <ScButton
            type="submit"
            variant="outline"
            disabled={!signIn.phoneValid || signIn.sending || waitSeconds > 0}
          >
            {signIn.sending ? (
              'Sending…'
            ) : waitSeconds > 0 && waitSeconds < 60 ? (
              <>
                Send code in <span className="font-numeric">{formatCountdown(waitSeconds)}</span>
              </>
            ) : (
              'Send code'
            )}
          </ScButton>
        </form>
      ) : (
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-3">
            <p className="text-[15px] text-text-primary" data-clarity-mask="true">
              {formatPhone(signIn.phone)}
            </p>
            <button
              type="button"
              onClick={signIn.editNumber}
              disabled={signIn.verifying || busy}
              className="min-h-11 px-2 text-[13px] text-text-secondary underline underline-offset-2"
            >
              Change number
            </button>
          </div>
          <p className="flex items-center gap-1.5 text-[13px] text-success">
            <IconCheck size={14} aria-hidden /> Code sent by SMS
          </p>
          <OtpInput
            key={signIn.codeKey}
            length={6}
            onComplete={signIn.setOtp}
            errorId={shownError ? 'checkout-sign-in-error' : undefined}
          />
          {signIn.isNew && (
            <ScInput
              data-clarity-mask="true"
              id="checkout-name"
              label="Your name (for the garage)"
              placeholder="Your name"
              autoComplete="name"
              autoCapitalize="words"
              maxLength={255}
              value={signIn.name}
              onChange={(event) => signIn.setName(event.target.value)}
            />
          )}
          <div className="flex items-center justify-between gap-3 text-[12px] text-text-secondary">
            <span>
              {expirySeconds !== null &&
                (expirySeconds > 0 ? (
                  <>
                    Code expires in{' '}
                    <span className="font-numeric text-text-primary">
                      {formatCountdown(expirySeconds)}
                    </span>
                  </>
                ) : (
                  'Code expired — send a new one'
                ))}
            </span>
            <button
              type="button"
              disabled={resendSeconds > 0 || signIn.sending}
              onClick={() => void signIn.resend()}
              className="min-h-11 px-1 font-medium text-text-primary underline disabled:text-text-muted disabled:no-underline"
            >
              {signIn.sending ? (
                'Sending…'
              ) : resendSeconds > 0 ? (
                <>
                  Resend in <span className="font-numeric">{formatCountdown(resendSeconds)}</span>
                </>
              ) : (
                'Resend code'
              )}
            </button>
          </div>
          <ScButton
            variant="main"
            disabled={!signIn.readyToVerify || signIn.verifying || busy}
            onClick={onVerify}
          >
            {signIn.verifying ? 'Verifying…' : busy ? 'One moment…' : verifyLabel}
          </ScButton>
        </div>
      )}

      {shownError && (
        <p
          id="checkout-sign-in-error"
          role="alert"
          className="flex items-start gap-1.5 text-[13px] text-error"
        >
          <IconAlertCircle size={15} className="mt-px shrink-0" aria-hidden="true" />
          {shownError}
        </p>
      )}

      <p className="text-[12px] text-text-muted">
        New to Detlio? Your account is made when you verify. By continuing you
        agree to our{' '}
        <a href={LEGAL_PATHS.terms} target="_blank" rel="noopener" className="underline underline-offset-2">
          Terms
        </a>
        ; our{' '}
        <a href={LEGAL_PATHS.privacy} target="_blank" rel="noopener" className="underline underline-offset-2">
          Privacy Policy
        </a>{' '}
        explains how we use your data.
      </p>
    </section>
  )
}
