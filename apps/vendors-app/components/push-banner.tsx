import { type Href, router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { devicePrefs } from '@/lib/device-prefs';
import { usePushDevice } from '@/lib/push-device';
import { colors } from '@/lib/theme';

import { ScButton } from '@repo/native-ui/button';
import { IconBell, IconX } from '@repo/native-ui/icons';
import { T } from '@repo/native-ui/text';

/** A close is "not now", never "never": it comes back a week later while alerts are off. */
const SNOOZED_AT_KEY = 'detlio.pushBannerSnoozedAt';
const SNOOZE_MS = 7 * 24 * 60 * 60 * 1000;

function snoozed(): boolean {
  const at = Number(devicePrefs.getItem(SNOOZED_AT_KEY));
  return Number.isFinite(at) && at > 0 && Date.now() - at < SNOOZE_MS;
}

/** PushBanner: until this phone has alerts on, for every seat. */
export function PushBanner() {
  const device = usePushDevice();
  const [hidden, setHidden] = useState(snoozed);

  if (hidden || !device.loaded || !device.enabled || device.subscribed) return null;

  return (
    <View accessibilityLabel="New-booking alerts" style={styles.banner}>
      <IconBell size={22} />
      <T size={15} lh={21} color={colors.textSecondary} style={styles.text}>
        <T size={15} lh={21} weight={600}>
          Booking alerts are off
        </T>{' '}
        on this phone
      </T>
      {device.support === 'supported' ? (
        <ScButton
          variant="outline"
          fullWidth={false}
          backgroundColor={colors.textPrimary}
          labelColor={colors.brandBlack}
          disabled={device.busy}
          style={styles.turnOn}
          onPress={() => void device.turnOn()}
        >
          Turn on
        </ScButton>
      ) : (
        <Pressable
          accessibilityRole="link"
          onPress={() => router.push('/settings/notifications' as Href)}
          style={styles.why}
        >
          <T size={15} weight={600} style={styles.underline}>
            Why
          </T>
        </Pressable>
      )}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Not now"
        onPress={() => {
          devicePrefs.setItem(SNOOZED_AT_KEY, String(Date.now()));
          setHidden(true);
        }}
        style={styles.close}
      >
        <IconX size={18} color={colors.textMuted} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingVertical: 8,
    paddingLeft: 16,
    paddingRight: 8,
  },
  text: { flex: 1, minWidth: 0 },
  turnOn: { flexShrink: 0 },
  why: { minHeight: 48, justifyContent: 'center', paddingHorizontal: 12 },
  underline: { textDecorationLine: 'underline' },
  close: { width: 44, height: 44, marginLeft: -4, alignItems: 'center', justifyContent: 'center' },
});
