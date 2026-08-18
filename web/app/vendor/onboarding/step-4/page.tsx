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
import type { PricingType, ServiceCategory } from '@/lib/types'
import { SERVICE_CATEGORY_OPTIONS } from '@/lib/categories'
import { PRICING_TYPES } from '@/lib/pricing'
import { VEHICLE_TIERS, VENDOR_VEHICLE_TYPE_OPTIONS } from '@/lib/vehicles'

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
  const [pricingType, setPricingType] = useState<PricingType>('flat')
  const [price, setPrice] = useState('')
  // Per-vehicle tiers. All three are required by the server, since the booking
  // charge reads the tier matching the customer's vehicle.
  const [tiers, setTiers] = useState({ hatchback: '', sedan: '', suv: '' })
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

  // Complete when the chosen pricing type has the price(s) it needs — the same
  // rule the server applies (see refinePricing in vendors.validation.ts).
  const pricingComplete =
    pricingType === 'per_vehicle'
      ? [tiers.hatchback, tiers.sedan, tiers.suv].every((p) => Number(p) > 0)
      : Number(price) > 0

  const handleAddService = async () => {
    if (!name || !pricingComplete) return
    setLoading(true)
    setError(null)
    try {
      await createService({
        name,
        category,
        pricingType,
        durationMins: duration,
        ...(pricingType === 'per_vehicle'
          ? {
              priceHatchback: Number(tiers.hatchback),
              priceSedan: Number(tiers.sedan),
              priceSuv: Number(tiers.suv),
            }
          : { price: Number(price) }),
      })
      setAddedCount((count) => count + 1)
      setName('')
      setPrice('')
      setTiers({ hatchback: '', sedan: '', suv: '' })
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

      <section>
        <label className="mb-2 block text-[11px] font-medium text-text-secondary">
          Pricing
        </label>
        <div className="flex flex-wrap gap-2">
          {PRICING_TYPES.map((pt) => (
            <Chip
              key={pt.value}
              label={pt.label}
              selected={pricingType === pt.value}
              onClick={() => setPricingType(pt.value)}
            />
          ))}
        </div>
        <p className="mt-1.5 text-[11px] text-text-muted">
          {PRICING_TYPES.find((pt) => pt.value === pricingType)?.hint}
        </p>
      </section>

      {pricingType === 'per_vehicle' ? (
        <div className="grid grid-cols-3 gap-2">
          {VEHICLE_TIERS.map(({ value, label }) => (
            <ScInput
              key={value}
              label={`${label} (₹)`}
              type="number"
              value={tiers[value]}
              onChange={(e) =>
                setTiers((prev) => ({ ...prev, [value]: e.target.value }))
              }
            />
          ))}
        </div>
      ) : (
        <ScInput
          label={
            pricingType === 'on_inspection' ? 'Inspection fee (₹)' : 'Price (₹)'
          }
          type="number"
          value={price}
          onChange={(e) => setPrice(e.target.value)}
        />
      )}

      <section>
        <label className="mb-2 block text-[11px] font-medium text-text-secondary">Duration</label>
        <div className="flex flex-wrap gap-2">
          {DURATIONS.map((d) => (
            <Chip key={d} label={`${d} min`} selected={duration === d} onClick={() => setDuration(d)} />
          ))}
        </div>
      </section>

      <ScButton
        disabled={!name || !pricingComplete || loading}
        onClick={handleAddService}
      >
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
          {VENDOR_VEHICLE_TYPE_OPTIONS.map((type) => (
            <Chip
              key={type}
              label={type}
              selected={vehicleTypes.includes(type)}
              onClick={() => toggleVehicleType(type)}
            />
          ))}
        </div>
        <p className="mt-1.5 text-[11px] text-text-muted">
          These are the vehicle types customers can book for, and the tiers you
          price against when a service uses per-vehicle pricing.
        </p>
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
