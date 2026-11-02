import { DEFAULT_DOORSTEP_RADIUS_KM, DOORSTEP_RADIUS_PLACEHOLDER } from '@repo/core/doorstep';
import type { ApiVendorProfile } from '@repo/core/api/types';
import { useState } from 'react';
import { View } from 'react-native';

import { ScButton } from '@repo/native-ui/button';
import { ScBadge } from '@/components/form-controls';
import { ScInput } from '@repo/native-ui/inputs';
import { LocationPicker, type PickedLocation } from '@/components/location-picker';
import { ScCard } from '@repo/native-ui/primitives';
import { CoverageArea } from './coverage-area';
import { SectionHeader } from '@/components/rows';
import { T } from '@repo/native-ui/text';
import { toast } from '@repo/native-ui/toast';
import {
  locationPayload,
  pinFromVendor,
  radiusInput,
  radiusText,
  radiusUnreadable,
} from '@/lib/location-settings';
import { createStyles, useColors } from '@repo/native-ui/theme';
import { updateVendorSettings } from '@/lib/vendor-api';

import { useSaving } from './use-saving';

/**
 * Settings > Location (apps/vendors/app/settings/page.tsx): the garage's pin and how far it
 * travels for doorstep jobs, saved together. "Save location" waits for a pin. Below sits the
 * doorstep coverage area (a drawn polygon), offered once the garage has a pin.
 */
export function LocationTab({
  vendor,
  onSaved,
}: {
  vendor: ApiVendorProfile;
  onSaved: (vendor: ApiVendorProfile) => void;
}) {
  const colors = useColors();
  const styles = useStyles();
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

      {/* Only offered once the garage has a pin: an area drawn around nowhere in particular is
          not useful, and the map would open on a default city centre rather than on the garage. */}
      {vendor.lat != null && vendor.lng != null ? (
        <CoverageArea
          center={{ lat: vendor.lat, lng: vendor.lng }}
          fallbackRadiusKm={vendor.doorstepRadiusKm}
        />
      ) : null}
    </View>
  );
}

const useStyles = createStyles(() => ({
  section: { gap: 12 },
  header: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12 },
}));
