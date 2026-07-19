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
  const fetchSession = useAuthStore((s) => s.fetchSession)
  const resetForm = useVendorOnboardingStore((s) => s.resetForm)
  const markComplete = useVendorOnboardingStore((s) => s.markComplete)
  const [name, setName] = useState('')
  const [category, setCategory] = useState<ServiceCategory>('car_wash')
  const [price, setPrice] = useState('')
  const [duration, setDuration] = useState(30)
  const [addedCount, setAddedCount] = useState(0)
  const [loading, setLoading] = useState(false)
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

      {error && <p className="text-[12px] text-brand-red">{error}</p>}

      <div className="mt-auto flex flex-col gap-2 pb-4">
        <ScButton disabled={finishing} onClick={handleFinish}>
          {finishing ? 'Opening dashboard...' : 'Go to dashboard'}
        </ScButton>
      </div>
    </AppShell>
  )
}
