'use client'

import { type FormEvent, Suspense, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { AuthStage } from '@repo/ui/auth/auth-stage'
import { ScButton } from '@repo/ui/sc/button'
import { ScInput } from '@repo/ui/sc/input'
import { updateProfile } from '@repo/core/api/users'
import { safeNextPath } from '@repo/core/redirect'
import { useAuthStore } from '@repo/core/stores/auth-store'
import { useUserStore } from '@repo/core/stores/user-store'
import { toast } from 'react-toastify'

/**
 * The last step of signing up: a name, and nothing else.
 *
 * It used to ask for a street address and city too, with the button locked
 * until all three were filled — before a customer had booked anything, and
 * whether or not they would ever need one. Only doorstep bookings do, and
 * checkout asks for an address at that point (book/[vendorId]), pin included.
 * Asking here also prompted for location cold, straight after the OTP, and
 * saved 0,0 as the pin whenever that was refused — which then passed
 * checkout's "has a pin" check and failed on the server at payment.
 *
 * `next` is where the customer was going when sign-in interrupted them,
 * usually the booking they started as a guest. Losing it here sent every new
 * customer to Home with an empty cart.
 */
function ProfileSetupForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  // Checked again here rather than trusted from verify-otp: this URL can be
  // crafted as easily as the login one.
  const next = safeNextPath(searchParams.get('next'))
  const [name, setName] = useState('')
  const [loading, setLoading] = useState(false)

  const canSubmit = name.trim().length > 0

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    if (!canSubmit || loading) return
    const trimmed = name.trim()
    setLoading(true)
    try {
      const profile = await updateProfile({ name: trimmed })
      // The placeholder name 'User' is what app-provider reads as "profile
      // incomplete", so the session has to see the real one before leaving —
      // otherwise /book bounces straight back here.
      useAuthStore.setState((s) => ({
        user: s.user ? { ...s.user, name: profile.name } : s.user,
      }))
      // A profile cached before setup (a visit to /profile) would still say
      // 'User', and checkout prefills the payment sheet from it.
      useUserStore.setState((s) => ({
        profile: s.profile ? { ...s.profile, name: profile.name } : s.profile,
      }))
      // Replace, not push: Back from the booking should not land on a form
      // that has already been filled in.
      router.replace(next ?? '/home?welcome=1')
      // Left loading on success — the button stays disabled until the next
      // page takes over, so a second tap cannot resubmit.
    } catch (err) {
      console.log('[profile-setup] submit failed:', err)
      toast.error(err instanceof Error ? err.message : 'Something went wrong')
      setLoading(false)
    }
  }

  const cta = next?.startsWith('/book/')
    ? 'Continue to booking'
    : next
      ? 'Continue'
      : 'Get started'

  return (
    // No back arrow: behind this is the OTP screen, which a signed-in
    // customer is only redirected away from.
    <AuthStage backdrop="/onboarding-car.jpg" showBack={false}>
      <form noValidate onSubmit={handleSubmit} className="flex flex-col">
        <div className="text-center">
          <h1 className="text-[28px] font-bold leading-9 tracking-[-0.02em] text-text-primary">
            What&apos;s your name?
          </h1>
          <p className="mt-2 text-balance text-base leading-6 text-text-secondary">
            The garage sees it on your booking.
          </p>
        </div>

        <div className="mt-8">
          <ScInput
            id="profile-name"
            label="Full name"
            placeholder="Your name"
            autoComplete="name"
            autoCapitalize="words"
            autoFocus
            enterKeyHint="go"
            maxLength={255}
            value={name}
            onChange={(e) => setName(e.target.value)}
            // The glass card's field, as ScPhoneInput's `glass` tone draws it:
            // a solid surface would read as a hole in the frosted card. 16px
            // is the body size.
            className="rounded-[12px] border-white/15 bg-white/[0.06] px-3.5 py-3.5 text-[16px]"
          />
        </div>

        <ScButton
          type="submit"
          variant="cta"
          disabled={!canSubmit || loading}
          className="mt-6 disabled:bg-white/10 disabled:hover:bg-white/10"
        >
          {loading ? 'Saving...' : cta}
        </ScButton>

        <p className="mt-4 text-center text-[13px] leading-5 text-text-secondary">
          We&apos;ll ask for an address only if you book a doorstep service.
        </p>
      </form>
    </AuthStage>
  )
}

export default function ProfileSetupPage() {
  return (
    <Suspense>
      <ProfileSetupForm />
    </Suspense>
  )
}
