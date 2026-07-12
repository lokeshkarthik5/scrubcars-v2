'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { AppShell } from '@/components/sc/app-shell'
import { ScButton } from '@/components/sc/button'
import { ScInput } from '@/components/sc/input'
import { Chip } from '@/components/sc/chip'
import { ProgressBar } from '@/components/sc/progress-bar'
import { TopBar } from '@/components/sc/top-bar'
import { submitVendorOnboarding } from '@/lib/api/vendors'
import { toast } from 'react-toastify'
import { useVendorOnboardingStore } from '@/lib/stores/vendor-onboarding-store'

const SLOT_INTERVALS = [30, 45, 60] as const

export default function VendorOnboardingStep3() {
  const router = useRouter()
  const update = useVendorOnboardingStore((s) => s.update)
  const [dropin, setDropin] = useState(true)
  const [slotInterval, setSlotInterval] = useState<30 | 45 | 60>(30)
  const [openTime, setOpenTime] = useState('09:00')
  const [closeTime, setCloseTime] = useState('18:00')
  const [loading, setLoading] = useState(false)

  const handleContinue = async () => {
    setLoading(true)
    try {
      update({ dropin, slotInterval, openTime, closeTime, areas: [] })
      await submitVendorOnboarding(3, {
        dropin,
        slotInterval,
        openTime,
        closeTime,
        areas: [],
      })
      router.push('/vendor/onboarding/step-4')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <AppShell className="gap-5 py-4">
      <TopBar showBack backHref="/vendor/onboarding/step-2" />
      <ProgressBar progress={75} />
      <p className="text-[11px] text-text-secondary">Step 3 of 4 — Garage setup</p>

      <section>
        <h2 className="mb-2 text-sm font-semibold">Job types</h2>
        <div className="mb-2 flex items-center justify-between rounded-[10px] border border-border bg-surface px-3 py-3">
          <span className="text-[13px]">Accept drop-in jobs</span>
          <button
            type="button"
            onClick={() => setDropin(!dropin)}
            className={dropin ? 'h-6 w-11 rounded-full bg-brand-red' : 'h-6 w-11 rounded-full bg-border'}
          >
            <div className={dropin ? 'h-5 w-5 translate-x-5 rounded-full bg-white transition-transform' : 'h-5 w-5 translate-x-0.5 rounded-full bg-white transition-transform'} />
          </button>
        </div>
      </section>

      <section>
        <h2 className="mb-2 text-sm font-semibold">Slot interval</h2>
        <div className="flex gap-2">
          {SLOT_INTERVALS.map((mins) => (
            <Chip
              key={mins}
              label={`${mins} min`}
              selected={slotInterval === mins}
              onClick={() => setSlotInterval(mins)}
            />
          ))}
        </div>
      </section>

      <section>
        <h2 className="mb-1 text-sm font-semibold">Working hours</h2>
        <p className="mb-2 text-[11px] text-text-secondary">Set the same hours for all days, customise later</p>
        <div className="grid grid-cols-2 gap-2">
          <ScInput label="Open time" type="time" value={openTime} onChange={(e) => setOpenTime(e.target.value)} />
          <ScInput label="Close time" type="time" value={closeTime} onChange={(e) => setCloseTime(e.target.value)} />
        </div>
      </section>

      <ScButton className="mb-4" disabled={loading || !dropin} onClick={handleContinue}>Continue</ScButton>
    </AppShell>
  )
}
