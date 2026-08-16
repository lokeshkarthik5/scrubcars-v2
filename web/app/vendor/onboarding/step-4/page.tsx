'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { AppShell } from '@/components/sc/app-shell'
import { ScButton } from '@/components/sc/button'
import { ScInput } from '@/components/sc/input'
import { Chip } from '@/components/sc/chip'
import { ProgressBar } from '@/components/sc/progress-bar'
import { TopBar } from '@/components/sc/top-bar'
import { createService } from '@/lib/api/services'
import { updateVendorSettings } from '@/lib/api/vendors'
import { useAuthStore } from '@/lib/stores/auth-store'
import { useVendorOnboardingStore } from '@/lib/stores/vendor-onboarding-store'
import type { ServiceCategory } from '@/lib/types'
import { SERVICE_CATEGORY_OPTIONS } from '@/lib/categories'

const CATEGORIES = SERVICE_CATEGORY_OPTIONS

// Quick-add presets — each prefills the service name + maps to a category.
const SERVICE_PRESETS: { name: string; category: ServiceCategory }[] = [
  { name: 'Exterior / foam wash', category: 'car_wash' },
  { name: 'Interior cleaning & vacuum', category: 'detailing' },
  { name: 'Full detailing', category: 'detailing' },
  { name: 'Ceramic / paint protection', category: 'coating' },
  { name: 'Polishing & buffing', category: 'detailing' },
  { name: 'Denting & painting', category: 'scratch_removal' },
  { name: 'General / periodic service', category: 'others' },
  { name: 'AC service & repair', category: 'others' },
  { name: 'Battery service', category: 'others' },
  { name: 'Windshield & glass', category: 'others' },
  { name: 'EV servicing', category: 'others' },
]

const VEHICLE_TYPES = [
  'Hatchback',
  'Sedan',
  'SUV / MUV',
  'Luxury / Premium',
  'Electric (EV)',
  'Commercial / Van',
]

const DURATIONS = [30, 45, 60, 90, 120, 180]

export default function VendorOnboardingStep4() {
  const router = useRouter()
  const fetchSession = useAuthStore((s) => s.fetchSession)
  const resetForm = useVendorOnboardingStore((s) => s.resetForm)
  const markComplete = useVendorOnboardingStore((s) => s.markComplete)
  const vehicleTypes = useVendorOnboardingStore((s) => s.vehicleTypes)
  const update = useVendorOnboardingStore((s) => s.update)
  const [name, setName] = useState('')
  const [category, setCategory] = useState<ServiceCategory>('car_wash')
  const [price, setPrice] = useState('')
  const [duration, setDuration] = useState(30)
  const [addedCount, setAddedCount] = useState(0)
  const [loading, setLoading] = useState(false)
  const [finishing, setFinishing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const applyPreset = (preset: { name: string; category: ServiceCategory }) => {
    setName(preset.name)
    setCategory(preset.category)
  }

  const toggleVehicleType = (type: string) =>
    update({
      vehicleTypes: vehicleTypes.includes(type)
        ? vehicleTypes.filter((t) => t !== type)
        : [...vehicleTypes, type],
    })

  const handleAddService = async () => {
    if (!name || !price) return
    setLoading(true)
    setError(null)
    try {
      // Quick-add uses flat pricing; the vendor can switch a service to
      // per-vehicle / from / on-inspection later in the Services page.
      await createService({
        name,
        category,
        pricingType: 'flat',
        price: Number(price),
        durationMins: duration,
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

  const handleFinish = async () => {
    setFinishing(true)
    setError(null)
    try {
      if (vehicleTypes.length) {
        await updateVendorSettings({ vehicleTypes })
      }
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
      <p className="text-[11px] text-text-secondary">Step 4 of 4 — Services &amp; vehicles</p>

      <section>
        <label className="mb-2 block text-[11px] font-medium text-text-secondary">
          Quick add a common service
        </label>
        <div className="flex flex-wrap gap-2">
          {SERVICE_PRESETS.map((preset) => (
            <Chip
              key={preset.name}
              label={preset.name}
              selected={name === preset.name}
              onClick={() => applyPreset(preset)}
            />
          ))}
        </div>
        <p className="mt-1.5 text-[11px] text-text-muted">
          Tap a preset or type a custom name below, then set price &amp; duration.
        </p>
      </section>

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
        <label className="mb-2 block text-[11px] font-medium text-text-secondary">
          Vehicle types handled
        </label>
        <div className="flex flex-wrap gap-2">
          {VEHICLE_TYPES.map((type) => (
            <Chip
              key={type}
              label={type}
              selected={vehicleTypes.includes(type)}
              onClick={() => toggleVehicleType(type)}
            />
          ))}
        </div>
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
