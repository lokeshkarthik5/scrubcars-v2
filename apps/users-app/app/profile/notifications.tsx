import { setPushPreferences } from '@repo/core/api/push';
import { ScButton } from '@repo/native-ui/button';
import { ScSwitch } from '@repo/native-ui/chip';
import { IconBellOff } from '@repo/native-ui/icons';
import { EmptyState, ScCard } from '@repo/native-ui/primitives';
import { T } from '@repo/native-ui/text';
import { createStyles, useColors } from '@repo/native-ui/theme';
import { toast } from '@repo/native-ui/toast';
import { type Href, router } from 'expo-router';
import { useState } from 'react';
import { Linking, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PageHeader } from '@/components/page-header';
import { useAuth } from '@/lib/auth';
import { usePushDevice } from '@/lib/push-device';

type Switches = { bookingUpdates: boolean; reminders: boolean };

const SWITCHES: { key: keyof Switches; title: string; description: string }[] = [
  { key: 'bookingUpdates', title: 'Booking updates', description: 'Accepted, other times suggested, extra work, your car on its way back, refunds' },
  { key: 'reminders', title: 'Reminders', description: 'The evening before a booking, and about an hour before it' },
];

/** apps/users/app/profile/notifications/page.tsx, with the phone's own permission box. */
export default function NotificationsScreen() {
  const colors = useColors();
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const user = useAuth((s) => s.user);
  const device = usePushDevice();
  const [saved, setSaved] = useState<Switches | null>(null);
  const switches: Switches = saved ?? { bookingUpdates: device.bookingUpdates, reminders: device.reminders };
  const [saving, setSaving] = useState<keyof Switches | null>(null);

  const setSwitch = async (key: keyof Switches, on: boolean) => {
    const before = switches;
    setSaved({ ...switches, [key]: on });
    setSaving(key);
    try {
      setSaved(await setPushPreferences({ [key]: on }));
    } catch {
      setSaved(before);
      toast.error("Couldn't save that. Try again.");
    } finally {
      setSaving(null);
    }
  };

  return (
    <View style={[styles.page, { paddingTop: insets.top }]}>
      <PageHeader title="Notifications" backTo="/profile" />
      {!user ? (
        <View style={styles.center}>
          <T size={15} weight={600} align="center">
            Sign in to set up notifications
          </T>
          <ScButton variant="main" fullWidth={false} paddingX={32} onPress={() => router.push(`/login?next=${encodeURIComponent('/profile/notifications')}` as Href)}>
            Sign in
          </ScButton>
        </View>
      ) : device.loaded && device.enabled === false ? (
        <View style={styles.center}>
          <EmptyState icon={<IconBellOff size={32} stroke={1.5} color={colors.textSecondary} />} title="Notifications aren't available yet" subtitle="Everything about your bookings is in Updates." />
          <ScButton variant="outline" fullWidth={false} onPress={() => router.push('/updates' as Href)}>
            Open Updates
          </ScButton>
        </View>
      ) : (
        <ScrollView contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + 24 }]}>
          <ScCard style={styles.device}>
            <View style={styles.deviceRow}>
              <View style={styles.grow}>
                <T size={15} weight={500} lh={20}>
                  This phone
                </T>
                <T size={12} lh={16} color={colors.textSecondary}>
                  News about your bookings, even with Detlio closed
                </T>
              </View>
              <ScSwitch
                label="Notifications on this phone"
                checked={device.subscribed}
                disabled={device.busy || (device.denied && !device.subscribed)}
                onChange={(on) => void (on ? device.turnOn() : device.turnOff())}
              />
            </View>
            {device.subscribed && device.devices !== null && device.devices > 1 ? (
              <T size={12} lh={16} color={colors.textSecondary}>
                {`Also on for ${device.devices - 1} other ${device.devices === 2 ? 'device' : 'devices'}`}
              </T>
            ) : null}
            {device.denied ? (
              <View style={styles.denied}>
                <T size={12} lh={16} color={colors.warning}>
                  Notifications are blocked for Detlio in this phone’s settings.
                </T>
                <ScButton variant="outline" height={44} onPress={() => void Linking.openSettings()}>
                  Open settings
                </ScButton>
              </View>
            ) : null}
          </ScCard>
          {device.enabled ? (
            <View style={styles.kinds}>
              <T size={14} weight={600} lh={20}>
                What to send
              </T>
              <ScCard style={styles.list}>
                {SWITCHES.map((item, index) => (
                  <View key={item.key} style={[styles.switchRow, index > 0 && styles.divided]}>
                    <View style={styles.grow}>
                      <T size={13} lh={18}>
                        {item.title}
                      </T>
                      <T size={11} lh={15} color={colors.textSecondary}>
                        {item.description}
                      </T>
                    </View>
                    <ScSwitch label={item.title} checked={switches[item.key]} disabled={saving !== null} onChange={(on) => void setSwitch(item.key, on)} />
                  </View>
                ))}
              </ScCard>
              <T size={11} lh={15} color={colors.textMuted}>
                {"For every device you turn notifications on for. A notification says the garage, the service and the time, never your number or address. Your bookings' news is in Updates too."}
              </T>
            </View>
          ) : null}
        </ScrollView>
      )}
    </View>
  );
}

const useStyles = createStyles((c) => ({
  page: { flex: 1, backgroundColor: c.canvas },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, paddingHorizontal: 16 },
  body: { paddingHorizontal: 16, paddingTop: 8, gap: 16 },
  device: { gap: 12 },
  deviceRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  denied: { gap: 8 },
  grow: { flex: 1, minWidth: 0 },
  kinds: { gap: 8 },
  list: { paddingHorizontal: 0, paddingVertical: 4 },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 8 },
  divided: { borderTopWidth: 1, borderTopColor: c.border },
}));
