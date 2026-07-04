'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { AppShell } from '@/components/sc/app-shell'
import { ScButton } from '@/components/sc/button'
import { ScCard } from '@/components/sc/card'
import { ScInput } from '@/components/sc/input'
import { Chip } from '@/components/sc/chip'
import { ProgressBar } from '@/components/sc/progress-bar'
import { TopBar } from '@/components/sc/top-bar'
import { createService } from '@/lib/api/services'
import { createServiceArea } from '@/lib/api/vendors'
import { useAuthStore } from '@/lib/stores/auth-store'
import { useVendorOnboardingStore } from '@/lib/stores/vendor-onboarding-store'
import type { ServiceCategory } from '@/lib/types'

const CATEGORIES: { value: ServiceCategory; label: string }[] = [
  { value: 'car_wash', label: 'Car wash' },
  { value: 'detailing', label: 'Detailing' },
  { value: 'coating', label: 'Coating' },
  { value: 'scratch_removal', label: 'Scratch removal' },
]

const DURATIONS = [30, 45, 60, 90, 120, 180]

export default function VendorOnboardingStep4() {
  const router = useRouter()
  const onboarding = useVendorOnboardingStore()
  const fetchSession = useAuthStore((s) => s.fetchSession)
  const resetForm = useVendorOnboardingStore((s) => s.resetForm)
  const markComplete = useVendorOnboardingStore((s) => s.markComplete)
  const [name, setName] = useState('')
  const [category, setCategory] = useState<ServiceCategory>('car_wash')
  const [price, setPrice] = useState('')
  const [duration, setDuration] = useState(30)
  const [pincode, setPincode] = useState('')
  const [addedCount, setAddedCount] = useState(0)
  const [pincodes, setPincodes] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [addingPincode, setAddingPincode] = useState(false)
  const [finishing, setFinishing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleAddService = async () => {
    if (!name || !price) return
    setLoading(true)
    setError(null)
    try {
      await createService({
        name,
        category,
        price: Number(price),
        durationMins: duration,
        isActive: true,
      })
      setAddedCount((count) => count + 1)
      setName('')
      setPrice('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add service')
    } finally {
      setLoading(false)
    }
  }

  const handleAddPincode = async () => {
    if (!/^\d{6}$/.test(pincode)) {
      setError('Enter a valid 6-digit pincode')
      return
    }
    if (pincodes.includes(pincode)) {
      setError('This pincode is already added')
      return
    }

    setAddingPincode(true)
    setError(null)
    try {
      await createServiceArea({
        areaName: onboarding.city || 'Service area',
        pincode,
      })
      setPincodes((current) => [...current, pincode])
      setPincode('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add pincode')
    } finally {
      setAddingPincode(false)
    }
  }

  const handleFinish = async () => {
    setFinishing(true)
    setError(null)
    try {
      await fetchSession()
      markComplete()
      resetForm()
      router.replace('/vendor/home')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to finish onboarding')
    } finally {
      setFinishing(false)
    }
  }

  return (
    <AppShell className="gap-5 py-4">
      <TopBar showBack backHref="/vendor/onboarding/step-3" />
      <ProgressBar progress={100} />
      <p className="text-[11px] text-text-secondary">Step 4 of 4 — Add a service</p>

      <ScInput label="Service name" value={name} onChange={(e) => setName(e.target.value)} />

      <section>
        <label className="mb-2 block text-[11px] font-medium text-text-secondary">Category</label>
        <div className="flex flex-wrap gap-2">
          {CATEGORIES.map((c) => (
            <Chip
              key={c.value}
              label={c.label}
              selected={category === c.value}
              onClick={() => setCategory(c.value)}
            />
          ))}
        </div>
      </section>

      <ScInput
        label="Price (₹)"
        type="number"
        value={price}
        onChange={(e) => setPrice(e.target.value)}
      />

      <section>
        <label className="mb-2 block text-[11px] font-medium text-text-secondary">Duration</label>
        <div className="flex flex-wrap gap-2">
          {DURATIONS.map((d) => (
            <Chip key={d} label={`${d} min`} selected={duration === d} onClick={() => setDuration(d)} />
          ))}
        </div>
      </section>

      <ScButton disabled={!name || !price || loading} onClick={handleAddService}>
        {loading ? 'Adding...' : 'Add service'}
      </ScButton>

      {addedCount > 0 && (
        <p className="text-[12px] text-text-secondary">
          {addedCount} service{addedCount === 1 ? '' : 's'} added.
        </p>
      )}

      <section>
        <h2 className="mb-1 text-sm font-semibold text-text-primary">Service pincodes</h2>
        <p className="mb-2 text-[11px] text-text-secondary">
          Add pincodes where customers can find your garage.
        </p>
        <div className="flex gap-2">
          <ScInput
            label="Pincode"
            inputMode="numeric"
            maxLength={6}
            value={pincode}
            onChange={(e) => setPincode(e.target.value.replace(/\D/g, '').slice(0, 6))}
          />
          <ScButton
            className="mt-5 h-[42px] shrink-0"
            variant="secondary"
            fullWidth={false}
            disabled={pincode.length !== 6 || addingPincode}
            onClick={handleAddPincode}
          >
            {addingPincode ? 'Adding...' : 'Add'}
          </ScButton>
        </div>
        {pincodes.length > 0 ? (
          <div className="mt-2 flex flex-wrap gap-2">
            {pincodes.map((code) => (
              <ScCard key={code} className="px-3 py-2 text-[12px] font-medium">
                {code}
              </ScCard>
            ))}
          </div>
        ) : (
          <p className="mt-2 text-[12px] text-text-secondary">0 pincodes added</p>
        )}
      </section>

      {error && <p className="text-[12px] text-brand-red">{error}</p>}

      <div className="mt-auto flex flex-col gap-2 pb-4">
        <ScButton disabled={finishing} onClick={handleFinish}>
          {finishing ? 'Opening dashboard...' : 'Go to dashboard'}
        </ScButton>
      </div>
    </AppShell>
  )
}
