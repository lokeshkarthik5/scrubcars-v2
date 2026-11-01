import { Platform, View } from 'react-native';

import type { AppConfigAnswer } from '@/lib/app-config';
import { APP_VERSION } from '@/lib/app-config';
import { openLink } from '@/lib/open-link';
import { createStyles, useColors } from '@repo/native-ui/theme';

import { AuthStage } from '@repo/native-ui/auth-stage';
import { ScButton } from '@repo/native-ui/button';
import { BrandMark } from '@repo/native-ui/primitives';
import { T } from '@repo/native-ui/text';

/** Native only (frame J): a website updates itself. The sign-in stage, card and red button. */
export function UpdateRequired({ answer }: { answer: AppConfigAnswer }) {
  return (
    <AuthStage footer={answer.minVersion ? <VersionLine minVersion={answer.minVersion} /> : undefined}>
      <UpdateBody storeUrl={answer.storeUrl} />
    </AuthStage>
  );
}

// AuthStage keeps its own (dark) theme, so what goes inside it reads the colours there, not here.
function VersionLine({ minVersion }: { minVersion: string }) {
  const colors = useColors();
  const styles = useStyles();
  return (
    <T num size={12} lh={16} color={colors.textMuted} align="center" style={styles.legal}>
      {`Your version ${APP_VERSION} · needed ${minVersion}`}
    </T>
  );
}

function UpdateBody({ storeUrl }: { storeUrl: AppConfigAnswer['storeUrl'] }) {
  const colors = useColors();
  const styles = useStyles();
  const store = storeUrl;
  return (
    <>
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
    </>
  );
}

const useStyles = createStyles(() => ({
  center: { alignItems: 'center' },
  title: { marginTop: 24 },
  sub: { marginTop: 8, maxWidth: 240 },
  button: { marginTop: 32 },
  legal: { paddingBottom: 8 },
}));
