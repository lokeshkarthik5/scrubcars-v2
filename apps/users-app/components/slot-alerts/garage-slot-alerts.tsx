import { useCancelSlotAlert, useSlotAlerts } from '@repo/core/api/hooks/use-slot-alerts';
import { slotAlertSummary } from '@repo/core/slot-alerts';
import { IconBell } from '@repo/native-ui/icons';
import { ScCard } from '@repo/native-ui/primitives';
import { T } from '@repo/native-ui/text';
import { createStyles, useColors } from '@repo/native-ui/theme';
import { type Href, router } from 'expo-router';
import { Pressable, View } from 'react-native';

import { useAuth } from '@/lib/auth';

/** GarageSlotAlerts: the days the customer is waiting on here. */
export function GarageSlotAlerts({ vendorId }: { vendorId: string }) {
  const colors = useColors();
  const styles = useStyles();
  const user = useAuth((s) => s.user);
  const alerts = useSlotAlerts({ enabled: !!user });
  const cancel = useCancelSlotAlert();
  const here = (alerts.data?.items ?? []).filter((alert) => alert.vendorId === vendorId);
  if (!user || here.length === 0) return null;
  return (
    <ScCard style={styles.card} accessibilityLabel="Your slot alerts here">
      <IconBell size={18} stroke={1.6} color={colors.textSecondary} />
      <View style={styles.grow}>
        <T size={13} weight={500} lh={18}>
          Waiting for a slot
        </T>
        <View style={styles.list}>
          {here.map((alert) => (
            <View key={alert.id} style={styles.row}>
              <T size={12} lh={16} color={colors.textSecondary} style={styles.grow}>
                {slotAlertSummary(alert)}
              </T>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Stop waiting for ${slotAlertSummary(alert)}`}
                disabled={cancel.isPending}
                onPress={() => cancel.mutate(alert.id)}
                hitSlop={14}
              >
                <T size={12} weight={500} lh={16} style={styles.underline}>
                  Stop waiting
                </T>
              </Pressable>
            </View>
          ))}
        </View>
        <T size={12} lh={16} color={colors.textSecondary} accessibilityRole="link" style={[styles.underline, styles.all]} onPress={() => router.push('/profile/slot-alerts' as Href)}>
          All slot alerts
        </T>
      </View>
    </ScCard>
  );
}

const useStyles = createStyles(() => ({
  card: { flexDirection: 'row', gap: 12 },
  grow: { flex: 1, minWidth: 0 },
  list: { marginTop: 4, gap: 4 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  underline: { textDecorationLine: 'underline' },
  all: { marginTop: 4 },
}));
