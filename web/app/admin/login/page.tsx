'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { AppShell } from '@/components/sc/app-shell'
import { BrandMark } from '@/components/sc/brand-mark'
import { ScButton } from '@/components/sc/button'
import { ScInput } from '@/components/sc/input'
import { adminLogin } from '@/lib/api/admin'
import { ApiError } from '@/lib/api/client'

export default function AdminLoginPage() {
  const router = useRouter()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const isValid = username.trim().length > 0 && password.length > 0

  const handleSubmit = async () => {
    if (!isValid) return
    setLoading(true)
    setError('')
    try {
      await adminLogin(username.trim(), password)
      router.replace('/admin/vendors')
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to sign in')
    } finally {
      setLoading(false)
    }
  }

  return (
    <AppShell className="justify-between py-8">
      <div className="flex flex-1 flex-col items-center justify-center gap-8">
        <div className="flex flex-col items-center gap-2">
          <BrandMark height={64} priority className="mb-2" />
          <p className="text-[13px] text-text-secondary">Admin panel</p>
        </div>

        <div className="w-full space-y-4">
          <ScInput
            id="admin-username"
            label="Username"
            type="text"
            autoComplete="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />
          <ScInput
            id="admin-password"
            label="Password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
          />
          {error && <p className="text-[12px] text-brand-red">{error}</p>}
          <ScButton variant="cta" disabled={!isValid || loading} onClick={handleSubmit}>
            {loading ? 'Signing in...' : 'Sign in'}
          </ScButton>
        </div>
      </div>
    </AppShell>
  )
}
