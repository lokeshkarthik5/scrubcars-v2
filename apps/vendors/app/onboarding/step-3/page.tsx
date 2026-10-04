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
import { useVendorOnboardingStore } from '@repo/core/stores/vendor-onboarding-store'
import { cn } from '@repo/core/utils'

const SLOT_INTERVALS = [30, 45, 60] as const
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
// The server's bounds: how far a garage can say it travels, and how many cars
// it can have in at once.
const MIN_RADIUS_KM = 1
const MAX_RADIUS_KM = 30
const MAX_BAYS = 20

type ServiceMode = 'garage' | 'doorstep'

export default function VendorOnboardingStep3() {
  const router = useRouter()
  const update = useVendorOnboardingStore((s) => s.update)
  const [slotInterval, setSlotInterval] = useState<30 | 45 | 60>(30)
  const [openTime, setOpenTime] = useState('09:00')
  const [closeTime, setCloseTime] = useState('18:00')
  const [workingDays, setWorkingDays] = useState<number[]>([0, 1, 2, 3, 4, 5, 6])
  // "How do customers get serviced?" This used to be a Pickup & drop
  // question that switched doorstep on with no distance — a garage that goes
  // to customers but nowhere in particular, which no address ever matched.
  const [mode, setMode] = useState<ServiceMode>('garage')
  const [radiusKm, setRadiusKm] = useState('')
  const [bays, setBays] = useState('')
  const [jobsPerDay, setJobsPerDay] = useState('')
  const [loading, setLoading] = useState(false)

  const doorstep = mode === 'doorstep'
  const radius = Number(radiusKm)
  const radiusError =
    doorstep &&
    (radiusKm.trim() === '' ||
      !Number.isFinite(radius) ||
      radius < MIN_RADIUS_KM ||
      radius > MAX_RADIUS_KM)
      ? `Enter how far you'll go, from ${MIN_RADIUS_KM} to ${MAX_RADIUS_KM} km.`
      : null
  const bayCount = Number(bays)
  const baysError =
    bays.trim() !== '' && (!Number.isInteger(bayCount) || bayCount < 1 || bayCount > MAX_BAYS)
      ? `Cars at the same time must be between 1 and ${MAX_BAYS}.`
      : null
  const jobs = Number(jobsPerDay)
  const jobsError =
    jobsPerDay.trim() !== '' && (!Number.isInteger(jobs) || jobs < 1)
      ? 'Jobs in a day must be 1 or more, or left blank.'
      : null

  const toggleDay = (day: number) =>
    setWorkingDays((days) =>
      days.includes(day) ? days.filter((d) => d !== day) : [...days, day].sort()
    )

  const handleContinue = async () => {
    if (radiusError || baysError || jobsError) return
    setLoading(true)
    try {
      const doorstepRadiusKm = doorstep ? radius : null

      update({
        dropin: true,
        doorstep,
        doorstepRadiusKm,
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
        doorstepRadiusKm,
        bays: bays ? bayCount : null,
        jobsPerDay: jobsPerDay ? jobs : null,
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
        <h2 id="service-mode-heading" className="mb-2 text-sm font-semibold">
          How do customers get serviced?
        </h2>
        {/* Two radios rather than chips: exactly one answer is always true,
            and the doorstep one carries its own distance. */}
        <div role="radiogroup" aria-labelledby="service-mode-heading" className="flex flex-col gap-2">
          {(
            [
              { value: 'garage', label: 'They come to my garage' },
              { value: 'doorstep', label: 'I also go to them' },
            ] as const
          ).map((option) => (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={mode === option.value}
              onClick={() => setMode(option.value)}
              className={cn(
                'flex min-h-11 items-center gap-3 rounded-[10px] border px-3 py-2.5 text-left text-[13px] transition-colors',
                mode === option.value
                  ? 'border-text-primary/60 bg-surface-elevated text-text-primary'
                  : 'border-border bg-surface text-text-secondary'
              )}
            >
              <span
                aria-hidden="true"
                className={cn(
                  'flex h-4 w-4 shrink-0 items-center justify-center rounded-full border',
                  mode === option.value ? 'border-text-primary' : 'border-text-muted'
                )}
              >
                {mode === option.value && <span className="h-2 w-2 rounded-full bg-text-primary" />}
              </span>
              {option.label}
            </button>
          ))}
        </div>
        {doorstep && (
          <div className="mt-2">
            <ScInput
              id="onboarding-doorstep-radius"
              label="Up to how many km from your garage?"
              type="number"
              inputMode="numeric"
              min={MIN_RADIUS_KM}
              max={MAX_RADIUS_KM}
              placeholder="8"
              className="font-numeric"
              value={radiusKm}
              onChange={(e) => setRadiusKm(e.target.value)}
            />
            {radiusError && radiusKm.trim() !== '' && (
              <p className="mt-1 text-[12px] text-warning">{radiusError}</p>
            )}
            <p className="mt-1 text-[11px] text-text-muted">
              Customers further away than this won&apos;t see you for doorstep jobs.
              You can draw an exact area later in Settings.
            </p>
          </div>
        )}
      </section>

      <section className="flex flex-col gap-2">
        <ScInput
          id="onboarding-bays"
          label="How many cars can you work on at the same time?"
          type="number"
          inputMode="numeric"
          min={1}
          max={MAX_BAYS}
          placeholder="1"
          className="font-numeric"
          value={bays}
          onChange={(e) => setBays(e.target.value)}
        />
        <ScInput
          id="onboarding-jobs-per-day"
          label="Most jobs in a day (optional)"
          type="number"
          inputMode="numeric"
          min={1}
          placeholder="No limit"
          className="font-numeric"
          value={jobsPerDay}
          onChange={(e) => setJobsPerDay(e.target.value)}
        />
        {(baysError || jobsError) && (
          <p className="text-[12px] text-warning">{baysError ?? jobsError}</p>
        )}
        <p className="text-[11px] text-text-muted">
          Customers are only offered times when you have room for one more car.
        </p>
      </section>

      <ScButton
        className="mb-4"
        disabled={loading || !!radiusError || !!baysError || !!jobsError}
        onClick={handleContinue}
      >
        Continue
      </ScButton>
    </AppShell>
  )
}
