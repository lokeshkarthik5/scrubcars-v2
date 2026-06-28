'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { IconX } from '@tabler/icons-react'
import { AppShell } from '@/components/sc/app-shell'
import { ScButton } from '@/components/sc/button'
import { ScInput } from '@/components/sc/input'
import { Chip } from '@/components/sc/chip'
import { ProgressBar } from '@/components/sc/progress-bar'
import { TopBar } from '@/components/sc/top-bar'
import { submitVendorOnboarding } from '@/lib/api/vendors'
import { cn } from '@/lib/utils'

const SLOT_INTERVALS = [30, 45, 60]

export default function VendorOnboardingStep3() {
  const router = useRouter()
  const [doorstep, setDoorstep] = useState(true)
  const [dropin, setDropin] = useState(true)
  const [slotInterval, setSlotInterval] = useState(30)
  const [openTime, setOpenTime] = useState('09:00')
  const [closeTime, setCloseTime] = useState('18:00')
  const [pincodeInput, setPincodeInput] = useState('')
  const [areas, setAreas] = useState<{ pincode: string; name: string }[]>([
    { pincode: '600020', name: 'Adyar' },
    { pincode: '600042', name: 'Velachery' },
  ])
  const [loading, setLoading] = useState(false)

  const addArea = () => {
    if (pincodeInput.length !== 6) return
    setAreas([...areas, { pincode: pincodeInput, name: 'Area' }])
    setPincodeInput('')
  }

  const handleContinue = async () => {
    setLoading(true)
    try {
      await submitVendorOnboarding(3, { doorstep, dropin, slotInterval, openTime, closeTime, areas })
      router.push('/vendor/onboarding/step-4')
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
        {[
          { label: 'Accept doorstep jobs', value: doorstep, set: setDoorstep },
          { label: 'Accept drop-in jobs', value: dropin, set: setDropin },
        ].map(({ label, value, set }) => (
          <div key={label} className="mb-2 flex items-center justify-between rounded-[10px] border border-border bg-surface px-3 py-3">
            <span className="text-[13px]">{label}</span>
            <button
              type="button"
              onClick={() => set(!value)}
              className={cn('h-6 w-11 rounded-full transition-colors', value ? 'bg-brand-red' : 'bg-border')}
            >
              <div className={cn('h-5 w-5 rounded-full bg-white transition-transform', value ? 'translate-x-5' : 'translate-x-0.5')} />
            </button>
          </div>
        ))}
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
        <button className="mt-2 text-[13px] font-medium text-brand-red">Set different hours per day</button>
      </section>

      <section>
        <h2 className="mb-2 text-sm font-semibold">Service areas</h2>
        <div className="flex gap-2">
          <ScInput
            placeholder="Pincode"
            value={pincodeInput}
            onChange={(e) => setPincodeInput(e.target.value.replace(/\D/g, '').slice(0, 6))}
            className="flex-1"
          />
          <ScButton fullWidth={false} className="px-4" onClick={addArea}>Add</ScButton>
        </div>
        <div className="mt-2 flex flex-wrap gap-2">
          {areas.map((a) => (
            <span key={a.pincode} className="flex items-center gap-1 rounded-md border border-border bg-surface px-2 py-1 text-[11px]">
              {a.pincode} — {a.name}
              <button type="button" onClick={() => setAreas(areas.filter((x) => x.pincode !== a.pincode))}>
                <IconX size={12} />
              </button>
            </span>
          ))}
        </div>
      </section>

      <ScButton className="mb-4" disabled={loading} onClick={handleContinue}>Continue</ScButton>
    </AppShell>
  )
}
