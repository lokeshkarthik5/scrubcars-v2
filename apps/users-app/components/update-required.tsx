import { useT } from '@repo/core/i18n';
import { AuthStage } from '@repo/native-ui/auth-stage';
import { ScButton } from '@repo/native-ui/button';
import { BrandMark } from '@repo/native-ui/primitives';
import { T } from '@repo/native-ui/text';
import { useColors } from '@repo/native-ui/theme';
import { Platform, StyleSheet, View } from 'react-native';

import type { AppConfigAnswer } from '@/lib/app-config';
import { APP_VERSION } from '@/lib/app-config';
import { openLink } from '@/lib/open-link';

function Body({ answer }: { answer: AppConfigAnswer }) {
  const t = useT();
  const colors = useColors();
  const store = answer.storeUrl;
  return (
    <>
      <View style={styles.center}>
        <BrandMark height={36} />
        <T accessibilityRole="header" size={28} weight={700} lh={36} tracking={-0.02} align="center" style={styles.title}>
          {t('Update Detlio to keep going')}
        </T>
        <T size={16} lh={24} color={colors.textSecondary} align="center" style={styles.sub}>
          {t('This version no longer works with Detlio.')}
        </T>
      </View>
      {store ? (
        <View style={styles.button}>
          <ScButton variant="cta" onPress={() => openLink(store)}>
            {Platform.OS === 'android' ? t('Open Google Play') : t('Open the App Store')}
          </ScButton>
        </View>
      ) : null}
    </>
  );
}

function VersionLine({ needed }: { needed: string }) {
  const t = useT();
  const colors = useColors();
  return (
    <T num size={12} lh={16} color={colors.textMuted} align="center" style={styles.legal}>
      {t('Your version {version} · needed {needed}', { version: APP_VERSION, needed })}
    </T>
  );
}

/** Native only: a website updates itself. The sign-in stage, card and red button. */
export function UpdateRequired({ answer }: { answer: AppConfigAnswer }) {
  return (
    <AuthStage
      footer={
        answer.minVersion ? (
          <VersionLine needed={answer.minVersion} />
        ) : undefined
      }
    >
      <Body answer={answer} />
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
