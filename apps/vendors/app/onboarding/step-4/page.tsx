'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useT, useTn } from '@repo/core/i18n'
import { msg } from '@repo/core/i18n/translate'
import { AppShell } from '@repo/ui/sc/app-shell'
import { IconAlertCircle, IconCircleCheck } from '@tabler/icons-react'
import { ScButton } from '@repo/ui/sc/button'
import { ScCard } from '@repo/ui/sc/card'
import { ScInput } from '@repo/ui/sc/input'
import { Chip } from '@repo/ui/sc/chip'
import { SectionHeader } from '@repo/ui/sc/section-header'
import { createService } from '@repo/core/api/services'
import { updateVendorSettings } from '@repo/core/api/vendors'
import { useAuthStore } from '@repo/core/stores/auth-store'
import { useVendorOnboardingStore } from '@repo/core/stores/vendor-onboarding-store'
import type { PricingType, ServiceCategory } from '@repo/core/types'
import { SERVICE_CATEGORY_OPTIONS } from '@repo/core/categories'
import { PRICING_TYPES } from '@repo/core/pricing'
import { InspectionPriceFields } from '@/components/inspection-price-fields'
import { approxToSend, inspectionPricingValid } from '@/lib/inspection-price'
import { VEHICLE_TIERS, VENDOR_VEHICLE_TYPE_OPTIONS } from '@repo/core/vehicles'
import { OnboardingHeader } from '@/components/onboarding-header'

const CATEGORIES = SERVICE_CATEGORY_OPTIONS

// Quick-add presets — each prefills the service name + maps to a category.
// The chip says it in the language in use; the name saved stays English,
// as a service's name is the garage's own data that customers read.
const SERVICE_PRESETS: { name: string; category: ServiceCategory }[] = [
  { name: msg('Exterior / foam wash'), category: 'car_wash' },
  { name: msg('Interior cleaning & vacuum'), category: 'detailing' },
  { name: msg('Full detailing'), category: 'detailing' },
  { name: msg('Ceramic / paint protection'), category: 'coating' },
  { name: msg('Polishing & buffing'), category: 'detailing' },
  { name: msg('Denting & painting'), category: 'dent_paint' },
  { name: msg('General / periodic service'), category: 'general_service' },
  { name: msg('AC service & repair'), category: 'repairs' },
  { name: msg('Battery service'), category: 'repairs' },
  { name: msg('Windshield & glass'), category: 'others' },
  { name: msg('EV servicing'), category: 'general_service' },
]

const DURATIONS = [30, 45, 60, 90, 120, 180]

export default function VendorOnboardingStep4() {
  const t = useT()
  const tn = useTn()
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
  // On inspection only (0073): an optional rough price customers see.
  const [approx, setApprox] = useState('')
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
        ? vehicleTypes.filter((stored) => stored !== type)
        : [...vehicleTypes, type],
    })

  // Complete when the chosen pricing type has the price(s) it needs — the same
  // rule the server applies (see refinePricing in vendors.validation.ts).
  // On inspection the fee is optional: empty is a free inspection (0073).
  const pricingComplete =
    pricingType === 'per_vehicle'
      ? [tiers.hatchback, tiers.sedan, tiers.suv].every((p) => Number(p) > 0)
      : pricingType === 'on_inspection'
        ? inspectionPricingValid(price, approx)
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
          : pricingType === 'on_inspection'
            ? { price: Number(price) > 0 ? Number(price) : 0, approxPrice: approxToSend(approx) }
            : { price: Number(price) }),
      })
      setAddedCount((count) => count + 1)
      setName('')
      setPrice('')
      setApprox('')
      setTiers({ hatchback: '', sedan: '', suv: '' })
    } catch (err) {
      setError(err instanceof Error ? err.message : t('Failed to add service'))
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
      router.replace('/home')
    } catch (err) {
      setError(err instanceof Error ? err.message : t('Failed to finish onboarding'))
    } finally {
      setFinishing(false)
    }
  }

  return (
    <AppShell className="gap-5 py-4">
      <OnboardingHeader
        step={4}
        title={t('Services & vehicles')}
        subtitle={t('Add what you sell. You can add more, and packages, in Services later.')}
        backHref="/onboarding/step-3"
      />

      <section className="flex flex-col gap-3">
        <SectionHeader
          title={t('Quick add a common service')}
          subtitle={t('Tap a preset or type a custom name below, then set price & duration.')}
        />
        <div className="flex flex-wrap gap-2">
          {SERVICE_PRESETS.map((preset) => (
            <Chip
              key={preset.name}
              label={t(preset.name)}
              selected={name === preset.name}
              onClick={() => applyPreset(preset)}
            />
          ))}
        </div>
      </section>

      <ScCard className="flex flex-col gap-4">
        <ScInput label={t('Service name')} value={name} onChange={(e) => setName(e.target.value)} />

        <section>
          <p className="mb-2 text-[11px] font-medium text-text-secondary">{t('Category')}</p>
          <div className="flex flex-wrap gap-2">
            {CATEGORIES.map((c) => (
              <Chip
                key={c.value}
                label={t(c.label)}
                selected={category === c.value}
                onClick={() => setCategory(c.value)}
              />
            ))}
          </div>
        </section>

        <section>
          <p className="mb-2 text-[11px] font-medium text-text-secondary">{t('Pricing')}</p>
          <div className="flex flex-wrap gap-2">
            {PRICING_TYPES.map((pt) => (
              <Chip
                key={pt.value}
                label={t(pt.label)}
                selected={pricingType === pt.value}
                onClick={() => setPricingType(pt.value)}
              />
            ))}
          </div>
          <p className="mt-1.5 text-[11px] text-text-muted">
            {t(PRICING_TYPES.find((pt) => pt.value === pricingType)?.hint ?? '')}
          </p>
        </section>

        {pricingType === 'per_vehicle' ? (
          <div className="grid grid-cols-3 gap-2">
            {VEHICLE_TIERS.map(({ value, label }) => (
              <ScInput
                key={value}
                label={t('{label} (₹)', { label: t(label) })}
                type="number"
                className="font-numeric"
                value={tiers[value]}
                onChange={(e) =>
                  setTiers((prev) => ({ ...prev, [value]: e.target.value }))
                }
              />
            ))}
          </div>
        ) : pricingType === 'on_inspection' ? (
          <InspectionPriceFields
            idPrefix="onboarding"
            fee={price}
            approx={approx}
            onFee={setPrice}
            onApprox={setApprox}
          />
        ) : (
          <ScInput
            label={t('Price (₹)')}
            type="number"
            className="font-numeric"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
          />
        )}

        <section>
          <p className="mb-2 text-[11px] font-medium text-text-secondary">{t('Duration')}</p>
          <div className="flex flex-wrap gap-2">
            {DURATIONS.map((d) => (
              <Chip key={d} label={`${d} min`} selected={duration === d} onClick={() => setDuration(d)} />
            ))}
          </div>
        </section>

        {/* One red at a time: adding a service is the step's main action
            until one is added, and then Go to dashboard is. */}
        <ScButton
          variant={addedCount === 0 ? 'primary' : 'secondary'}
          disabled={!name || !pricingComplete || loading}
          onClick={handleAddService}
        >
          {loading ? t('Adding...') : t('Add service')}
        </ScButton>

        {addedCount > 0 && (
          <p role="status" className="flex items-center gap-1.5 text-[12px] text-text-secondary">
            <IconCircleCheck size={14} aria-hidden="true" className="shrink-0 text-success" />
            {tn(addedCount, '{count} service added.', '{count} services added.')}
          </p>
        )}
      </ScCard>

      <section className="flex flex-col gap-3">
        <SectionHeader
          title={t('Vehicle types handled')}
          subtitle={t(
            'These are the vehicle types customers can book for, and the tiers you price against when a service uses per-vehicle pricing.'
          )}
        />
        <div className="flex flex-wrap gap-2">
          {VENDOR_VEHICLE_TYPE_OPTIONS.map((type) => (
            <Chip
              key={type}
              label={t(type)}
              selected={vehicleTypes.includes(type)}
              onClick={() => toggleVehicleType(type)}
            />
          ))}
        </div>
      </section>

      {/* Amber, as errors are: red on this step is its main button. */}
      {error && (
        <p role="alert" className="flex items-start gap-1.5 text-[12px] text-error">
          <IconAlertCircle size={14} className="mt-px shrink-0" aria-hidden="true" />
          {error}
        </p>
      )}

      <div className="mt-auto flex flex-col gap-2 pb-4">
        <ScButton
          variant={addedCount === 0 ? 'secondary' : 'primary'}
          disabled={finishing}
          onClick={handleFinish}
        >
          {finishing ? t('Opening dashboard...') : t('Go to dashboard')}
        </ScButton>
      </div>
    </AppShell>
  )
}
