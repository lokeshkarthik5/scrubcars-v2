'use client'

import { LocationPicker } from '@repo/ui/features/location-picker'
import { ScButton } from '@repo/ui/sc/button'
import { ScField } from '@repo/ui/sc/input'
import { ScSection } from '@repo/ui/sc/section'
import { formatDay as formatDayOf } from '@repo/core/format'
import { SavedNote } from '@/components/save-bar'
import type { GarageDraft, GarageDraftState } from '../use-garage-draft'

/**
 * Location: the address, the Maps link and the pin, under How customers
 * book (the page draws that above the panel). The pin moves with Save
 * changes; "Confirm this pin is correct" saves at once, on its own.
 */
export function LocationTab({
  g,
  draft,
}: {
  g: GarageDraftState
  draft: GarageDraft
}) {
  const {
    set,
    patch,
    resetCount,
    geoConfirmedAt,
    geoSource,
    confirming,
    confirmLocation,
    pinNote,
  } = g

  return (
    // One card, as in mockup 05: the address beside its pincode, the city
    // beside the Maps link that cross-checks the pin, then the pin.
    <ScSection
      title="Address and map pin"
      action={<SavedNote state={pinNote.state} />}
    >
      <div className="grid gap-3 sm:grid-cols-2 @3xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <ScField
          label="Address"
          value={draft.form.address}
          onChange={set('address')}
        />
        <ScField
          label="Pincode"
          value={draft.form.pincode}
          onChange={set('pincode')}
          placeholder="6 digits"
          inputMode="numeric"
          className="font-numeric"
        />
        <ScField label="City" value={draft.form.city} onChange={set('city')} />
        <ScField
          label="Google Maps link (optional)"
          value={draft.form.mapsUrl}
          onChange={set('mapsUrl')}
          placeholder="https://maps.app.goo.gl/…"
        />
      </div>

      {/* Verification is the one moment a human already looks at this
          garage, so it is the natural place to sanity-check the pin. The
          Maps link above is the cross-check: does it land here? */}
      <p className="border-t border-border pt-3 text-[12px] text-text-muted">
        <span className="font-medium text-text-secondary">Map pin: </span>
        {geoConfirmedAt
          ? `Confirmed ${formatDayOf(geoConfirmedAt)}`
          : geoSource === 'unset'
            ? 'Not set — this garage cannot be found by distance until it is pinned.'
            : 'Set by the vendor, never confirmed. Check it against the Maps link, then confirm.'}
      </p>
      {/* Keyed so Discard remounts it: it reads its pin once, and would
          otherwise keep showing a dragged pin that Discard took out of the
          draft — and "Confirm this pin" would then sign off a spot the map
          isn't showing. */}
      <LocationPicker
        key={resetCount}
        value={draft.pin ? { lat: draft.pin.lat, lng: draft.pin.lng } : null}
        onChange={(pin) => patch({ pin })}
        expectedCity={draft.form.city}
      />

      {/* Moving the pin confirms it implicitly — dragging a marker onto a
          garage *is* the check. This is for the commoner case where the pin
          is already right and only needs signing off. */}
      {!geoConfirmedAt && draft.pin && (
        <ScButton
          variant="secondary"
          fullWidth={false}
          disabled={confirming}
          onClick={confirmLocation}
          className="min-h-11 self-start px-4"
        >
          {confirming ? 'Confirming…' : 'Confirm this pin is correct'}
        </ScButton>
      )}
    </ScSection>
  )
}
