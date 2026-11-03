import { ADD_ON_LIMITS, addOnTimeLabel } from '@repo/core/add-ons';
import type { AddOn } from '@repo/core/api/add-ons';
import type { VehicleType } from '@repo/core/types';
import { IconCheck, IconPlus } from '@repo/native-ui/icons';
import { HubCard } from '@repo/native-ui/primitives';
import { Figures, T } from '@repo/native-ui/text';
import { createStyles, useColors } from '@repo/native-ui/theme';
import { Pressable, View } from 'react-native';

import { servicePriceText } from '@/lib/price';

/** Checkout's Add-ons, right under "Your booking" (PR #107's checkout-add-ons.tsx, frame D). */
export function CheckoutAddOns({
  addOns,
  picked,
  vehicleType,
  onToggle,
}: {
  addOns: readonly AddOn[];
  picked: readonly string[];
  vehicleType: VehicleType | undefined;
  onToggle: (addOnId: string) => void;
}) {
  const colors = useColors();
  const styles = useStyles();
  return (
    <View style={styles.section}>
      <T size={17} weight={500} lh={24}>
        Add-ons
      </T>
      <T size={13} lh={18} color={colors.dim}>
        {"Optional. They go with the services you've chosen."}
      </T>
      <HubCard style={styles.card}>
        {addOns.map((addOn, index) => {
          const added = picked.includes(addOn.id);
          const full = !added && picked.length >= ADD_ON_LIMITS.perBooking;
          return (
            <View key={addOn.id} style={[styles.row, index > 0 && styles.divided]}>
              <View style={styles.grow}>
                <T size={15} lh={20}>
                  {addOn.name}
                </T>
                <T size={13} lh={18} color={colors.textSecondary} style={styles.sub}>
                  <Figures size={13} text={`${servicePriceText(addOn as never, vehicleType)} · ${addOnTimeLabel(addOn.extraMins)}`} />
                </T>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ selected: added, disabled: full }}
                accessibilityLabel={added ? `Remove ${addOn.name} from booking` : `Add ${addOn.name} to booking`}
                disabled={full}
                onPress={() => onToggle(addOn.id)}
                style={[styles.toggle, added ? styles.on : styles.off, full && styles.dim]}
              >
                {added ? <IconCheck size={15} color={colors.textPrimary} /> : <IconPlus size={15} color={colors.textPrimary} />}
                <T size={13} weight={500} lh={18}>
                  {added ? 'Added' : 'Add'}
                </T>
              </Pressable>
            </View>
          );
        })}
      </HubCard>
    </View>
  );
}

const useStyles = createStyles((c) => ({
  section: { gap: 8 },
  card: { paddingHorizontal: 16 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, paddingVertical: 12 },
  divided: { borderTopWidth: 1, borderTopColor: c.line },
  grow: { flex: 1, minWidth: 0 },
  sub: { marginTop: 2 },
  toggle: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 999, borderWidth: 1, paddingHorizontal: 16 },
  on: { borderColor: c.textPrimary },
  off: { borderColor: c.stroke },
  dim: { opacity: 0.5 },
}));
