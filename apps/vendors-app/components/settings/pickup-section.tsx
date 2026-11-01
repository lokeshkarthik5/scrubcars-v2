import type { ApiVendorProfile } from '@repo/core/api/types';
import {
  DEFAULT_PICKUP_RADIUS_KM,
  PICKUP_TERMS_GARAGE,
  parsePickupRadius,
  pickupReachLine,
} from '@repo/core/pickup';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { ScButton } from '@repo/native-ui/button';
import { ScCheckbox } from '@/components/form-controls';
import { ScInput } from '@repo/native-ui/inputs';
import { Notice, ScCard } from '@repo/native-ui/primitives';
import { ScSwitch, SectionHeader } from '@/components/rows';
import { T } from '@repo/native-ui/text';
import { toast } from '@repo/native-ui/toast';
import { errorText } from '@/lib/error-text';
import { decimalOnly, formatAcceptedDay } from '@/lib/settings-logic';
import { colors } from '@/lib/theme';
import { updateVendorJobTypes } from '@/lib/vendor-api';

/**
 * "Pickup & drop" (apps/vendors/app/settings/pickup-section.tsx): the garage collects the
 * customer's car, does the work here and brings it back. Turning it on needs the owner's
 * tick that the garage is responsible for the car from pickup until it is returned (the
 * server records who and when); turning it off never does. Keyed by the garage in the
 * parent, so a company switch starts it afresh.
 */
export function PickupSection({
  vendor,
  onChange,
}: {
  vendor: ApiVendorProfile;
  onChange: (vendor: ApiVendorProfile) => void;
}) {
  const enabled = vendor.pickupEnabled === true;
  const [turningOn, setTurningOn] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [radius, setRadius] = useState(vendor.pickupRadiusKm != null ? String(vendor.pickupRadiusKm) : '');
  const [saving, setSaving] = useState<'switch' | 'radius' | null>(null);

  const parsed = parsePickupRadius(radius);
  const pinned = vendor.lat != null && vendor.lng != null;

  const save = async (key: 'switch' | 'radius', input: Parameters<typeof updateVendorJobTypes>[0]) => {
    setSaving(key);
    try {
      const updated = await updateVendorJobTypes(input);
      onChange(updated);
      // The box shows what is now stored ("08" saved reads "8").
      setRadius(updated.pickupRadiusKm != null ? String(updated.pickupRadiusKm) : '');
      setTurningOn(false);
      setAccepted(false);
      toast.success('Saved successfully');
    } catch (err) {
      toast.error(errorText(err, 'Something went wrong'));
    } finally {
      setSaving(null);
    }
  };

  const onSwitch = (next: boolean) => {
    if (next) {
      // Not saved yet: the owner reads and ticks first.
      setTurningOn(true);
      return;
    }
    if (turningOn) {
      setTurningOn(false);
      setAccepted(false);
      return;
    }
    void save('switch', { pickupEnabled: false });
  };

  const radiusKm = parsed.ok ? parsed.km : null;
  const radiusChanged = parsed.ok && radiusKm !== vendor.pickupRadiusKm;

  return (
    <View style={styles.section}>
      <SectionHeader title="Pickup & drop" />
      <ScCard style={styles.section}>
        <View style={styles.row}>
          <View style={styles.flex}>
            <T size={13} weight={500}>
              Pickup & drop
            </T>
            <T size={11} color={colors.textSecondary}>
              You collect the car from the customer, do the work here and bring it back
            </T>
          </View>
          <ScSwitch
            label="Pickup & drop"
            checked={enabled || turningOn}
            disabled={saving !== null}
            onChange={onSwitch}
          />
        </View>

        {!pinned && (enabled || turningOn) ? (
          <Notice title="Your garage isn't on the map yet">
            Set its location under Location: the pickup distance is measured from it, so no customer can be matched
            without it.
          </Notice>
        ) : null}

        {enabled || turningOn ? (
          <View style={[styles.part, styles.divided]}>
            <ScInput
              label="How far will you collect from? (km, optional)"
              numeric
              keyboardType="decimal-pad"
              placeholder={String(DEFAULT_PICKUP_RADIUS_KM)}
              value={radius}
              onChangeText={(text) => setRadius(decimalOnly(text, 4))}
            />
            {parsed.ok ? (
              <T size={11} color={colors.textMuted}>
                {`Empty means ${DEFAULT_PICKUP_RADIUS_KM} km from your garage's pin. Pickups need 3 hours' notice.`}
              </T>
            ) : (
              <T accessibilityRole="alert" size={12} color={colors.warning}>
                {parsed.message}
              </T>
            )}
          </View>
        ) : null}

        {turningOn ? (
          <View style={[styles.part, styles.divided]}>
            <T size={12} color={colors.textSecondary}>
              While the car is with you it is your responsibility: from the moment you collect it until it is back
              with the customer. When you collect it, ask the customer for their 4-digit pickup code; when you bring it
              back, their delivery code.
            </T>
            <ScCheckbox label={PICKUP_TERMS_GARAGE} checked={accepted} onChange={setAccepted} />
            <View style={styles.buttons}>
              <View style={styles.flex}>
                <ScButton
                  variant="outline"
                  onPress={() => {
                    setTurningOn(false);
                    setAccepted(false);
                  }}
                >
                  Not now
                </ScButton>
              </View>
              <View style={styles.flex}>
                <ScButton
                  variant="outline"
                  disabled={!accepted || !parsed.ok || saving !== null}
                  onPress={() =>
                    void save('switch', {
                      pickupEnabled: true,
                      pickupTermsAccepted: true,
                      pickupRadiusKm: radiusKm,
                    })
                  }
                >
                  {saving === 'switch' ? 'Saving...' : 'Turn on pickup & drop'}
                </ScButton>
              </View>
            </View>
          </View>
        ) : null}

        {enabled && !turningOn ? (
          <>
            <T num size={12}>
              {pickupReachLine(vendor.pickupRadiusKm)}
            </T>
            {vendor.pickupTermsAcceptedAt ? (
              <T size={11} color={colors.textMuted}>
                {'Responsibility for the car accepted on '}
                <T num size={11} color={colors.textMuted}>
                  {formatAcceptedDay(vendor.pickupTermsAcceptedAt)}
                </T>
                .
              </T>
            ) : null}
            <T size={11} color={colors.textMuted}>
              Customers can book pickup & drop from the Detlio app soon.
            </T>
            {radiusChanged ? (
              <ScButton variant="outline" disabled={saving !== null} onPress={() => void save('radius', { pickupRadiusKm: radiusKm })}>
                {saving === 'radius' ? 'Saving...' : 'Save pickup distance'}
              </ScButton>
            ) : null}
          </>
        ) : null}
      </ScCard>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  section: { gap: 12 },
  part: { gap: 8 },
  divided: { borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 12 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  buttons: { flexDirection: 'row', gap: 8 },
});
