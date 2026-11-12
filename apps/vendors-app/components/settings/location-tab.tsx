import { DEFAULT_DOORSTEP_RADIUS_KM, DOORSTEP_RADIUS_PLACEHOLDER, MAX_DOORSTEP_RADIUS_KM } from '@repo/core/doorstep';
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
import { updateVendorJobTypes, updateVendorSettings } from '@/lib/vendor-api';
import { TravelChoiceField } from '@/components/travel-choice';

import { useSaving } from './use-saving';
import { fill, useT } from '@repo/core/i18n';

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
  const t = useT();
  const colors = useColors();
  const styles = useStyles();
  const [pin, setPin] = useState<PickedLocation | null>(() => pinFromVendor(vendor));
  const [radius, setRadius] = useState(() => radiusText(vendor));
  const { saving, run } = useSaving();
  const unpinned = vendor.lat === null;
  // "All over <city>" (0069): only while the pin is in a city, which GET /vendors/me says.
  const cityName = vendor.garageCity?.name ?? null;
  const wholeCity = vendor.doorstepWholeCity === true && cityName !== null;

  const saveWholeCity = (on: boolean) =>
    void run('whole-city', async () => {
      onSaved(await updateVendorJobTypes({ doorstepWholeCity: on }));
    });

  const save = () => {
    if (!pin) return;
    if (radiusUnreadable(radius)) {
      toast.error(t('Enter the distance as a number, like 12 or 7.5'));
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
        <SectionHeader title={t('Garage location')} />
        {unpinned ? <ScBadge variant="danger">{t('Not set')}</ScBadge> : null}
      </View>
      <ScCard style={styles.section}>
        {unpinned ? (
          <T accessibilityRole="alert" size={12} color={colors.warning}>
            {t("Customers can't find you until your garage is pinned on the map, and we can't verify you without it.")}
          </T>
        ) : null}
        <LocationPicker
          value={pin ? { lat: pin.lat, lng: pin.lng } : null}
          onChange={setPin}
          expectedCity={vendor.city}
        />
        {/* "Up to N km" or "All over <city>" (0069), as on the portal: saved the moment it is
            picked, like the job type switches. */}
        {vendor.doorstepEnabled ? (
          <TravelChoiceField
            label={t('How far you travel for doorstep jobs')}
            wholeCity={wholeCity}
            onChange={saveWholeCity}
            cityName={cityName}
            radiusKm={vendor.doorstepRadiusKm}
            defaultKm={DEFAULT_DOORSTEP_RADIUS_KM}
            disabled={saving === 'whole-city'}
            wholeCityNote={(city) => t('You go to any address in {city}.', { city })}
          />
        ) : null}
        {!wholeCity ? (
          <>
            <ScInput
              label={t('Doorstep travel radius (km)')}
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
              {fill(t("How far you'll travel for doorstep jobs, up to {max} km. Leave empty to use {km} km."), {
                max: (
                  <T size={11} num color={colors.textMuted}>
                    {MAX_DOORSTEP_RADIUS_KM}
                  </T>
                ),
                km: (
                  <T size={11} num color={colors.textMuted}>
                    {DEFAULT_DOORSTEP_RADIUS_KM}
                  </T>
                ),
              })}
            </T>
          </>
        ) : null}
        {/* The same line as under the Doorstep switch: the radius is measured from the pin, so it
            does nothing until there is one. */}
        {vendor.doorstepEnabled && unpinned ? (
          <T size={12} color={colors.warning}>
            {t("Customers can't find you for doorstep jobs until your garage is pinned.")}
          </T>
        ) : null}
        <ScButton variant="main" size="lg" disabled={!pin || saving === 'location'} onPress={save}>
          {saving === 'location' ? t('Saving...') : t('Save location')}
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
