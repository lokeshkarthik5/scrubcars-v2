'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useT } from '@repo/core/i18n'
import { msg } from '@repo/core/i18n/translate'
import { AppShell } from '@repo/ui/sc/app-shell'
import { ScButton } from '@repo/ui/sc/button'
import { ScCard } from '@repo/ui/sc/card'
import { ScInput } from '@repo/ui/sc/input'
import { Chip } from '@repo/ui/sc/chip'
import { useVendorOnboardingStore } from '@repo/core/stores/vendor-onboarding-store'
import { OnboardingHeader } from '@/components/onboarding-header'

// Saved and sent in English (the server keeps the words); shown as `t(y)`.
const YEARS = [
  msg('Under 1 year'),
  msg('1–3 years'),
  msg('3–5 years'),
  msg('5–10 years'),
  msg('10+ years'),
]

export default function VendorOnboardingStep1() {
  const t = useT()
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
  const phone =
    typeof window !== 'undefined'
      ? (sessionStorage.getItem('auth_phone') ?? '')
      : ''

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
        title={t('Business info')}
        subtitle={t('The basics about your garage and who runs it.')}
      />

      <ScCard className="flex flex-col gap-4">
        <ScInput
          label={t('Business name')}
          value={form.businessName}
          onChange={(e) => setForm({ ...form, businessName: e.target.value })}
        />
        <ScInput
          label={t('Owner name')}
          value={form.ownerName}
          onChange={(e) => setForm({ ...form, ownerName: e.target.value })}
        />
        {/* The number just verified: shown, not editable. */}
        <div className="flex flex-col gap-1.5">
          <span className="text-[11px] font-medium text-text-secondary">
            {t('Mobile number')}
          </span>
          <div className="rounded-[10px] border border-border bg-brand-black px-3 py-2.5 font-numeric text-[13px] text-text-muted">
            +91 {phone}
          </div>
        </div>
        <ScInput
          label={t('City')}
          value={form.city}
          onChange={(e) => setForm({ ...form, city: e.target.value })}
        />
        <ScInput
          label={t('WhatsApp number (optional)')}
          inputMode="numeric"
          maxLength={10}
          placeholder={t('10-digit number')}
          className="font-numeric"
          value={form.whatsapp}
          onChange={(e) =>
            setForm({
              ...form,
              whatsapp: e.target.value.replace(/\D/g, '').slice(0, 10),
            })
          }
        />
        <ScInput
          label={t('Email (optional)')}
          type="email"
          value={form.email}
          onChange={(e) => setForm({ ...form, email: e.target.value })}
        />
        <div className="flex flex-col gap-1.5">
          <span className="text-[11px] font-medium text-text-secondary">
            {t('Years in operation (optional)')}
          </span>
          <div className="flex flex-wrap gap-2">
            {YEARS.map((y) => (
              <Chip
                key={y}
                label={t(y)}
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
        variant="main"
        size="lg"
        className="mt-auto mb-4"
        disabled={
          !form.businessName || !form.ownerName || !form.city || loading
        }
        onClick={handleContinue}
      >
        {t('Continue')}
      </ScButton>
    </AppShell>
  )
}
