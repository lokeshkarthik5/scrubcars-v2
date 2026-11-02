import { DEFAULT_DOORSTEP_RADIUS_KM, DOORSTEP_RADIUS_PLACEHOLDER } from '@repo/core/doorstep';
import type { ApiVendorProfile } from '@repo/core/api/types';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { ScButton } from '@/components/button';
import { ScBadge } from '@/components/form-controls';
import { ScInput } from '@/components/inputs';
import { LocationPicker, type PickedLocation } from '@/components/location-picker';
import { ScCard } from '@/components/primitives';
import { SectionHeader } from '@/components/rows';
import { T } from '@/components/text';
import { toast } from '@/components/toast';
import {
  locationPayload,
  pinFromVendor,
  radiusInput,
  radiusText,
  radiusUnreadable,
} from '@/lib/location-settings';
import { colors } from '@/lib/theme';
import { updateVendorSettings } from '@/lib/vendor-api';

import { useSaving } from './use-saving';

/**
 * Settings > Location (apps/vendors/app/settings/page.tsx): the garage's pin and how far it
 * travels for doorstep jobs, saved together. "Save location" waits for a pin. The doorstep
 * coverage area (a drawn polygon) is the web's later section and is not here yet.
 */
export function LocationTab({
  vendor,
  onSaved,
}: {
  vendor: ApiVendorProfile;
  onSaved: (vendor: ApiVendorProfile) => void;
}) {
  const [pin, setPin] = useState<PickedLocation | null>(() => pinFromVendor(vendor));
  const [radius, setRadius] = useState(() => radiusText(vendor));
  const { saving, run } = useSaving();
  const unpinned = vendor.lat === null;

  const save = () => {
    if (!pin) return;
    if (radiusUnreadable(radius)) {
      toast.error('Enter the distance as a number, like 12 or 7.5');
      return;
    }
    void run('location', async () => {
      const updated = await updateVendorSettings(locationPayload(pin, radius));
      onSaved(updated);
      // Show what the server kept, so the box never claims a radius (or an empty one) that is not on file.
      setRadius(radiusText(updated));
    });
  };

  return (
    <View style={styles.section}>
      <View style={styles.header}>
        <SectionHeader title="Garage location" />
        {unpinned ? <ScBadge variant="danger">Not set</ScBadge> : null}
      </View>
      <ScCard style={styles.section}>
        {unpinned ? (
          <T accessibilityRole="alert" size={12} color={colors.warning}>
            Customers can&apos;t find you until your garage is pinned on the map, and we can&apos;t verify you
            without it.
          </T>
        ) : null}
        <LocationPicker
          value={pin ? { lat: pin.lat, lng: pin.lng } : null}
          onChange={setPin}
          expectedCity={vendor.city}
        />
        <ScInput
          label="Doorstep travel radius (km)"
          numeric
          keyboardType="decimal-pad"
          placeholder={DOORSTEP_RADIUS_PLACEHOLDER}
          value={radius}
          onChangeText={(text) => setRadius(radiusInput(text))}
        />
        {/* This is the garage's own number, not a radius the customer picks. Optional: left
            empty, doorstep jobs reach the default, and whether the garage travels at all is the
            Doorstep switch under Hours. */}
        <T size={11} color={colors.textMuted}>
          How far you&apos;ll travel for doorstep jobs. Leave empty to use{' '}
          <T size={11} num color={colors.textMuted}>
            {DEFAULT_DOORSTEP_RADIUS_KM}
          </T>{' '}
          km.
        </T>
        {/* The same line as under the Doorstep switch: the radius is measured from the pin, so it
            does nothing until there is one. */}
        {vendor.doorstepEnabled && unpinned ? (
          <T size={12} color={colors.warning}>
            Customers can&apos;t find you for doorstep jobs until your garage is pinned.
          </T>
        ) : null}
        <ScButton variant="main" size="lg" disabled={!pin || saving === 'location'} onPress={save}>
          {saving === 'location' ? 'Saving...' : 'Save location'}
        </ScButton>
      </ScCard>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: 12 },
  header: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12 },
});
