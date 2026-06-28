'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { AppShell } from '@/components/sc/app-shell'
import { ScButton } from '@/components/sc/button'
import { ScInput } from '@/components/sc/input'
import { ProgressBar } from '@/components/sc/progress-bar'
import { submitVendorOnboarding } from '@/lib/api/vendors'

export default function VendorOnboardingStep1() {
  const router = useRouter()
  const [form, setForm] = useState({
    businessName: '',
    ownerName: '',
    city: '',
  })
  const [loading, setLoading] = useState(false)
  const phone = typeof window !== 'undefined' ? sessionStorage.getItem('auth_phone') ?? '9876543210' : ''

  const handleContinue = async () => {
    setLoading(true)
    try {
      await submitVendorOnboarding(1, form)
      router.push('/vendor/onboarding/step-2')
    } finally {
      setLoading(false)
    }
  }

  return (
    <AppShell className="gap-5 py-4">
      <ProgressBar progress={25} />
      <p className="text-[11px] text-text-secondary">Step 1 of 4 — Business info</p>

      <div className="flex flex-1 flex-col gap-4">
        <ScInput
          label="Business name"
          value={form.businessName}
          onChange={(e) => setForm({ ...form, businessName: e.target.value })}
        />
        <ScInput
          label="Owner name"
          value={form.ownerName}
          onChange={(e) => setForm({ ...form, ownerName: e.target.value })}
        />
        <div className="flex flex-col gap-1.5">
          <label className="text-[11px] font-medium text-text-secondary">Mobile number</label>
          <div className="rounded-[10px] border border-border bg-brand-black px-3 py-2.5 text-[13px] text-text-muted">
            +91 {phone}
          </div>
        </div>
        <ScInput
          label="City"
          value={form.city}
          onChange={(e) => setForm({ ...form, city: e.target.value })}
        />
      </div>

      <ScButton
        className="mb-4"
        disabled={!form.businessName || !form.ownerName || !form.city || loading}
        onClick={handleContinue}
      >
        Continue
      </ScButton>
    </AppShell>
  )
}
