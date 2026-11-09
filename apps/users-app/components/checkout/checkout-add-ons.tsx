import { ADD_ON_LIMITS, addOnTimeLabel } from '@repo/core/add-ons';
import type { AddOn } from '@repo/core/api/add-ons';
import { useT } from '@repo/core/i18n';
import type { VehicleType } from '@repo/core/types';
import { HubCard } from '@repo/native-ui/primitives';
import { Figures, T } from '@repo/native-ui/text';
import { createStyles, useColors } from '@repo/native-ui/theme';
import { View } from 'react-native';

import { RedLightAdd } from '@/components/garage/red-light-add';
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
  const t = useT();
  const colors = useColors();
  const styles = useStyles();
  return (
    <View style={styles.section}>
      <T variant="t2">{t('Add-ons')}</T>
      <T size={13} lh={18} color={colors.dim}>
        {t("Optional. They go with the services you've chosen.")}
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
              {/* The garage page's red-light Add (§6), without the dot: there is no bar to fly to. */}
              <RedLightAdd name={addOn.name} added={added} disabled={full} fly={false} onToggle={() => onToggle(addOn.id)} />
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
}));
