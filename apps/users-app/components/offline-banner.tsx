import { useT } from '@repo/core/i18n';
import { T } from '@repo/native-ui/text';
import { createStyles, useColors } from '@repo/native-ui/theme';
import { useNetworkState } from 'expo-network';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

/** Not on the web, which has per-screen errors only; the checklist's addition for a phone. */
export function OfflineBanner() {
  const t = useT();
  const colors = useColors();
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const { isInternetReachable, isConnected } = useNetworkState();
  if (isConnected !== false && isInternetReachable !== false) return null;
  return (
    <View accessibilityLiveRegion="polite" pointerEvents="none" style={[styles.banner, { top: insets.top + 4 }]}>
      <T size={12} weight={500} lh={16} color={colors.textPrimary} align="center">
        {t("You're offline. Showing what's already on your phone.")}
      </T>
    </View>
  );
}

const useStyles = createStyles((c) => ({
  banner: { position: 'absolute', left: 16, right: 16, borderRadius: 10, borderWidth: 1, borderColor: c.border, backgroundColor: c.surfaceElevated, paddingHorizontal: 12, paddingVertical: 6 },
}));
