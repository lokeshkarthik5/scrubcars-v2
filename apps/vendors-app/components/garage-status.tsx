import { useNow } from '@repo/core/hooks/use-now';
import { openStatus } from '@repo/core/opening-hours';
import { useQuery } from '@tanstack/react-query';
import { type Href, router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { useAuth } from '@/lib/auth';
import { getVendorClosures, getVendorWorkingHours, getWorkingHours, usePushDevice } from '@/lib/garage-api';
import { colors } from '@/lib/theme';

import { IconBellOff } from './icons';
import { T } from './text';

/** Whether the garage is open now, from its own hours and holidays; null while unknown. */
function useShopOpen(): boolean | null {
  const vendorId = useAuth((s) => s.vendor?.id);
  const now = useNow(60_000);
  const hours = useQuery({
    queryKey: ['garage-hours', vendorId],
    enabled: Boolean(vendorId),
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const [weekly, closures] = await Promise.all([
        // The owner's own hours; an operator reads the public copy instead.
        getWorkingHours().catch(() => getVendorWorkingHours(vendorId!)),
        getVendorClosures(vendorId!).catch(() => [] as string[]),
      ]);
      return { weekly, closures };
    },
  });
  if (!hours.data) return null;
  return openStatus(hours.data.weekly, new Date(now), hours.data.closures)?.isOpen ?? null;
}

/** GarageStatus: beside the wordmark, which garage, open or not, and "Alerts: Off". */
export function GarageStatus() {
  const vendor = useAuth((s) => s.vendor);
  const vendorCount = useAuth((s) => s.vendors.length);
  const device = usePushDevice();
  const open = useShopOpen();

  if (!vendor) return null;
  const alertsOff = device.loaded && device.enabled && !device.subscribed;

  return (
    <View style={styles.column}>
      <View style={styles.row}>
        {open !== null ? (
          <View style={[styles.dot, { backgroundColor: open ? colors.success : colors.textMuted }]} />
        ) : null}
        <T size={14} weight={500} color={colors.textSecondary} numberOfLines={1} style={styles.name}>
          {vendorCount > 1 ? '' : vendor.businessName}
          {open !== null ? `${vendorCount > 1 ? '' : ' · '}${open ? 'Open' : 'Closed'}` : ''}
        </T>
      </View>
      {alertsOff ? (
        <Pressable
          accessibilityRole="link"
          hitSlop={{ top: 12, bottom: 12 }}
          onPress={() => router.push('/settings/notifications' as Href)}
          style={styles.alerts}
        >
          <IconBellOff size={14} color={colors.warning} />
          <T size={13} weight={500} color={colors.warning}>
            Alerts: Off
          </T>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  column: { alignItems: 'flex-end', gap: 2, minWidth: 0 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 6, minWidth: 0 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  name: { flexShrink: 1 },
  alerts: { flexDirection: 'row', alignItems: 'center', gap: 4 },
});
