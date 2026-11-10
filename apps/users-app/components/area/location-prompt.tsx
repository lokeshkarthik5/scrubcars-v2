import { ScButton } from '@repo/native-ui/button';
import { IconMapPin, IconRoute, IconSparkles } from '@repo/native-ui/icons';
import { T } from '@repo/native-ui/text';
import { createStyles, useColors } from '@repo/native-ui/theme';
import { Linking, View } from 'react-native';

import { useCustomerPlace } from '@/lib/customer-place';
import { useLocationStore } from '@/lib/location';

const REASONS = [
  { icon: IconRoute, title: 'Real distances', body: 'See how far each garage actually is, not just its area.' },
  { icon: IconSparkles, title: 'Nearest first', body: 'Sort by what is closest instead of scrolling to find it.' },
  { icon: IconMapPin, title: 'Doorstep that reaches you', body: 'Only show garages that travel to your address.' },
];

/**
 * LocationPromptSheet's content: our words before the phone's. Only the wording about "your
 * browser" differs from the web: on a phone, it's the phone that asks and that blocks. It takes
 * over the area sheet rather than opening a second one: iOS drops a modal presented while
 * another is leaving.
 */
export function LocationPrompt({ onClose }: { onClose: () => void }) {
  const colors = useColors();
  const styles = useStyles();
  const requestGpsLocation = useLocationStore((s) => s.requestGpsLocation);
  const selectCity = useLocationStore((s) => s.selectCity);
  // The customer's city (0070): Chennai until they pick another.
  const { city } = useCustomerPlace();
  const locating = useLocationStore((s) => s.locating);
  const permission = useLocationStore((s) => s.permission);
  const dismiss = useLocationStore((s) => s.dismissPrompt);
  const blocked = permission === 'denied';

  const notNow = () => {
    dismiss();
    onClose();
  };

  return (
    <View style={styles.body}>
        <View style={styles.head}>
          <View style={styles.disc}>
            <IconMapPin size={24} />
          </View>
          <T size={20} lh={28} tracking={-0.015} align="center">
            {blocked ? 'Location is blocked' : 'Find garages near you'}
          </T>
          <T size={15} align="center" color={colors.textSecondary}>
            {blocked
              ? 'Your phone is blocking location for Detlio. You can turn it back on in Settings.'
              : 'Share your location and we’ll show the closest garages first, with real distances.'}
          </T>
        </View>
        {!blocked ? (
          <View style={styles.reasons}>
            {REASONS.map(({ icon: Icon, title, body }) => (
              <View key={title} style={styles.reason}>
                <View style={styles.reasonIcon}>
                  <Icon size={15} />
                </View>
                <View style={styles.reasonText}>
                  <T size={15} weight={500}>
                    {title}
                  </T>
                  <T size={13} color={colors.textSecondary}>
                    {body}
                  </T>
                </View>
              </View>
            ))}
          </View>
        ) : null}
        <View style={styles.actions}>
          {!blocked ? (
            <ScButton
              variant="main"
              disabled={locating}
              onPress={() => {
                void requestGpsLocation().finally(onClose);
              }}
            >
              {locating ? 'Finding you…' : 'Enable location'}
            </ScButton>
          ) : (
            <ScButton variant="outline" onPress={() => void Linking.openSettings()}>
              Open Settings
            </ScButton>
          )}
          <ScButton
            variant={blocked ? 'main' : 'outline'}
            onPress={() => {
              selectCity(city);
              onClose();
            }}
          >
            All of {city.name}
          </ScButton>
          {!blocked ? (
            <ScButton variant="text" onPress={notNow}>
              Not now
            </ScButton>
          ) : null}
        </View>
        {!blocked ? (
          <T size={12} align="center" color={colors.textMuted}>
            Enable location asks your phone. We only use it to sort garages — it is never shared.
          </T>
        ) : null}
    </View>
  );
}

const useStyles = createStyles((c) => ({
  body: { gap: 20, paddingHorizontal: 20, paddingBottom: 8, paddingTop: 4 },
  head: { alignItems: 'center', gap: 8 },
  disc: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', backgroundColor: c.surfaceElevated },
  reasons: { gap: 12 },
  reason: { flexDirection: 'row', gap: 12 },
  reasonIcon: { marginTop: 2, width: 28, height: 28, borderRadius: 9, alignItems: 'center', justifyContent: 'center', backgroundColor: c.surface },
  reasonText: { flex: 1, minWidth: 0 },
  actions: { gap: 8 },
}));
