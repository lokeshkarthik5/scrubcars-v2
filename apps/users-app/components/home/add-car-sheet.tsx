import { createVehicle } from '@repo/core/api/users';
import { useUserStore } from '@repo/core/stores/user-store';
import type { Vehicle, VehicleType } from '@repo/core/types';
import { VEHICLE_TIERS } from '@repo/core/vehicles';
import { ScButton } from '@repo/native-ui/button';
import { ScInput } from '@repo/native-ui/inputs';
import { ScSheet } from '@repo/native-ui/sheet';
import { T } from '@repo/native-ui/text';
import { createStyles, useColors } from '@repo/native-ui/theme';
import { toast } from '@repo/native-ui/toast';
import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { errorText } from '@/lib/error-text';

const EMPTY = { make: '', model: '', licensePlate: '', vehicleType: 'sedan' as VehicleType };

/** AddCarSheet (packages/ui/src/features/add-car-sheet.tsx): a car, without leaving the screen. */
export function AddCarSheet({ open, onClose, onAdded }: { open: boolean; onClose: () => void; onAdded?: (vehicle: Vehicle) => void }) {
  const colors = useColors();
  const styles = useStyles();
  const [form, setForm] = useState(EMPTY);
  const vehicles = useUserStore((s) => s.vehicles);

  const save = useMutation({
    mutationFn: () =>
      createVehicle({
        make: form.make.trim(),
        model: form.model.trim(),
        licensePlate: form.licensePlate.trim() || undefined,
        vehicleType: form.vehicleType,
        // The first car is the default; later ones can't silently re-point everything.
        isDefault: vehicles.length === 0,
      }),
    onSuccess: (created) => {
      useUserStore.setState((s) => ({ vehicles: [...s.vehicles, created] }));
      setForm(EMPTY);
      onAdded?.(created);
      onClose();
      toast.success('Car added');
    },
    onError: (error) => toast.error(errorText(error, 'Failed to add car')),
  });

  const isValid = form.make.trim().length > 0 && form.model.trim().length > 0;
  const close = () => {
    if (save.isPending) return;
    setForm(EMPTY);
    onClose();
  };

  return (
    <ScSheet open={open} onClose={close} dismissible={!save.isPending} accessibilityLabel="Add a car" horizontalPadding={16}>
      <T size={19} weight={600}>
        Add a car
      </T>
      <View style={styles.form}>
        <View style={styles.two}>
          <View style={styles.half}>
            <ScInput label="Make" placeholder="e.g. Maruti" autoCorrect={false} autoCapitalize="words" value={form.make} onChangeText={(make) => setForm({ ...form, make })} />
          </View>
          <View style={styles.half}>
            <ScInput label="Model" placeholder="e.g. Swift" autoCorrect={false} autoCapitalize="words" value={form.model} onChangeText={(model) => setForm({ ...form, model })} />
          </View>
        </View>
        <ScInput
          label="License plate (optional)"
          placeholder="e.g. TN 01 AB 1234"
          autoCapitalize="characters"
          autoCorrect={false}
          value={form.licensePlate}
          onChangeText={(text) => setForm({ ...form, licensePlate: text.toUpperCase() })}
        />
        <View>
          <T size={11} weight={500} color={colors.textSecondary} style={styles.typeLabel}>
            Type
          </T>
          <View style={styles.types}>
            {VEHICLE_TIERS.map((tier) => {
              const on = form.vehicleType === tier.value;
              return (
                <Pressable
                  key={tier.value}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: on }}
                  hitSlop={7}
                  onPress={() => setForm({ ...form, vehicleType: tier.value })}
                  style={[styles.type, on ? styles.typeOn : styles.typeOff]}
                >
                  <T size={12} weight={500} lh={18} color={on ? colors.chosenText : colors.textPrimary}>
                    {tier.label}
                  </T>
                </Pressable>
              );
            })}
          </View>
          <T size={11} color={colors.textMuted} style={styles.typeNote}>
            Pricing can differ by car type.
          </T>
        </View>
        <View style={styles.actions}>
          <ScButton variant="hero" disabled={!isValid || save.isPending} onPress={() => save.mutate()} style={styles.half}>
            {save.isPending ? 'Saving…' : 'Save car'}
          </ScButton>
          <ScButton variant="outline" disabled={save.isPending} onPress={close} style={styles.half}>
            Cancel
          </ScButton>
        </View>
      </View>
    </ScSheet>
  );
}

const useStyles = createStyles((c) => ({
  form: { marginTop: 16, gap: 12 },
  two: { flexDirection: 'row', gap: 8 },
  half: { flex: 1, minWidth: 0 },
  typeLabel: { marginBottom: 8 },
  types: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  type: { borderRadius: 6, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 6 },
  typeOn: { borderColor: c.chosenBg, backgroundColor: c.chosenBg },
  typeOff: { borderColor: c.border, backgroundColor: c.surface },
  typeNote: { marginTop: 8 },
  actions: { marginTop: 4, flexDirection: 'row', gap: 8 },
}));
