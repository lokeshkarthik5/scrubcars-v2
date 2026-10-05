'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { AppShell } from '@repo/ui/sc/app-shell'
import { ScButton } from '@repo/ui/sc/button'
import { ScCard } from '@repo/ui/sc/card'
import { ScInput, ScTextarea } from '@repo/ui/sc/input'
import { SectionHeader } from '@repo/ui/sc/section-header'
import {
  LocationPicker,
  type PickedLocation,
} from '@repo/ui/features/location-picker'
import { submitVendorOnboarding } from '@repo/core/api/vendors'
import { toast } from 'react-toastify'
import { useVendorOnboardingStore } from '@repo/core/stores/vendor-onboarding-store'
import { OnboardingHeader } from '@/components/onboarding-header'

export default function VendorOnboardingStep2() {
  const router = useRouter()
  const onboarding = useVendorOnboardingStore()
  const update = useVendorOnboardingStore((s) => s.update)
  const [address, setAddress] = useState(onboarding.address)
  const [pincode, setPincode] = useState(onboarding.pincode)
  const [city, setCity] = useState(onboarding.city)
  const [mapsUrl, setMapsUrl] = useState(onboarding.mapsUrl)
  const [loading, setLoading] = useState(false)
  const [pin, setPin] = useState<PickedLocation | null>(
    onboarding.lat && onboarding.lng
      ? {
          lat: onboarding.lat,
          lng: onboarding.lng,
          address: onboarding.address,
          city: onboarding.city,
          pincode: onboarding.pincode,
          source: 'map_pin',
        }
      : null
  )

  /**
   * The pin is the source of truth for coordinates; the text fields are for
   * humans. So a placement prefills the address, pincode and city — and then
   * leaves them editable, because an owner's own wording ("opposite the Indian
   * Oil pump, 2nd lane") beats any geocoder's for a customer trying to find the
   * gate. Only fields the owner has not already filled get overwritten.
   */
  const handlePick = (picked: PickedLocation) => {
    setPin(picked)
    if (picked.address && !address.trim()) setAddress(picked.address)
    if (picked.pincode) setPincode(picked.pincode)
    if (picked.city) setCity(picked.city)
  }

  const handleContinue = async () => {
    if (!pin) {
      toast.error('Set your garage location on the map')
      return
    }
    if (!/^\d{6}$/.test(pincode)) {
      toast.error('Enter a valid 6-digit pincode')
      return
    }
    setLoading(true)
    try {
      update({ address, pincode, city, mapsUrl, lat: pin.lat, lng: pin.lng })
      await submitVendorOnboarding(2, {
        businessName: onboarding.businessName,
        phone: onboarding.phone,
        address,
        city,
        pincode,
        lat: pin.lat,
        lng: pin.lng,
        geoSource: pin.source,
        whatsapp: onboarding.whatsapp,
        email: onboarding.email,
        yearsInOperation: onboarding.yearsInOperation,
        mapsUrl,
      })
      router.push('/onboarding/step-3')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <AppShell className="gap-5 py-4">
      <OnboardingHeader step={2} title="Your garage location" backHref="/onboarding/step-1" />

      <section className="flex flex-col gap-3">
        <SectionHeader
          title="Pin your garage"
          subtitle="This is how customers find you and how we work out who is nearby, so place it exactly at your gate."
        />
        <LocationPicker
          value={pin ? { lat: pin.lat, lng: pin.lng } : null}
          onChange={handlePick}
          expectedCity={city}
        />
      </section>

      <ScCard className="flex flex-col gap-4">
        <ScTextarea
          label="Full address"
          rows={3}
          value={address}
          onChange={(e) => setAddress(e.target.value)}
        />

        <ScInput
          label="City"
          value={city}
          onChange={(e) => setCity(e.target.value)}
        />

        <ScInput
          label="Pincode"
          inputMode="numeric"
          maxLength={6}
          placeholder="600001"
          className="font-numeric"
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
      </ScCard>

      <ScButton
        className="mt-auto mb-4"
        disabled={!pin || !address.trim() || !city.trim() || pincode.length !== 6 || loading}
        onClick={handleContinue}
      >
        Continue
      </ScButton>
    </AppShell>
  )
}
