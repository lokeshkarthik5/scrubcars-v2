'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { IconCheck, IconCurrentLocation, IconMapPin } from '@tabler/icons-react'
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
  const [confirmed, setConfirmed] = useState(false)
  const [loading, setLoading] = useState(false)
  const [detecting, setDetecting] = useState(false)
  const [locationError, setLocationError] = useState<string | null>(null)
  const [detectedLocation, setDetectedLocation] = useState<{
    lat: number
    lng: number
  } | null>(null)

  const handleDetectGps = () => {
    setLocationError(null)

    if (!navigator.geolocation) {
      setLocationError('GPS is not supported by this browser.')
      return
    }

    setDetecting(true)
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const coords = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        }

        setDetectedLocation(coords)
        setConfirmed(true)
        update(coords)
        setDetecting(false)
      },
      () => {
        setLocationError('Unable to detect location. Please allow GPS access and try again.')
        setConfirmed(false)
        setDetecting(false)
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 60000,
      }
    )
  }

  const handleContinue = async () => {
    setLoading(true)
    try {
      const lat = detectedLocation?.lat ?? onboarding.lat
      const lng = detectedLocation?.lng ?? onboarding.lng

      update({ address, lat, lng })
      await submitVendorOnboarding(2, {
        businessName: onboarding.businessName,
        phone: onboarding.phone,
        address,
        city: onboarding.city,
        lat,
        lng,
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

      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => setLocationError('Map picker is not available yet. Use Detect GPS for now.')}
          className="flex items-center justify-center gap-2 rounded-[10px] border border-border bg-surface py-3 text-[12px] font-medium text-text-primary"
        >
          <IconMapPin size={16} />
          Pin on map
        </button>
        <button
          type="button"
          onClick={handleDetectGps}
          disabled={detecting}
          className="flex items-center justify-center gap-2 rounded-[10px] border border-border bg-surface py-3 text-[12px] font-medium text-brand-red"
        >
          <IconCurrentLocation size={16} />
          {detecting ? 'Detecting...' : 'Detect GPS'}
        </button>
      </div>

      {locationError && (
        <p className="text-[12px] text-brand-red">{locationError}</p>
      )}

      {confirmed && (
        <div className="flex items-center justify-between rounded-[10px] border border-brand-red bg-surface px-3 py-2.5">
          <span className="text-[13px] text-brand-red">
            GPS detected
            {detectedLocation
              ? ` (${detectedLocation.lat.toFixed(5)}, ${detectedLocation.lng.toFixed(5)})`
              : ''}
          </span>
          <IconCheck size={18} className="text-brand-red" />
        </div>
      )}

      <ScButton className="mt-auto mb-4" disabled={!address || !confirmed || loading} onClick={handleContinue}>
        Continue
      </ScButton>
    </AppShell>
  )
}
