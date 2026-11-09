import { useT } from '@repo/core/i18n';
import type { VehicleType } from '@repo/core/types';
import { VEHICLE_TIERS } from '@repo/core/vehicles';
import { Chip } from '@repo/native-ui/chip';
import { ScInput } from '@repo/native-ui/inputs';
import { T } from '@repo/native-ui/text';
import { createStyles, useColors } from '@repo/native-ui/theme';
import { View } from 'react-native';

import type { DraftCar } from '@/lib/booking-draft';

/** GuestCarForm (apps/users/components/checkout/guest-car.tsx). */
export function GuestCarForm({ car, onChange }: { car: DraftCar | null; onChange: (car: DraftCar) => void }) {
  const t = useT();
  const colors = useColors();
  const styles = useStyles();
  const current: DraftCar = car ?? { vehicleType: 'sedan', make: '', model: '' };
  const typeChosen = car !== null;
  return (
    <View style={styles.form}>
      <View>
        <T size={13} lh={18} color={colors.textSecondary} style={styles.typeLabel}>
          {t('Body type — it sets the price')}
        </T>
        <View style={styles.chips}>
          {VEHICLE_TIERS.map((tier) => (
            <Chip
              key={tier.value}
              label={t(tier.label)}
              selected={typeChosen && current.vehicleType === tier.value}
              onPress={() => onChange({ ...current, vehicleType: tier.value as VehicleType })}
            />
          ))}
        </View>
      </View>
      <View style={styles.row}>
        <View style={styles.half}>
          <ScInput
            label={t('Make')}
            placeholder={t('e.g. Maruti')}
            autoComplete="off"
            autoCorrect={false}
            maxLength={100}
            value={current.make}
            onChangeText={(make) => onChange({ ...current, make })}
          />
        </View>
        <View style={styles.half}>
          <ScInput
            label={t('Model')}
            placeholder={t('e.g. Swift')}
            autoComplete="off"
            autoCorrect={false}
            maxLength={100}
            value={current.model}
            onChangeText={(model) => onChange({ ...current, model })}
          />
        </View>
      </View>
    </View>
  );
}

const useStyles = createStyles(() => ({
  form: { gap: 12 },
  typeLabel: { marginBottom: 8 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  row: { flexDirection: 'row', gap: 8 },
  half: { flex: 1, minWidth: 0 },
}));
