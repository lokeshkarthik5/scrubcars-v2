'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { IconDroplet } from '@tabler/icons-react'
import { ScButton } from '@/components/sc/button'
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
      setError(
        err instanceof ApiError ? err.message : 'Failed to sign in'
      )
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-brand-black px-4">
      <div className="w-full max-w-[360px] space-y-8">
        <div className="flex flex-col items-center gap-2">
          <IconDroplet size={40} className="text-brand-red" />
          <h1 className="text-[22px] font-semibold text-text-primary">Scrub Cars</h1>
          <p className="text-[13px] text-text-secondary">Admin panel</p>
        </div>

        <div className="space-y-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-[11px] font-medium text-text-secondary">Username</label>
            <input
              type="text"
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="rounded-[10px] border border-border bg-surface px-3 py-2.5 text-[13px] text-text-primary outline-none focus:border-brand-red"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-[11px] font-medium text-text-secondary">Password</label>
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
              className="rounded-[10px] border border-border bg-surface px-3 py-2.5 text-[13px] text-text-primary outline-none focus:border-brand-red"
            />
          </div>
          {error && <p className="text-[12px] text-brand-red">{error}</p>}
          <ScButton disabled={!isValid || loading} onClick={handleSubmit}>
            {loading ? 'Signing in...' : 'Sign in'}
          </ScButton>
        </div>
      </div>
    </div>
  )
}
