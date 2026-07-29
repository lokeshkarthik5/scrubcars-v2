'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { AppShell } from '@/components/sc/app-shell'
import { ScButton } from '@/components/sc/button'
import { ScInput, ScTextarea } from '@/components/sc/input'
import { ProgressBar } from '@/components/sc/progress-bar'
import { TopBar } from '@/components/sc/top-bar'
import { submitVendorOnboarding } from '@/lib/api/vendors'
import { toast } from 'react-toastify'
import { useVendorOnboardingStore } from '@/lib/stores/vendor-onboarding-store'

export default function VendorOnboardingStep2() {
  const router = useRouter()
  const onboarding = useVendorOnboardingStore()
  const update = useVendorOnboardingStore((s) => s.update)
  const [address, setAddress] = useState(onboarding.address)
  const [pincode, setPincode] = useState(onboarding.pincode)
  const [mapsUrl, setMapsUrl] = useState(onboarding.mapsUrl)
  const [loading, setLoading] = useState(false)

  const handleContinue = async () => {
    if (!/^\d{6}$/.test(pincode)) {
      toast.error('Enter a valid 6-digit pincode')
      return
    }
    setLoading(true)
    try {
      update({ address, pincode, mapsUrl })
      await submitVendorOnboarding(2, {
        businessName: onboarding.businessName,
        phone: onboarding.phone,
        address,
        city: onboarding.city,
        pincode,
        lat: onboarding.lat,
        lng: onboarding.lng,
        whatsapp: onboarding.whatsapp,
        email: onboarding.email,
        yearsInOperation: onboarding.yearsInOperation,
        mapsUrl,
      })
      router.push('/vendor/onboarding/step-3')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save. Please try again.')
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

      <ScInput
        label="Pincode"
        inputMode="numeric"
        maxLength={6}
        placeholder="600001"
        value={pincode}
        onChange={(e) => setPincode(e.target.value.replace(/\D/g, '').slice(0, 6))}
      />

      <ScInput
        label="Google Maps link (optional)"
        inputMode="url"
        placeholder="https://maps.app.goo.gl/…"
        value={mapsUrl}
        onChange={(e) => setMapsUrl(e.target.value)}
      />

      <ScButton className="mt-auto mb-4" disabled={!address.trim() || pincode.length !== 6 || loading} onClick={handleContinue}>
        Continue
      </ScButton>
    </AppShell>
  )
}
