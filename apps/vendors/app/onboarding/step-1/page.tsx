'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { AppShell } from '@repo/ui/sc/app-shell'
import { ScButton } from '@repo/ui/sc/button'
import { ScCard } from '@repo/ui/sc/card'
import { ScInput } from '@repo/ui/sc/input'
import { Chip } from '@repo/ui/sc/chip'
import { useVendorOnboardingStore } from '@repo/core/stores/vendor-onboarding-store'
import { OnboardingHeader } from '@/components/onboarding-header'

const YEARS = ['Under 1 year', '1–3 years', '3–5 years', '5–10 years', '10+ years']

export default function VendorOnboardingStep1() {
  const router = useRouter()
  const update = useVendorOnboardingStore((s) => s.update)
  const [form, setForm] = useState({
    businessName: '',
    ownerName: '',
    city: '',
    whatsapp: '',
    email: '',
    yearsInOperation: '',
  })
  const [loading, setLoading] = useState(false)
  const phone = typeof window !== 'undefined' ? sessionStorage.getItem('auth_phone') ?? '' : ''

  const handleContinue = async () => {
    setLoading(true)
    try {
      update({
        businessName: form.businessName,
        ownerName: form.ownerName,
        city: form.city,
        whatsapp: form.whatsapp,
        email: form.email,
        yearsInOperation: form.yearsInOperation,
        phone,
      })
      router.push('/onboarding/step-2')
    } finally {
      setLoading(false)
    }
  }

  return (
    <AppShell className="gap-5 py-4">
      <OnboardingHeader
        step={1}
        title="Business info"
        subtitle="The basics about your garage and who runs it."
      />

      <ScCard className="flex flex-col gap-4">
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
        {/* The number just verified: shown, not editable. */}
        <div className="flex flex-col gap-1.5">
          <span className="text-[11px] font-medium text-text-secondary">Mobile number</span>
          <div className="rounded-[10px] border border-border bg-brand-black px-3 py-2.5 font-numeric text-[13px] text-text-muted">
            +91 {phone}
          </div>
        </div>
        <ScInput
          label="City"
          value={form.city}
          onChange={(e) => setForm({ ...form, city: e.target.value })}
        />
        <ScInput
          label="WhatsApp number (optional)"
          inputMode="numeric"
          maxLength={10}
          placeholder="10-digit number"
          className="font-numeric"
          value={form.whatsapp}
          onChange={(e) =>
            setForm({ ...form, whatsapp: e.target.value.replace(/\D/g, '').slice(0, 10) })
          }
        />
        <ScInput
          label="Email (optional)"
          type="email"
          value={form.email}
          onChange={(e) => setForm({ ...form, email: e.target.value })}
        />
        <div className="flex flex-col gap-1.5">
          <span className="text-[11px] font-medium text-text-secondary">
            Years in operation (optional)
          </span>
          <div className="flex flex-wrap gap-2">
            {YEARS.map((y) => (
              <Chip
                key={y}
                label={y}
                selected={form.yearsInOperation === y}
                onClick={() =>
                  setForm({
                    ...form,
                    yearsInOperation: form.yearsInOperation === y ? '' : y,
                  })
                }
              />
            ))}
          </div>
        </div>
      </ScCard>

      <ScButton
        className="mt-auto mb-4"
        disabled={!form.businessName || !form.ownerName || !form.city || loading}
        onClick={handleContinue}
      >
        Continue
      </ScButton>
    </AppShell>
  )
}
