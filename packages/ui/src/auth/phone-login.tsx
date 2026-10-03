'use client'

import { type FormEvent, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { IconAlertCircle } from '@tabler/icons-react'
import { AuthStage } from '@repo/ui/auth/auth-stage'
import { AppShell } from '@repo/ui/sc/app-shell'
import { BrandMark } from '@repo/ui/sc/brand-mark'
import { ScButton } from '@repo/ui/sc/button'
import { ScPhoneInput } from '@repo/ui/sc/phone-input'
import { TopBar } from '@repo/ui/sc/top-bar'
import { sendOtp } from '@repo/core/api/auth'
import { ApiError } from '@repo/core/api/client'
import type { AuthAudience } from '@repo/core/api/types'
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
}

/**
 * The OTP login screen, shared by the customer and vendor entry points. Both
 * routes render this so the two can't drift apart again — only the audience
 * and the verify destination differ.
 */
export function PhoneLogin({
  audience,
  verifyHref,
  showBack = true,
  backdrop,
}: PhoneLoginProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  // Checked here, where it enters: it is stashed for after the OTP and then
  // handed to router.push, which would follow "//evil.com" off-site.
  const next = safeNextPath(searchParams.get('next')) ?? ''
  const [phone, setPhone] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const isValid = /^\d{10}$/.test(phone)

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    // The keyboard's Go key submits too, so a second press while the first
    // send is in flight must not fire another OTP.
    if (!isValid || loading) return
    setLoading(true)
    setError('')
    try {
      const purpose = await sendOtp({ phone, audience })
      sessionStorage.setItem('auth_phone', phone)
      sessionStorage.setItem('auth_audience', audience)
      sessionStorage.setItem('auth_purpose', purpose)
      // Every send records its own destination — a stale one from an
      // abandoned attempt must not steer a later sign-up.
      if (next) sessionStorage.setItem('auth_next', next)
      else sessionStorage.removeItem('auth_next')
      router.push(verifyHref)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to send OTP')
    } finally {
      setLoading(false)
    }
  }

  const header = (
    <div className="flex flex-col items-center text-center">
      <BrandMark height={36} priority />
      <h1 className="mt-6 text-[28px] font-bold leading-9 tracking-[-0.02em] text-text-primary">
        Welcome to Detlio
      </h1>
      <p className="mt-2 text-balance text-base leading-6 text-text-secondary">
        Log in or sign up with your mobile number.
      </p>
    </div>
  )

  // A real form, so the keyboard's Go key submits — the CTA can sit under the
  // keyboard on a short phone. The number is the only thing on this screen, so
  // the field is focused on arrival rather than waiting for a tap.
  const form = (
    <form noValidate onSubmit={handleSubmit} className="w-full space-y-4">
      <ScPhoneInput
        value={phone}
        onChange={setPhone}
        tone={backdrop ? 'glass' : 'solid'}
        autoFocus
        enterKeyHint="go"
      />

      {/* Amber, never red: red on this screen is the Send OTP button. An
          alert, so it is announced when it appears after a failed send. */}
      {error && (
        <p role="alert" className="flex items-start gap-1.5 text-[12px] text-error">
          <IconAlertCircle size={14} className="mt-px shrink-0" aria-hidden="true" />
          {error}
        </p>
      )}

      {/* The CTA sits muted until a full 10-digit number is entered. */}
      <ScButton
        type="submit"
        variant="cta"
        disabled={!isValid || loading}
        className={
          backdrop
            ? 'disabled:bg-white/10 disabled:hover:bg-white/10'
            : undefined
        }
      >
        {loading ? 'Sending...' : 'Send OTP'}
      </ScButton>

      {/* One screen signs in and signs up — the OTP flow registers a new
          number — so say so, rather than offer a separate sign-up path. */}
      <p className="text-center text-[13px] leading-5 text-text-secondary">
        New to Detlio? Your account is created when you verify your number.
      </p>
    </form>
  )

  const terms = (
    <p className="pb-2 text-center text-[12px] text-text-muted">
      By continuing, you agree to our
      <br />
      <span className="underline">Terms</span> &amp;{' '}
      <span className="underline">Privacy Policy</span>
    </p>
  )

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
