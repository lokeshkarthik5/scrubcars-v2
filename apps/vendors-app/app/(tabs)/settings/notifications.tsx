import { type Href, router } from 'expo-router';
import { Linking, StyleSheet, View } from 'react-native';

import { AppShell, garageScreen } from '@/components/app-shell';
import { ScButton } from '@repo/native-ui/button';
import { IconBellOff, IconDeviceMobile } from '@repo/native-ui/icons';
import { EmptyState, Notice, ScCard, Skeleton, StatusChip } from '@repo/native-ui/primitives';
import { ScSwitch, TopBar } from '@/components/rows';
import { T } from '@repo/native-ui/text';
import { useAuth, useIsVendorAdmin } from '@/lib/auth';
import { usePushDevice } from '@/lib/push-device';
import { colors } from '@/lib/theme';

const WHAT_YOU_GET = [
  'A new booking, with how long you have to accept it',
  'A reminder 10 minutes before the time to accept runs out',
  'The customer picked one of your times, or none of them',
  'Extra work paid for or declined',
  'A booking cancelled or moved by the customer',
];

/**
 * apps/vendors/app/settings/notifications/page.tsx: alerts on this phone, for every
 * seat. No "Send me a test notification": the API's test route takes a browser's
 * endpoint, and PR #102 has none for a phone.
 */
function NotificationsScreen() {
  const isAdmin = useIsVendorAdmin();
  const vendor = useAuth((s) => s.vendor);
  const device = usePushDevice();

  return (
    <AppShell>
      <TopBar title="Notifications" onBack={() => router.navigate((isAdmin ? '/settings' : '/home') as Href)} />

      {device.loaded && device.enabled === false ? (
        <>
          <EmptyState
            icon={<IconBellOff size={32} stroke={1.5} color={colors.textMuted} />}
            title="Notifications aren't available yet"
            subtitle="New bookings show on Home and Bookings."
          />
          <ScButton variant="cta" onPress={() => router.navigate('/bookings' as Href)}>
            Open Bookings
          </ScButton>
        </>
      ) : (
        <>
          {device.loaded ? (
            <View accessibilityLiveRegion="polite" style={styles.status}>
              <T size={16}>New-booking alerts on this phone:</T>
              <StatusChip tone={device.subscribed ? 'done' : 'attention'} size="md">
                {device.subscribed ? 'On' : 'Off'}
              </StatusChip>
            </View>
          ) : null}

          {!device.loaded ? (
            <Skeleton height={88} />
          ) : device.enabled === null ? (
            <Notice tone="neutral" title="Couldn't load your notification settings">
              Check your connection and open this page again.
            </Notice>
          ) : (
            <View style={styles.cards}>
              <ScCard style={styles.card}>
                <View style={styles.row}>
                  <View style={styles.tile}>
                    <IconDeviceMobile size={18} />
                  </View>
                  <View style={styles.flex}>
                    <T size={13} weight={600}>
                      Notifications on this device
                    </T>
                    <T size={11} color={colors.textSecondary}>
                      {vendor?.businessName
                        ? `New bookings for ${vendor.businessName}, even with the app closed`
                        : 'New bookings, even with the app closed'}
                    </T>
                  </View>
                  <ScSwitch
                    label="Notifications on this device"
                    checked={device.subscribed}
                    disabled={device.busy || (device.support === 'denied' && !device.subscribed)}
                    onChange={(on) => void (on ? device.turnOn() : device.turnOff())}
                  />
                </View>
                {device.devices > 1 ? (
                  <T size={11} color={colors.textMuted}>
                    {'Also on for '}
                    <T num size={11} color={colors.textMuted}>
                      {device.devices - 1}
                    </T>
                    {` other ${device.devices === 2 ? 'device' : 'devices'}.`}
                  </T>
                ) : null}
              </ScCard>
              {!device.subscribed && device.support === 'denied' ? (
                <>
                  <Notice title="Notifications are blocked for this app">
                    Allow them in your phone&apos;s settings, then come back to this page.
                  </Notice>
                  <ScButton variant="outline" onPress={() => void Linking.openSettings()}>
                    Open Settings
                  </ScButton>
                </>
              ) : null}
            </View>
          )}

          <View style={styles.get}>
            <T accessibilityRole="header" size={14} weight={600}>
              {"What you'll get"}
            </T>
            <View style={styles.lines}>
              {WHAT_YOU_GET.map((line) => (
                <View key={line} style={styles.line}>
                  <T size={14} color={colors.textMuted}>
                    ·
                  </T>
                  <T size={14} color={colors.textSecondary} style={styles.flex}>
                    {line}
                  </T>
                </View>
              ))}
            </View>
            <T size={13} color={colors.textSecondary}>
              {"Turn it on for each phone or computer at the garage. A notification never shows the customer's number or address: open the job for those."}
            </T>
          </View>
        </>
      )}
    </AppShell>
  );
}

export default garageScreen(NotificationsScreen);

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  status: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 },
  cards: { gap: 12 },
  card: { gap: 12 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  tile: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: colors.surfaceElevated,
    alignItems: 'center',
    justifyContent: 'center',
  },
  get: { gap: 8 },
  lines: { gap: 6 },
  line: { flexDirection: 'row', gap: 8 },
});
