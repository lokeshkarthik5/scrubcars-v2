'use client'

import { useId, useState } from 'react'
import { IconAlertCircle, IconCar } from '@tabler/icons-react'
import { ScCheckbox } from '@repo/ui/sc/checkbox'
import { ScSwitch } from '@repo/ui/sc/switch'
import { ApiError } from '@repo/core/api/client'
import { updateAdminVendor } from '@repo/core/api/admin'
import {
  DEFAULT_PICKUP_RADIUS_KM,
  PICKUP_TERMS_ADMIN,
  parsePickupRadius,
} from '@repo/core/pickup'
import { cn } from '@repo/core/utils'
import { useSavedNote } from '@/components/save-bar'

const radiusText = (km: number | null | undefined) => (km != null ? String(km) : '')

/** The responsibility the garage takes on, said before the tick. */
export const RESPONSIBILITY =
  "The garage is responsible for the customer's car from pickup until it is returned."

interface PickupFieldsProps {
  /** On as shown: saved on, or being turned on here. */
  on: boolean
  onSwitch: (next: boolean) => void
  radius: string
  onRadiusChange: (value: string) => void
  onRadiusBlur?: () => void
  radiusError: string | null
  /** The agreement tick is asked for (turning on, not yet saved). */
  askAgreement: boolean
  agreed: boolean
  onAgreedChange: (agreed: boolean) => void
  /** The garage has a map pin: the pickup radius is measured from it. */
  pinned: boolean
  disabled?: boolean
}

/**
 * The fields of "Pickup & drop", shared by Add vendor (sent with Create) and
 * the edit page (saved on its own). The switch, the distance, and — while
 * turning it on — the admin's tick that the garage signed the agreement to
 * be responsible for the car from pickup until it is returned.
 */
export function PickupFields({
  on,
  onSwitch,
  radius,
  onRadiusChange,
  onRadiusBlur,
  radiusError,
  askAgreement,
  agreed,
  onAgreedChange,
  pinned,
  disabled,
}: PickupFieldsProps) {
  const radiusId = useId()

  return (
    <>
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-[15px] tracking-[-0.01em] text-text-primary">
            <IconCar size={17} stroke={1.5} aria-hidden="true" />
            Pickup &amp; drop
          </p>
          <p className="mt-0.5 text-[12.5px] text-text-muted">
            The garage collects the car from the customer, works on it at the garage and brings it back.
          </p>
        </div>
        <ScSwitch label="Pickup & drop" checked={on} disabled={disabled} onChange={onSwitch} />
      </div>

      {on && (
        <div className="-mx-4 mt-4 border-t border-border px-4 pt-4">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <label htmlFor={radiusId} className="block text-[15px] tracking-[-0.01em] text-text-primary">
                Collects up to
              </label>
              <span className="mt-0.5 block text-[12.5px] text-text-muted">
                Optional. Empty means <span className="font-numeric">{DEFAULT_PICKUP_RADIUS_KM}</span> km
                from the pin.
              </span>
            </div>
            <div
              className={cn(
                'flex h-[46px] w-[100px] shrink-0 items-center gap-1.5 rounded-[12px] border bg-surface px-3.5 transition-colors focus-within:border-text-secondary',
                radiusError ? 'border-error' : 'border-border'
              )}
            >
              <input
                id={radiusId}
                value={radius}
                inputMode="decimal"
                autoComplete="off"
                placeholder={String(DEFAULT_PICKUP_RADIUS_KM)}
                aria-invalid={radiusError ? true : undefined}
                disabled={disabled}
                onChange={(e) => onRadiusChange(e.target.value)}
                onBlur={onRadiusBlur}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') e.currentTarget.blur()
                }}
                className="w-full min-w-0 bg-transparent font-numeric text-[17px] font-medium text-text-primary outline-none placeholder:text-text-muted"
              />
              <span aria-hidden="true" className="text-[13px] text-text-muted">
                km
              </span>
            </div>
          </div>
          {radiusError && <p className="mt-2 text-[12.5px] text-error">{radiusError}</p>}
          {!pinned && (
            <p className="mt-2 flex items-start gap-1.5 text-[12.5px] text-error">
              <IconAlertCircle size={15} className="mt-px shrink-0" aria-hidden="true" />
              No map pin yet: no customer can be matched for pickup until the garage is pinned (Location).
            </p>
          )}
        </div>
      )}

      {on && askAgreement && (
        <div className="-mx-4 mt-4 border-t border-border px-4 pt-4">
          <p className="text-[13px] text-text-secondary">{RESPONSIBILITY}</p>
          <ScCheckbox label={PICKUP_TERMS_ADMIN} checked={agreed} onChange={onAgreedChange} disabled={disabled} />
        </div>
      )}
    </>
  )
}

/**
 * "Pickup & drop" on the edit page. Saves on its own, like How customers
 * book, and never with Save changes: turning it off and changing the
 * distance save at once; turning it on waits for the agreement tick and the
 * Turn on button. The server records who ticked and when.
 *
 * The state and the saves only; the editor draws them as the third tick
 * tile of How customers book (HowCustomersBook in the edit page's folder).
 */
export function useLivePickup({
  vendorId,
  enabled,
  pickup,
  pickupRadiusKm,
  termsAcceptedAt,
  termsAcceptedBy,
  onAuthError,
  onSaved,
}: {
  vendorId: string
  /** As loaded. Read once: from then on the hook holds the garage's state. */
  enabled: boolean
  /** The stored answer: a yes from onboarding without terms is not on. */
  pickup: 'yes' | 'nearby' | 'no' | null
  pickupRadiusKm: number | null
  termsAcceptedAt: string | null
  termsAcceptedBy: string | null
  onAuthError: () => void
  onSaved?: () => void
}) {
  const [saved, setSaved] = useState({
    enabled,
    km: pickupRadiusKm,
    termsAt: termsAcceptedAt,
    termsBy: termsAcceptedBy,
  })
  const [turningOn, setTurningOn] = useState(false)
  const [agreed, setAgreed] = useState(false)
  const [radius, setRadius] = useState(radiusText(pickupRadiusKm))
  const [radiusError, setRadiusError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const note = useSavedNote()
  const [error, setError] = useState<string | null>(null)

  const save = async (patch: Parameters<typeof updateAdminVendor>[1]) => {
    setSaving(true)
    setError(null)
    note.saving()
    try {
      const updated = await updateAdminVendor(vendorId, patch)
      setSaved({
        enabled: updated.pickupEnabled === true,
        km: updated.pickupRadiusKm ?? null,
        termsAt: updated.pickupTermsAcceptedAt ?? null,
        termsBy: updated.pickupTermsAcceptedBy ?? null,
      })
      setRadius(radiusText(updated.pickupRadiusKm))
      setTurningOn(false)
      setAgreed(false)
      note.saved()
      onSaved?.()
      return true
    } catch (err) {
      note.reset()
      if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
        onAuthError()
        return false
      }
      setError(err instanceof ApiError ? err.message : 'Couldn’t save that. Check the connection and try again.')
      return false
    } finally {
      setSaving(false)
    }
  }

  const onSwitch = (next: boolean) => {
    if (next) {
      setTurningOn(true)
      return
    }
    if (turningOn) {
      setTurningOn(false)
      setAgreed(false)
      setRadius(radiusText(saved.km))
      setRadiusError(null)
      return
    }
    void save({ pickupEnabled: false })
  }

  const commitRadius = () => {
    if (!saved.enabled || turningOn) return
    if (radius.trim() === radiusText(saved.km)) {
      setRadiusError(null)
      return
    }
    const parsed = parsePickupRadius(radius)
    if (!parsed.ok) {
      setRadiusError(parsed.message)
      return
    }
    setRadiusError(null)
    void save({ pickupRadiusKm: parsed.km })
  }

  const turnOn = () => {
    const parsed = parsePickupRadius(radius)
    if (!parsed.ok) {
      setRadiusError(parsed.message)
      return
    }
    void save({ pickupEnabled: true, pickupAgreementSigned: true, pickupRadiusKm: parsed.km })
  }

  return {
    /** As the server has it. */
    saved,
    /** On as shown: saved on, or being turned on here. */
    on: saved.enabled || turningOn,
    /** Asking for the agreement tick before it is turned on. */
    turningOn,
    agreed,
    setAgreed,
    radius,
    changeRadius: (value: string) => {
      setRadius(value)
      if (radiusError) setRadiusError(null)
    },
    commitRadius,
    radiusError,
    saving,
    saveState: note.state,
    error,
    onSwitch,
    turnOn,
    /** Said yes at onboarding without agreeing to be responsible for the car. */
    legacyYes: !saved.enabled && (pickup === 'yes' || pickup === 'nearby') && !saved.termsAt,
  }
}
