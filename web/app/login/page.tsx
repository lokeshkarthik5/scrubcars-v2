'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { IconDroplet } from '@tabler/icons-react'
import { AppShell } from '@/components/sc/app-shell'
import { ScButton } from '@/components/sc/button'
import { ScInput } from '@/components/sc/input'
import { sendOtp } from '@/lib/api/auth'

export default function LoginPage() {
  const router = useRouter()
  const [phone, setPhone] = useState('')
  const [loading, setLoading] = useState(false)

  const isValid = /^\d{10}$/.test(phone)

  const handleSubmit = async () => {
    if (!isValid) return
    setLoading(true)
    try {
      await sendOtp({ phone })
      sessionStorage.setItem('auth_phone', phone)
      router.push('/verify-otp')
    } finally {
      setLoading(false)
    }
  }

  return (
    <AppShell className="justify-between py-8">
      <div className="flex flex-1 flex-col items-center justify-center gap-8">
        <div className="flex flex-col items-center gap-2">
          <IconDroplet size={40} className="text-brand-red" />
          <h1 className="text-[22px] font-semibold text-text-primary">Scrub Cars</h1>
          <p className="text-[13px] text-text-secondary">Car care at your doorstep</p>
        </div>

        <div className="w-full space-y-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-[11px] font-medium text-text-secondary">Mobile number</label>
            <div className="flex overflow-hidden rounded-[10px] border border-border bg-surface focus-within:border-brand-red">
              <span className="flex items-center border-r border-border px-3 text-[13px] text-text-secondary">
                +91
              </span>
              <input
                type="tel"
                inputMode="numeric"
                maxLength={10}
                placeholder="98765 43210"
                value={phone}
                onChange={(e) => setPhone(e.target.value.replace(/\D/g, ''))}
                className="flex-1 bg-transparent px-3 py-2.5 text-[13px] text-text-primary outline-none"
              />
            </div>
          </div>

          <ScButton disabled={!isValid || loading} onClick={handleSubmit}>
            {loading ? 'Sending...' : 'Send OTP'}
          </ScButton>
        </div>
      </div>

      <p className="pb-4 text-center text-[11px] text-text-muted">
        By continuing you agree to our Terms &amp; Privacy Policy
      </p>
    </AppShell>
  )
}
