'use client'

import { type FormEvent, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { IconAlertCircle } from '@tabler/icons-react'
import { AuthHeading, AuthStage } from '@repo/ui/auth/auth-stage'
import { AppShell } from '@repo/ui/sc/app-shell'
import { ScButton } from '@repo/ui/sc/button'
import { ScPhoneInput } from '@repo/ui/sc/phone-input'
import { TopBar } from '@repo/ui/sc/top-bar'
import { sendOtp } from '@repo/core/api/auth'
import type { AuthAudience } from '@repo/core/api/types'
import { useNow } from '@repo/core/hooks/use-now'
import {
  formatCountdown,
  otpDeadlines,
  otpErrorMessage,
  retryAt as retryMoment,
  secondsUntil,
} from '@repo/core/otp'
import { safeNextPath } from '@repo/core/redirect'

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
  /**
   * A photo to stage the screen on: the form moves into a frosted-glass card
   * over it (AuthStage). Without one, the plain layout.
   */
  backdrop?: string
  /** The heading. The customer app's is the default. */
  title?: string
  /** The line under the heading. */
  subtitle?: string
  /**
   * The line under the button about what happens to a number that is new
   * here: the customer app creates an account, the garage portal starts
   * setting up a garage.
   */
  newNumberNote?: string
  /**
   * Where the legal line at the bottom links. The customer app passes its
   * Terms and Privacy Policy ("By continuing, you agree to our Terms. Our
   * Privacy Policy explains how we use your data."): the Terms are agreed
   * to, the Privacy Policy is a notice, not something bundled into that
   * agreement. The garage portal passes only the Privacy Policy, as an
   * absolute detlio.com URL: the customer Terms are not a garage's agreement,
   * so it gets a line that only points to how data is used. Both open in a
   * new tab, so the number already typed is still there on return. Without
   * either, no line is shown — never words that look like links but are not.
   */
  termsHref?: string
  privacyHref?: string
}

const LEGAL_LINK =
  'underline underline-offset-2 transition-colors hover:text-text-primary rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-white'

/**
 * A link to a legal page, always in a new tab: the number typed so far lives
 * only in this screen's state, and leaving the tab would lose it.
 */
function LegalLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className={LEGAL_LINK}>
      {children}
    </a>
  )
}

/**
 * The OTP login screen, shared by the customer and vendor entry points. Both
 * routes render this so the two can't drift apart again — only the audience,
 * the verify destination and the words differ.
 */
export function PhoneLogin({
  audience,
  verifyHref,
  showBack = true,
  backdrop,
  title = 'Welcome to Detlio',
  subtitle = 'Log in or sign up with your mobile number.',
  newNumberNote = 'New to Detlio? Your account is created when you verify your number.',
  termsHref,
  privacyHref,
}: PhoneLoginProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  // Checked here, where it enters: it is stashed for after the OTP and then
  // handed to router.push, which would follow "//evil.com" off-site.
  const next = safeNextPath(searchParams.get('next')) ?? ''
  const [phone, setPhone] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  // Set when the server refused a send for timing: this number may ask again
  // at this moment. Per number, so typing another one clears it.
  const [retryAt, setRetryAt] = useState<number | null>(null)
  const now = useNow(1000)
  const waitSeconds = retryAt ? secondsUntil(retryAt, now) : 0
  // Once the wait is over the refusal no longer describes anything.
  const shownError = retryAt && waitSeconds === 0 ? '' : error

  const isValid = /^\d{10}$/.test(phone)

  const changePhone = (value: string) => {
    setPhone(value)
    if (retryAt) {
      setRetryAt(null)
      setError('')
    }
  }

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    // The keyboard's Go key submits too, so a second press while the first
    // send is in flight must not fire another OTP.
    if (!isValid || loading || waitSeconds > 0) return
    setLoading(true)
    setError('')
    try {
      const sent = await sendOtp({ phone, audience })
      const { expiresAt, resendAt } = otpDeadlines(Date.now(), sent.expiresInSeconds)
      sessionStorage.setItem('auth_phone', phone)
      sessionStorage.setItem('auth_audience', audience)
      sessionStorage.setItem('auth_purpose', sent.purpose)
      // The verify screen's two clocks, as moments so a reload keeps them.
      sessionStorage.setItem('auth_expires_at', String(expiresAt))
      sessionStorage.setItem('auth_resend_at', String(resendAt))
      // Every send records its own destination — a stale one from an
      // abandoned attempt must not steer a later sign-up.
      if (next) sessionStorage.setItem('auth_next', next)
      else sessionStorage.removeItem('auth_next')
      router.push(verifyHref)
    } catch (err) {
      setError(otpErrorMessage(err, 'Failed to send OTP'))
      setRetryAt(retryMoment(err, Date.now()))
    } finally {
      setLoading(false)
    }
  }

  const header = <AuthHeading title={title} subtitle={subtitle} />

  // A real form, so the keyboard's Go key submits — the CTA can sit under the
  // keyboard on a short phone. The number is the only thing on this screen, so
  // the field is focused on arrival rather than waiting for a tap.
  const form = (
    <form noValidate onSubmit={handleSubmit} className="w-full space-y-4">
      <ScPhoneInput
        value={phone}
        onChange={changePhone}
        tone={backdrop ? 'glass' : 'solid'}
        autoFocus
        enterKeyHint="go"
        errorId={shownError ? 'phone-login-error' : undefined}
      />

      {/* Amber, never red: red on this screen is the Send OTP button. An
          alert, so it is announced when it appears after a failed send.
          Its text never changes while it is up: an alert re-reads itself on
          every change, so a countdown in here would interrupt a screen
          reader once a second. The ticking clock lives on the button. */}
      {shownError && (
        <p id="phone-login-error" role="alert" className="flex items-start gap-1.5 text-[12px] text-error">
          <IconAlertCircle size={14} className="mt-px shrink-0" aria-hidden="true" />
          {shownError}
        </p>
      )}

      {/* The CTA sits muted until a full 10-digit number is entered, and
          while this number has to wait for another code. */}
      <ScButton
        type="submit"
        variant="cta"
        disabled={!isValid || loading || waitSeconds > 0}
        className={
          backdrop
            ? 'disabled:bg-white/10 disabled:hover:bg-white/10'
            : undefined
        }
      >
        {loading ? (
          'Sending...'
        ) : waitSeconds > 0 && waitSeconds < 60 ? (
          // A short wait counts down where the customer will tap next, as
          // the verify screen's Resend button does. The hourly wait is
          // minutes long and is said once, in the alert above.
          <>
            Send OTP in <span className="font-numeric">{formatCountdown(waitSeconds)}</span>
          </>
        ) : (
          'Send OTP'
        )}
      </ScButton>

      {/* One screen signs in and signs up — the OTP flow registers a new
          number — so say so, rather than offer a separate sign-up path. */}
      <p className="text-center text-[13px] leading-5 text-text-secondary">
        {newNumberNote}
      </p>
    </form>
  )

  const terms =
    termsHref && privacyHref ? (
      <p className="pb-2 text-center text-[12px] text-text-muted">
        By continuing, you agree to our <LegalLink href={termsHref}>Terms</LegalLink>.
        <br />
        Our <LegalLink href={privacyHref}>Privacy Policy</LegalLink> explains how we use
        your data.
      </p>
    ) : privacyHref ? (
      <p className="pb-2 text-center text-[12px] text-text-muted">
        How we use your data is set out in our
        <br />
        <LegalLink href={privacyHref}>Privacy Policy</LegalLink>
      </p>
    ) : null

  if (backdrop) {
    return (
      <AuthStage backdrop={backdrop} showBack={showBack} footer={terms}>
        {header}
        <div className="mt-8">{form}</div>
      </AuthStage>
    )
  }

  return (
    <AppShell className="justify-between py-6">
      <TopBar showBack={showBack} />

      <div className="flex flex-1 flex-col justify-center gap-10 pb-16">
        {header}
        {form}
      </div>

      {terms}
    </AppShell>
  )
}
