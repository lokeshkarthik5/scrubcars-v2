'use client'

import { useState } from 'react'
import { ScButton } from '@repo/ui/sc/button'
import { ScCard } from '@repo/ui/sc/card'
import { ScCheckbox } from '@repo/ui/sc/checkbox'
import { ScInput } from '@repo/ui/sc/input'
import { Notice } from '@repo/ui/sc/notice'
import { SectionHeader } from '@repo/ui/sc/section-header'
import { ScSwitch } from '@repo/ui/sc/switch'
import { updateVendorJobTypes } from '@repo/core/api/vendors'
import type { ApiVendorProfile } from '@repo/core/api/types'
import {
  DEFAULT_PICKUP_RADIUS_KM,
  PICKUP_TERMS_GARAGE,
  parsePickupRadius,
  pickupReachLine,
} from '@repo/core/pickup'
import { APP_TIMEZONE } from '@repo/core/utils'
import { toast } from 'react-toastify'

/** "17 Oct 2026". */
function formatDay(iso: string) {
  return new Date(iso).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: APP_TIMEZONE,
  })
}

/**
 * "Pickup & drop": the garage collects the customer's car from their
 * address, does the work here and brings it back. Turning it on needs the
 * owner's tick that the garage is responsible for the car from pickup until
 * it is returned (the server records who and when); turning it off never
 * does. The distance is measured from the garage's pin; empty is 10 km.
 *
 * Keyed by the garage in the parent, so a company switch starts it afresh.
 * Saves on tap like the job type switches above it. The tick and the
 * distance appear under the switch when the owner turns it on, so the
 * responsibility is read in the same place it is accepted.
 */
export function PickupSection({
  vendor,
  onChange,
}: {
  vendor: ApiVendorProfile
  onChange: (vendor: ApiVendorProfile) => void
}) {
  const enabled = vendor.pickupEnabled === true
  const [turningOn, setTurningOn] = useState(false)
  const [accepted, setAccepted] = useState(false)
  const [radius, setRadius] = useState(
    vendor.pickupRadiusKm != null ? String(vendor.pickupRadiusKm) : ''
  )
  const [saving, setSaving] = useState<'switch' | 'radius' | null>(null)

  const parsed = parsePickupRadius(radius)
  const pinned = vendor.lat != null && vendor.lng != null

  const save = async (
    key: 'switch' | 'radius',
    input: Parameters<typeof updateVendorJobTypes>[0]
  ) => {
    setSaving(key)
    try {
      const updated = await updateVendorJobTypes(input)
      onChange(updated)
      // The box shows what is now stored ("08" saved reads "8").
      setRadius(
        updated.pickupRadiusKm != null ? String(updated.pickupRadiusKm) : ''
      )
      setTurningOn(false)
      setAccepted(false)
      toast.success('Saved successfully')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setSaving(null)
    }
  }

  const onSwitch = (next: boolean) => {
    if (next) {
      // Not saved yet: the owner reads and ticks first.
      setTurningOn(true)
      return
    }
    if (turningOn) {
      setTurningOn(false)
      setAccepted(false)
      return
    }
    void save('switch', { pickupEnabled: false })
  }

  const radiusKm = parsed.ok ? parsed.km : null
  const radiusChanged = parsed.ok && radiusKm !== vendor.pickupRadiusKm

  return (
    <section
      className="flex flex-col gap-3"
      aria-labelledby="pickup-drop-title"
    >
      <SectionHeader title="Pickup & drop" />
      <ScCard className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p
              id="pickup-drop-title"
              className="text-[13px] font-medium text-text-primary"
            >
              Pickup &amp; drop
            </p>
            <p className="text-[11px] text-text-secondary">
              You collect the car from the customer, do the work here and bring
              it back
            </p>
          </div>
          <ScSwitch
            label="Pickup & drop"
            checked={enabled || turningOn}
            disabled={saving !== null}
            onChange={onSwitch}
          />
        </div>

        {!pinned && (enabled || turningOn) && (
          <Notice tone="warning" title="Your garage isn't on the map yet">
            Set its location under Location: the pickup distance is measured
            from it, so no customer can be matched without it.
          </Notice>
        )}

        {(enabled || turningOn) && (
          <div className="flex flex-col gap-2 border-t border-border pt-3">
            <ScInput
              id="settings-pickup-radius"
              label="How far will you collect from? (km, optional)"
              inputMode="decimal"
              className="font-numeric"
              placeholder={String(DEFAULT_PICKUP_RADIUS_KM)}
              value={radius}
              onChange={(e) =>
                setRadius(e.target.value.replace(/[^\d.]/g, '').slice(0, 4))
              }
            />
            {parsed.ok ? (
              <p className="text-[11px] text-text-muted">
                Empty means {DEFAULT_PICKUP_RADIUS_KM} km from your
                garage&apos;s pin. Pickups need 3 hours&apos; notice.
              </p>
            ) : (
              <p role="alert" className="text-[12px] text-warning">
                {parsed.message}
              </p>
            )}
          </div>
        )}

        {turningOn && (
          <div className="flex flex-col gap-2 border-t border-border pt-3">
            <p className="text-[12px] text-text-secondary">
              While the car is with you it is your responsibility: from the
              moment you collect it until it is back with the customer. When you
              collect it, ask the customer for their 4-digit pickup code; when
              you bring it back, their delivery code.
            </p>
            <ScCheckbox
              label={PICKUP_TERMS_GARAGE}
              checked={accepted}
              onChange={setAccepted}
            />
            <div className="flex gap-2">
              <ScButton
                variant="outline"
                size="md"
                className="flex-1"
                onClick={() => {
                  setTurningOn(false)
                  setAccepted(false)
                }}
              >
                Not now
              </ScButton>
              <ScButton
                variant="outline"
                size="md"
                className="flex-1"
                disabled={!accepted || !parsed.ok || saving !== null}
                onClick={() =>
                  save('switch', {
                    pickupEnabled: true,
                    pickupTermsAccepted: true,
                    pickupRadiusKm: radiusKm,
                  })
                }
              >
                {saving === 'switch' ? 'Saving...' : 'Turn on pickup & drop'}
              </ScButton>
            </div>
          </div>
        )}

        {enabled && !turningOn && (
          <>
            <p className="text-[12px] text-text-primary">
              <span className="font-numeric">
                {pickupReachLine(vendor.pickupRadiusKm)}
              </span>
            </p>
            {vendor.pickupTermsAcceptedAt && (
              <p className="text-[11px] text-text-muted">
                Responsibility for the car accepted on{' '}
                <span className="font-numeric">
                  {formatDay(vendor.pickupTermsAcceptedAt)}
                </span>
                .
              </p>
            )}
            <p className="text-[11px] text-text-muted">
              Customers can book pickup &amp; drop from the Detlio app soon.
            </p>
            {radiusChanged && (
              <ScButton
                variant="outline"
                size="md"
                disabled={saving !== null}
                onClick={() => save('radius', { pickupRadiusKm: radiusKm })}
              >
                {saving === 'radius' ? 'Saving...' : 'Save pickup distance'}
              </ScButton>
            )}
          </>
        )}
      </ScCard>
    </section>
  )
}
