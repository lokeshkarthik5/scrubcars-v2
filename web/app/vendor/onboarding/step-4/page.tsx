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
import { submitVendorOnboarding } from '@/lib/api/vendors'
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
  const [name, setName] = useState('')
  const [category, setCategory] = useState<ServiceCategory>('car_wash')
  const [price, setPrice] = useState('')
  const [duration, setDuration] = useState(30)
  const [addedCount, setAddedCount] = useState(0)
  const [loading, setLoading] = useState(false)

  const handleAddService = async () => {
    if (!name || !price) return
    setLoading(true)
    try {
      await createService({
        name,
        category,
        price: Number(price),
        durationMins: duration,
        isActive: true,
      })
      setAddedCount((c) => c + 1)
      setName('')
      setPrice('')
    } finally {
      setLoading(false)
    }
  }

  const handleFinish = async () => {
    await submitVendorOnboarding(4, {})
    router.push('/vendor/home')
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
        Add service
      </ScButton>

      {addedCount > 0 && (
        <>
          <ScButton variant="ghost" onClick={handleAddService}>+ Add another service</ScButton>
          <ScButton className="mb-4" onClick={handleFinish}>Go to dashboard</ScButton>
        </>
      )}
    </AppShell>
  )
}
