'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { AppShell } from '@repo/ui/sc/app-shell'
import { ScButton } from '@repo/ui/sc/button'
import { ScInput } from '@repo/ui/sc/input'
import { Chip } from '@repo/ui/sc/chip'
import { ProgressBar } from '@repo/ui/sc/progress-bar'
import { TopBar } from '@repo/ui/sc/top-bar'
import { submitVendorOnboarding } from '@repo/core/api/vendors'
import { toast } from 'react-toastify'
import {
  useVendorOnboardingStore,
  type PickupOption,
} from '@repo/core/stores/vendor-onboarding-store'

const SLOT_INTERVALS = [30, 45, 60] as const
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const PICKUP_OPTIONS: { value: PickupOption; label: string }[] = [
  { value: 'yes', label: 'Yes' },
  { value: 'nearby', label: 'Nearby only' },
  { value: 'no', label: 'No' },
]

export default function VendorOnboardingStep3() {
  const router = useRouter()
  const update = useVendorOnboardingStore((s) => s.update)
  const [slotInterval, setSlotInterval] = useState<30 | 45 | 60>(30)
  const [openTime, setOpenTime] = useState('09:00')
  const [closeTime, setCloseTime] = useState('18:00')
  const [workingDays, setWorkingDays] = useState<number[]>([0, 1, 2, 3, 4, 5, 6])
  const [pickup, setPickup] = useState<PickupOption>('')
  const [pickupRadiusKm, setPickupRadiusKm] = useState('')
  const [bays, setBays] = useState('')
  const [jobsPerDay, setJobsPerDay] = useState('')
  const [loading, setLoading] = useState(false)

  const toggleDay = (day: number) =>
    setWorkingDays((days) =>
      days.includes(day) ? days.filter((d) => d !== day) : [...days, day].sort()
    )

  const handleContinue = async () => {
    setLoading(true)
    try {
      const doorstep = pickup === 'yes' || pickup === 'nearby'
      const radius = pickupRadiusKm ? Number(pickupRadiusKm) : null
      const bayCount = bays ? Number(bays) : null
      const jobs = jobsPerDay ? Number(jobsPerDay) : null

      update({
        dropin: true,
        doorstep,
        pickup,
        pickupRadiusKm: radius,
        bays,
        jobsPerDay,
        slotInterval,
        workingDays,
        openTime,
        closeTime,
        areas: [],
      })
      await submitVendorOnboarding(3, {
        dropin: true,
        doorstep,
        pickup,
        pickupRadiusKm: radius,
        bays: bayCount,
        jobsPerDay: jobs,
        slotInterval,
        workingDays,
        openTime,
        closeTime,
        areas: [],
      })
      router.push('/onboarding/step-4')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <AppShell className="gap-5 py-4">
      <TopBar showBack backHref="/onboarding/step-2" />
      <ProgressBar progress={75} />
      <p className="text-[11px] text-text-secondary">Step 3 of 4 — Garage setup</p>

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
        <h2 className="mb-2 text-sm font-semibold">Working days</h2>
        <div className="flex flex-wrap gap-2">
          {DAYS.map((label, day) => (
            <Chip
              key={label}
              label={label}
              selected={workingDays.includes(day)}
              onClick={() => toggleDay(day)}
            />
          ))}
        </div>
      </section>

      <section>
        <h2 className="mb-1 text-sm font-semibold">Working hours</h2>
        <p className="mb-2 text-[11px] text-text-secondary">Applied to every working day, customise later</p>
        <div className="grid grid-cols-2 gap-2">
          <ScInput label="Open time" type="time" value={openTime} onChange={(e) => setOpenTime(e.target.value)} />
          <ScInput label="Close time" type="time" value={closeTime} onChange={(e) => setCloseTime(e.target.value)} />
        </div>
      </section>

      <section>
        <h2 className="mb-2 text-sm font-semibold">Pickup &amp; drop</h2>
        <div className="flex flex-wrap gap-2">
          {PICKUP_OPTIONS.map((opt) => (
            <Chip
              key={opt.value}
              label={opt.label}
              selected={pickup === opt.value}
              onClick={() => setPickup(pickup === opt.value ? '' : opt.value)}
            />
          ))}
        </div>
        {(pickup === 'yes' || pickup === 'nearby') && (
          <div className="mt-2">
            <ScInput
              label="Pickup radius (km)"
              type="number"
              inputMode="numeric"
              placeholder="5"
              value={pickupRadiusKm}
              onChange={(e) => setPickupRadiusKm(e.target.value)}
            />
          </div>
        )}
      </section>

      <section>
        <div className="grid grid-cols-2 gap-2">
          <ScInput
            label="Bays (cars at once)"
            type="number"
            inputMode="numeric"
            placeholder="2"
            value={bays}
            onChange={(e) => setBays(e.target.value)}
          />
          <ScInput
            label="Jobs per day"
            type="number"
            inputMode="numeric"
            placeholder="15"
            value={jobsPerDay}
            onChange={(e) => setJobsPerDay(e.target.value)}
          />
        </div>
      </section>

      <ScButton className="mb-4" disabled={loading} onClick={handleContinue}>Continue</ScButton>
    </AppShell>
  )
}
