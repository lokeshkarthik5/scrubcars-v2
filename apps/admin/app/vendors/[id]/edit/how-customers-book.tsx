'use client'

import { useId, useState, type ReactNode } from 'react'
import { IconAlertCircle } from '@tabler/icons-react'
import { ScButton } from '@repo/ui/sc/button'
import { ScCheckbox } from '@repo/ui/sc/checkbox'
import { DEFAULT_PICKUP_RADIUS_KM, PICKUP_TERMS_ADMIN } from '@repo/core/pickup'
import { cn } from '@repo/core/utils'
import { ApiError } from '@repo/core/api/client'
import { clearAdminDoorstepArea, updateAdminVendor } from '@repo/core/api/admin'
import { collectsAnywhereLine, comesAnywhereLine } from '@repo/core/cities'
import { errorMessage } from '@repo/core/api/hooks/use-discounts'
import { useLiveBookingMode } from '@/components/booking-mode-card'
import { RESPONSIBILITY, useLivePickup } from '@/components/pickup-card'
import { SavedNote } from '@/components/save-bar'
import { TravelChoiceField } from '@repo/ui/features/travel-choice'
import { formatWhen } from '@/lib/bookings'
import {
  DEFAULT_DOORSTEP_RADIUS_KM,
  bookingModeOf,
  bookingReachLine,
} from '@/lib/garage-edit'
import type { GarageDraftState } from './use-garage-draft'

type SaveState = 'idle' | 'saving' | 'saved'

/** One small label for the card: saving wins, then a save just landed. */
function combined(a: SaveState, b: SaveState): SaveState {
  if (a === 'saving' || b === 'saving') return 'saving'
  if (a === 'saved' || b === 'saved') return 'saved'
  return 'idle'
}

/**
 * "How customers book" on the editor's Location tab (mockup 05): three tick
 * tiles — At the garage, Doorstep, Pickup & drop — that save the moment
 * they are tapped, with one small "Saved" for all three. Doorstep opens its
 * "Travels up to" box; Pickup & drop asks for the signed agreement before it
 * turns on. Add garage keeps BookingModeCard and PickupFields, which send
 * with Create.
 *
 * The page keeps this mounted and only hides it on the other tabs: it reads
 * the garage once, and a remount would show the values as first loaded.
 */
export function HowCustomersBook({
  vendorId,
  booking,
  pinned,
  pinCity,
  paused,
  live,
  onAuthError,
  onSaved,
}: {
  vendorId: string
  /** As loaded. Read once. */
  booking: NonNullable<GarageDraftState['bookingMode']>
  /** As saved: a pin dragged but not saved is not one yet. */
  pinned: boolean
  /** The city the saved pin is in (0069), for "All over <city>"; null for none. */
  pinCity: string | null
  paused: boolean
  /** Active and shown to customers, as saved. */
  live: boolean
  onAuthError: () => void
  onSaved: () => void
}) {
  const titleId = useId()
  const mode = useLiveBookingMode({
    vendorId,
    dropinEnabled: booking.dropinEnabled,
    doorstepEnabled: booking.doorstepEnabled,
    doorstepRadiusKm: booking.doorstepRadiusKm,
    onAuthError,
    onSaved,
  })
  const pickup = useLivePickup({
    vendorId,
    enabled: booking.pickupEnabled,
    pickup: booking.pickup,
    pickupRadiusKm: booking.pickupRadiusKm,
    termsAcceptedAt: booking.pickupTermsAcceptedAt,
    termsAcceptedBy: booking.pickupTermsAcceptedBy,
    onAuthError,
    onSaved,
  })
  const whole = useLiveWholeCity({
    vendorId,
    doorstep: booking.doorstepWholeCity,
    pickup: booking.pickupWholeCity,
    onAuthError,
    onSaved,
  })
  // "All over <city>" applies only while the pin is in a city (the server's
  // rule): the city's name when it does, else null.
  const doorstepCity = whole.doorstep && pinCity ? pinCity : null
  const pickupCity = whole.pickup && pinCity ? pinCity : null
  // Unticking the last of the two: said here, and not sent.
  const [needsOne, setNeedsOne] = useState(false)

  const garageOn = mode.mode === 'garage' || mode.mode === 'both'
  const doorstepOn = mode.mode === 'doorstep' || mode.mode === 'both'
  // Read once, then kept here: Clear (0065) takes it off without a reload.
  const [drawnArea, setDrawnArea] = useState(booking.hasDoorstepArea)
  const [clearing, setClearing] = useState<'idle' | 'asking' | 'busy'>('idle')
  const [clearError, setClearError] = useState('')
  const clearArea = async () => {
    setClearing('busy')
    setClearError('')
    try {
      await clearAdminDoorstepArea(vendorId)
      setDrawnArea(false)
      setClearing('idle')
      onSaved()
    } catch (err) {
      setClearing('asking')
      setClearError(errorMessage(err, "Couldn't clear the drawn area"))
    }
  }
  const reach = bookingReachLine(mode.mode, mode.savedKm, { drawnArea, wholeCity: doorstepCity })

  const tick = (dropin: boolean, doorstep: boolean) => {
    const next = bookingModeOf(dropin, doorstep)
    if (!next) {
      setNeedsOne(true)
      return
    }
    setNeedsOne(false)
    mode.changeMode(next)
  }

  return (
    <section
      aria-labelledby={titleId}
      className="rounded-[16px] border border-border bg-surface p-4"
    >
      <div className="flex min-h-[22px] items-center justify-between gap-3">
        <h2
          id={titleId}
          className="text-[15px] font-medium tracking-[-0.01em] text-text-primary"
        >
          How customers book
        </h2>
        {/* Always mounted, so the change is announced when it lands. */}
        <SavedNote
          state={combined(combined(mode.saveState, pickup.saveState), whole.saveState)}
          idleText="Saves on tap"
        />
      </div>

      <div className="mt-3.5 grid gap-2.5 @xl:grid-cols-3">
        <Tile
          label="At the garage"
          hint="Customers drive in"
          checked={garageOn}
          onChange={(on) => tick(on, doorstepOn)}
        />
        <Tile
          label="Doorstep"
          hint={
            doorstepCity
              ? comesAnywhereLine(doorstepCity)
              : drawnArea
                ? 'Team travels within its drawn area'
                : `Team travels up to ${mode.savedKm ?? DEFAULT_DOORSTEP_RADIUS_KM} km`
          }
          checked={doorstepOn}
          onChange={(on) => tick(garageOn, on)}
        />
        <Tile
          label="Pickup & drop"
          hint={
            pickup.saved.enabled
              ? pickupCity
                ? collectsAnywhereLine(pickupCity)
                : `Collects up to ${pickup.saved.km ?? DEFAULT_PICKUP_RADIUS_KM} km`
              : 'Needs the signed agreement'
          }
          checked={pickup.on}
          disabled={pickup.saving}
          onChange={pickup.onSwitch}
        />
      </div>

      {needsOne && (
        <p role="alert" className="mt-2.5 text-[12.5px] text-error">
          Keep at least one of At the garage or Doorstep.
        </p>
      )}

      {/* The garage's own drawn doorstep area (0065): Detlio can clear it,
        and the radius below (or the default) applies from then on. */}
      {drawnArea && (
        <div className="mt-2.5 flex flex-wrap items-center gap-2 text-[12.5px] text-text-secondary">
          <span>The garage drew its own doorstep area.</span>
          {clearing === 'idle' ? (
            <button
              type="button"
              onClick={() => setClearing('asking')}
              className="min-h-11 px-1 font-medium text-text-primary underline-offset-2 hover:underline"
            >
              Clear drawn area…
            </button>
          ) : (
            <>
              <span>
                Clear it? Doorstep then reaches{' '}
                {mode.savedKm ?? DEFAULT_DOORSTEP_RADIUS_KM} km from the pin.
              </span>
              <ScButton
                variant="secondary"
                fullWidth={false}
                disabled={clearing === 'busy'}
                onClick={() => void clearArea()}
                className="min-h-11 px-3 text-[12px]"
              >
                {clearing === 'busy' ? 'Clearing…' : 'Clear drawn area'}
              </ScButton>
              <ScButton
                variant="secondary"
                fullWidth={false}
                disabled={clearing === 'busy'}
                onClick={() => {
                  setClearing('idle')
                  setClearError('')
                }}
                className="min-h-11 px-3 text-[12px]"
              >
                Keep it
              </ScButton>
            </>
          )}
          {clearError && (
            <p role="alert" className="w-full text-error">
              {clearError}
            </p>
          )}
        </div>
      )}

      {doorstepOn && (
        <div className="-mx-4 mt-4 border-t border-border px-4 pt-4">
          <TravelChoiceField
            label="How far the team travels"
            wholeCity={whole.doorstep}
            onChange={whole.setDoorstep}
            cityName={pinCity}
            radiusKm={mode.savedKm}
            defaultKm={DEFAULT_DOORSTEP_RADIUS_KM}
            disabled={whole.saving}
          >
            <KmRow
              label="Travels up to"
              hint={
                drawnArea ? (
                  // Kept editable: if the garage clears its area, this is what
                  // applies from then on.
                  'Not used while the garage’s own drawn area is set.'
                ) : (
                  <>
                    Optional. Empty means{' '}
                    <span className="font-numeric">
                      {DEFAULT_DOORSTEP_RADIUS_KM}
                    </span>{' '}
                    km.
                  </>
                )
              }
              value={mode.radius}
              placeholder={DEFAULT_DOORSTEP_RADIUS_KM}
              error={mode.radiusError}
              onChange={mode.changeRadius}
              onCommit={mode.commitRadius}
              flush
            />
          </TravelChoiceField>
        </div>
      )}

      {pickup.on && pickup.saved.enabled && (
        <div className="-mx-4 mt-4 border-t border-border px-4 pt-4">
          <TravelChoiceField
            label="How far it collects from"
            wholeCity={whole.pickup}
            onChange={whole.setPickup}
            cityName={pinCity}
            radiusKm={pickup.saved.km}
            defaultKm={DEFAULT_PICKUP_RADIUS_KM}
            disabled={whole.saving || pickup.saving}
            wholeCityNote={(city) => `Collects from any address in ${city}, measured from the city's centre.`}
          />
        </div>
      )}

      {pickup.on && !pickupCity && (
        <KmRow
          label="Collects up to"
          hint={
            <>
              Pickup &amp; drop. Optional. Empty means{' '}
              <span className="font-numeric">{DEFAULT_PICKUP_RADIUS_KM}</span>{' '}
              km from the pin.
            </>
          }
          value={pickup.radius}
          placeholder={DEFAULT_PICKUP_RADIUS_KM}
          error={pickup.radiusError}
          disabled={pickup.saving}
          onChange={pickup.changeRadius}
          onCommit={pickup.commitRadius}
        >
          {!pinned && (
            <p className="mt-2 flex items-start gap-1.5 text-[12.5px] text-error">
              <IconAlertCircle
                size={15}
                className="mt-px shrink-0"
                aria-hidden="true"
              />
              No map pin yet: no customer can be matched for pickup until the
              garage is pinned.
            </p>
          )}
          {pickup.saved.enabled && pickup.saved.termsAt && (
            <p className="mt-2 text-[12px] text-text-muted">
              Agreement recorded {formatWhen(pickup.saved.termsAt)}
              {pickup.saved.termsBy ? ` · ${pickup.saved.termsBy}` : ''}.
              Customers can book it once the customer app’s pickup screens are
              out.
            </p>
          )}
        </KmRow>
      )}

      {/* The agreement step: Pickup & drop turns on only with the tick. */}
      {pickup.turningOn && (
        <div className="-mx-4 mt-4 border-t border-border px-4 pt-4">
          <p className="text-[13px] text-text-secondary">{RESPONSIBILITY}</p>
          <ScCheckbox
            label={PICKUP_TERMS_ADMIN}
            checked={pickup.agreed}
            onChange={pickup.setAgreed}
            disabled={pickup.saving}
          />
          <div className="mt-2 flex gap-2">
            <ScButton
              variant="secondary"
              className="min-h-11 flex-1"
              onClick={() => pickup.onSwitch(false)}
              disabled={pickup.saving}
            >
              Not now
            </ScButton>
            <ScButton
              variant="secondary"
              className="min-h-11 flex-1"
              onClick={pickup.turnOn}
              disabled={!pickup.agreed || pickup.saving}
            >
              {pickup.saving ? 'Saving…' : 'Turn on pickup & drop'}
            </ScButton>
          </div>
        </div>
      )}

      {(mode.error || pickup.error || whole.error) && (
        <p role="alert" className="mt-3 text-[13px] text-error">
          {mode.error ?? pickup.error ?? whole.error}
        </p>
      )}

      {/* What a customer can book, in one quiet line, and why they can't
          yet when the garage isn't live. */}
      <div className="mt-3.5 flex flex-col gap-1 text-[12.5px] leading-snug text-text-muted">
        <p>
          {reach ? (
            <>
              {live ? 'Customers can book' : 'When live, customers can book'}:{' '}
              <span className="font-numeric text-text-secondary">{reach}</span>
            </>
          ) : (
            <span className="text-error">
              Nothing is switched on, so customers can’t book this garage.
            </span>
          )}
        </p>
        {!live && (
          <p className="text-error">
            Not live yet: Active and shown to customers first (Go live).
          </p>
        )}
        {paused && (
          <p className="text-error">
            Bookings are paused. Resume them under Taking bookings.
          </p>
        )}
        {pickup.legacyYes && (
          <p className="text-error">
            Said yes to pickup at onboarding, but hasn’t agreed to be
            responsible for the car. Off until it does.
          </p>
        )}
      </div>
    </section>
  )
}

/**
 * A tick tile: the box, the name, and a line under it. Named by the label
 * alone, with the line as its description, so "Doorstep" is the checkbox's
 * name whatever distance it shows.
 */
function Tile({
  label,
  hint,
  checked,
  disabled,
  onChange,
}: {
  label: string
  hint: string
  checked: boolean
  disabled?: boolean
  onChange: (checked: boolean) => void
}) {
  const id = useId()
  return (
    <label
      className={cn(
        'flex min-h-14 cursor-pointer items-start gap-3 rounded-[12px] border px-3.5 py-3 transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-text-secondary',
        checked
          ? 'border-text-secondary bg-white/[0.03]'
          : 'border-border hover:border-text-muted',
        disabled && 'cursor-not-allowed opacity-60'
      )}
    >
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        aria-labelledby={`${id}-label`}
        aria-describedby={`${id}-hint`}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 size-4 shrink-0 rounded border-border bg-surface accent-brand-white outline-none"
      />
      <span className="min-w-0">
        <span
          id={`${id}-label`}
          className="block text-[14px] font-medium text-text-primary"
        >
          {label}
        </span>
        <span
          id={`${id}-hint`}
          className="mt-0.5 block font-numeric text-[12.5px] text-text-muted"
        >
          {hint}
        </span>
      </span>
    </label>
  )
}

/** A distance box under the tiles: "Travels up to", "Collects up to". */
function KmRow({
  label,
  hint,
  value,
  placeholder,
  error,
  disabled,
  onChange,
  onCommit,
  flush = false,
  children,
}: {
  label: string
  hint: ReactNode
  value: string
  placeholder: number
  error: string | null
  disabled?: boolean
  onChange: (value: string) => void
  onCommit: () => void
  /** Inside the travel choice, which draws the rule above it already. */
  flush?: boolean
  children?: ReactNode
}) {
  const id = useId()
  return (
    <div className={flush ? undefined : '-mx-4 mt-4 border-t border-border px-4 pt-4'}>
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <label
            htmlFor={id}
            className="block text-[14px] tracking-[-0.01em] text-text-primary"
          >
            {label}
          </label>
          <span
            id={`${id}-hint`}
            className="mt-0.5 block text-[12.5px] text-text-muted"
          >
            {hint}
          </span>
        </div>
        <div
          className={cn(
            'flex h-11 w-[100px] shrink-0 items-center gap-1.5 rounded-[12px] border bg-surface px-3.5 transition-colors focus-within:border-text-secondary',
            error ? 'border-error' : 'border-border'
          )}
        >
          <input
            id={id}
            value={value}
            inputMode="decimal"
            autoComplete="off"
            placeholder={String(placeholder)}
            disabled={disabled}
            aria-describedby={error ? `${id}-hint ${id}-error` : `${id}-hint`}
            aria-invalid={error ? true : undefined}
            onChange={(e) => onChange(e.target.value)}
            onBlur={onCommit}
            onKeyDown={(e) => {
              // Enter commits, as leaving the box does.
              if (e.key === 'Enter') e.currentTarget.blur()
            }}
            className="w-full min-w-0 bg-transparent font-numeric text-[16px] font-medium text-text-primary outline-none placeholder:text-text-muted"
          />
          <span aria-hidden="true" className="text-[13px] text-text-muted">
            km
          </span>
        </div>
      </div>
      {error && (
        <p id={`${id}-error`} className="mt-2 text-[12.5px] text-error">
          {error}
        </p>
      )}
      {children}
    </div>
  )
}

/**
 * "All over <city>" for doorstep and pickup & drop (0069), saved the moment
 * it is picked, as the tiles are. A refusal (the server's "Pin the garage
 * inside a city first") puts the choice back and says why.
 */
function useLiveWholeCity({
  vendorId,
  doorstep: initialDoorstep,
  pickup: initialPickup,
  onAuthError,
  onSaved,
}: {
  vendorId: string
  doorstep: boolean
  pickup: boolean
  onAuthError: () => void
  onSaved: () => void
}) {
  const [doorstep, setDoorstepState] = useState(initialDoorstep)
  const [pickup, setPickupState] = useState(initialPickup)
  const [saving, setSaving] = useState(false)
  const [saveState, setSaveState] = useState<SaveState>('idle')
  const [error, setError] = useState<string | null>(null)

  const save = async (patch: { doorstepWholeCity?: boolean; pickupWholeCity?: boolean }, undo: () => void) => {
    setSaving(true)
    setSaveState('saving')
    setError(null)
    try {
      await updateAdminVendor(vendorId, patch)
      setSaveState('saved')
      // Back to the quiet label, as the tiles' own "Saved" does.
      setTimeout(() => setSaveState((state) => (state === 'saved' ? 'idle' : state)), 2500)
      onSaved()
    } catch (err) {
      if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
        onAuthError()
        return
      }
      undo()
      setSaveState('idle')
      setError(errorMessage(err, 'Couldn’t save that. Check the connection and try again.'))
    } finally {
      setSaving(false)
    }
  }

  return {
    doorstep,
    pickup,
    saving,
    saveState,
    error,
    setDoorstep: (on: boolean) => {
      if (on === doorstep) return
      const before = doorstep
      setDoorstepState(on)
      void save({ doorstepWholeCity: on }, () => setDoorstepState(before))
    },
    setPickup: (on: boolean) => {
      if (on === pickup) return
      const before = pickup
      setPickupState(on)
      void save({ pickupWholeCity: on }, () => setPickupState(before))
    },
  }
}
