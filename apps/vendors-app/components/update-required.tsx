import { Platform, StyleSheet, View } from 'react-native';

import type { AppConfigAnswer } from '@/lib/app-config';
import { APP_VERSION } from '@/lib/app-config';
import { openLink } from '@/lib/open-link';
import { colors } from '@/lib/theme';

import { AuthStage } from './auth-stage';
import { ScButton } from './button';
import { BrandMark } from './primitives';
import { T } from './text';

/** Native only (frame J): a website updates itself. The sign-in stage, card and red button. */
export function UpdateRequired({ answer }: { answer: AppConfigAnswer }) {
  const store = answer.storeUrl;
  return (
    <AuthStage
      footer={
        answer.minVersion ? (
          <T num size={12} lh={16} color={colors.textMuted} align="center" style={styles.legal}>
            {`Your version ${APP_VERSION} · needed ${answer.minVersion}`}
          </T>
        ) : undefined
      }
    >
      <View style={styles.center}>
        <BrandMark height={36} />
        <T accessibilityRole="header" size={28} weight={700} lh={36} tracking={-0.02} align="center" style={styles.title}>
          Update Detlio for Garages to keep going
        </T>
        <T size={16} lh={24} color={colors.textSecondary} align="center" style={styles.sub}>
          This version no longer works with Detlio.
        </T>
      </View>
      {store ? (
        <View style={styles.button}>
          <ScButton variant="cta" onPress={() => openLink(store)}>
            {Platform.OS === 'android' ? 'Open Google Play' : 'Open the App Store'}
          </ScButton>
        </View>
      ) : null}
    </AuthStage>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: 'center' },
  title: { marginTop: 24 },
  sub: { marginTop: 8, maxWidth: 240 },
  button: { marginTop: 32 },
  legal: { paddingBottom: 8 },
});
