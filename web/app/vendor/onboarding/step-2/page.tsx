'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { AppShell } from '@/components/sc/app-shell'
import { ScButton } from '@/components/sc/button'
import { ScTextarea } from '@/components/sc/input'
import { ProgressBar } from '@/components/sc/progress-bar'
import { TopBar } from '@/components/sc/top-bar'
import { submitVendorOnboarding } from '@/lib/api/vendors'
import { useVendorOnboardingStore } from '@/lib/stores/vendor-onboarding-store'

export default function VendorOnboardingStep2() {
  const router = useRouter()
  const onboarding = useVendorOnboardingStore()
  const update = useVendorOnboardingStore((s) => s.update)
  const [address, setAddress] = useState(onboarding.address)
  const [loading, setLoading] = useState(false)

  const handleContinue = async () => {
    setLoading(true)
    try {
      update({ address })
      await submitVendorOnboarding(2, {
        businessName: onboarding.businessName,
        phone: onboarding.phone,
        address,
        city: onboarding.city,
        lat: onboarding.lat,
        lng: onboarding.lng,
      })
      router.push('/vendor/onboarding/step-3')
    } finally {
      setLoading(false)
    }
  }

  return (
    <AppShell className="gap-5 py-4">
      <TopBar showBack backHref="/vendor/onboarding/step-1" />
      <ProgressBar progress={50} />
      <p className="text-[11px] text-text-secondary">Step 2 of 4 — Your garage location</p>

      <ScTextarea
        label="Full address"
        rows={3}
        value={address}
        onChange={(e) => setAddress(e.target.value)}
      />

      <ScButton className="mt-auto mb-4" disabled={!address.trim() || loading} onClick={handleContinue}>
        Continue
      </ScButton>
    </AppShell>
  )
}
