'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { AppShell } from '@repo/ui/sc/app-shell'
import { ScButton } from '@repo/ui/sc/button'
import { ScCard } from '@repo/ui/sc/card'
import { ScInput } from '@repo/ui/sc/input'
import { Chip } from '@repo/ui/sc/chip'
import { SectionHeader } from '@repo/ui/sc/section-header'
import { submitVendorOnboarding } from '@repo/core/api/vendors'
import { toast } from 'react-toastify'
import { useVendorOnboardingStore } from '@repo/core/stores/vendor-onboarding-store'
import {
  DEFAULT_DOORSTEP_RADIUS_KM,
  DOORSTEP_RADIUS_PLACEHOLDER,
} from '@repo/core/doorstep'
import { cn } from '@repo/core/utils'
import { OnboardingHeader } from '@/components/onboarding-header'

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
  // question that switched doorstep on with no distance, which then matched
  // no address. The distance is still asked for here, but it is optional: left
  // empty, the garage covers the default 10 km from its pin.
  const [mode, setMode] = useState<ServiceMode>('garage')
  const [radiusKm, setRadiusKm] = useState('')
  const [bays, setBays] = useState('')
  const [jobsPerDay, setJobsPerDay] = useState('')
  const [loading, setLoading] = useState(false)

  const doorstep = mode === 'doorstep'
  const radius = Number(radiusKm)
  const radiusGiven = doorstep && radiusKm.trim() !== ''
  const radiusError =
    radiusGiven &&
    (!Number.isFinite(radius) || radius < MIN_RADIUS_KM || radius > MAX_RADIUS_KM)
      ? `Enter how far you'll go, from ${MIN_RADIUS_KM} to ${MAX_RADIUS_KM} km, or leave it empty.`
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
      const doorstepRadiusKm = radiusGiven ? radius : null

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
      <OnboardingHeader
        step={3}
        title="Garage setup"
        subtitle="When you work, and how many cars you can take."
        backHref="/onboarding/step-2"
      />

      <section className="flex flex-col gap-3">
        <SectionHeader
          title="Slot interval"
          subtitle="How far apart the start times customers can pick are."
        />
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

      <section className="flex flex-col gap-3">
        <SectionHeader title="Working days" />
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

      <section className="flex flex-col gap-3">
        <SectionHeader
          title="Working hours"
          subtitle="Applied to every working day. You can set each day in Settings later."
        />
        <div className="grid grid-cols-2 gap-2">
          <ScInput label="Open time" type="time" className="font-numeric" value={openTime} onChange={(e) => setOpenTime(e.target.value)} />
          <ScInput label="Close time" type="time" className="font-numeric" value={closeTime} onChange={(e) => setCloseTime(e.target.value)} />
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <SectionHeader id="service-mode-heading" title="How do customers get serviced?" />
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
          <div className="rise-in">
            <ScInput
              id="onboarding-doorstep-radius"
              label="Up to how many km from your garage?"
              type="number"
              inputMode="numeric"
              min={MIN_RADIUS_KM}
              max={MAX_RADIUS_KM}
              placeholder={DOORSTEP_RADIUS_PLACEHOLDER}
              className="font-numeric"
              value={radiusKm}
              onChange={(e) => setRadiusKm(e.target.value)}
            />
            {radiusError && (
              <p role="alert" className="mt-1 text-[12px] text-warning">{radiusError}</p>
            )}
            <p className="mt-1 text-[11px] text-text-muted">
              Optional. Leave it empty to use{' '}
              <span className="font-numeric">{DEFAULT_DOORSTEP_RADIUS_KM}</span> km. Customers
              further away won&apos;t see you for doorstep jobs. You can draw an exact
              area later in Settings.
            </p>
          </div>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <SectionHeader title="Capacity" />
        <ScCard className="flex flex-col gap-3">
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
            <p role="alert" className="text-[12px] text-warning">{baysError ?? jobsError}</p>
          )}
          <p className="text-[11px] text-text-muted">
            Customers are only offered times when you have room for one more car.
          </p>
        </ScCard>
      </section>

      <ScButton
        className="mt-auto mb-4"
        disabled={loading || !!radiusError || !!baysError || !!jobsError}
        onClick={handleContinue}
      >
        Continue
      </ScButton>
    </AppShell>
  )
}
