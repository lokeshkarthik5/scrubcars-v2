'use client'

import { type FormEvent, useState } from 'react'
import { useRouter } from 'next/navigation'
import { IconAlertCircle } from '@tabler/icons-react'
import { AuthHeading, AuthStage } from '@repo/ui/auth/auth-stage'
import { ScButton } from '@repo/ui/sc/button'
import { ScInput } from '@repo/ui/sc/input'
import { adminLogin } from '@repo/core/api/admin'
import { ApiError } from '@repo/core/api/client'

export default function AdminLoginPage() {
  const router = useRouter()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const isValid = username.trim().length > 0 && password.length > 0

  const handleSubmit = async (event?: FormEvent) => {
    event?.preventDefault()
    // Enter submits from either field now; a second press while the first
    // sign-in is in flight must not send another.
    if (!isValid || loading) return
    setLoading(true)
    setError('')
    try {
      await adminLogin(username.trim(), password)
      router.replace('/vendors')
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to sign in')
    } finally {
      setLoading(false)
    }
  }

  // The customer app's glass stage, so the team's door looks like the rest of
  // the product. A real form, so Enter signs in and the browser offers to
  // keep the password.
  return (
    <AuthStage backdrop="/onboarding-car.jpg">
      <AuthHeading title="Detlio admin" subtitle="Team sign-in" />

      <form noValidate onSubmit={handleSubmit} className="mt-8 w-full space-y-4">
        <ScInput
          id="admin-username"
          label="Username"
          type="text"
          tone="glass"
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          autoFocus
          value={username}
          onChange={(e) => setUsername(e.target.value)}
        />
        <ScInput
          id="admin-password"
          label="Password"
          type="password"
          tone="glass"
          autoComplete="current-password"
          enterKeyHint="go"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />

        {/* Amber, never red: red on this screen is the Sign in button. An
            alert, so it is read out when a sign-in is refused. */}
        {error && (
          <p role="alert" className="flex items-start gap-1.5 text-[12px] text-error">
            <IconAlertCircle size={14} className="mt-px shrink-0" aria-hidden="true" />
            {error}
          </p>
        )}

        <ScButton
          type="submit"
          variant="cta"
          disabled={!isValid || loading}
          className="disabled:bg-white/10 disabled:hover:bg-white/10"
        >
          {loading ? 'Signing in...' : 'Sign in'}
        </ScButton>
      </form>
    </AuthStage>
  )
}
