import { ScButton } from '@repo/native-ui/button';
import { BrandMark } from '@repo/native-ui/primitives';
import { T } from '@repo/native-ui/text';
import { createStyles, ThemeScope, useColors } from '@repo/native-ui/theme';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';

import { askToUnlock, lockOnLaunch } from '@/lib/app-lock';
import { useT } from '@repo/core/i18n';

/**
 * Nothing below it runs, the session included, until it opens: the optional Face ID or
 * fingerprint lock, asked once at launch. It is always dark, like sign-in.
 */
export function AppLockGate({ onOpen }: { onOpen: () => void }) {
  const [locked, setLocked] = useState(false);
  const unlock = useCallback(async () => {
    if (await askToUnlock()) onOpen();
  }, [onOpen]);
  useEffect(() => {
    void lockOnLaunch().then((decision) => {
      if (decision === 'open') {
        onOpen();
        return;
      }
      setLocked(true);
      void SplashScreen.hideAsync();
      void unlock();
    });
    // Once, at launch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  if (!locked) return null;
  return (
    <ThemeScope scheme="dark">
      <Locked onUnlock={() => void unlock()} />
    </ThemeScope>
  );
}

function Locked({ onUnlock }: { onUnlock: () => void }) {
  const t = useT();
  const colors = useColors();
  const styles = useStyles();
  return (
    <View style={styles.page}>
      <StatusBar style="light" />
      <BrandMark height={32} />
      <T size={15} lh={22} align="center" color={colors.textSecondary}>
        {t('Detlio for Garages is locked on this phone.')}
      </T>
      <ScButton variant="main" fullWidth={false} paddingX={32} onPress={onUnlock}>
        {t('Unlock')}
      </ScButton>
    </View>
  );
}

const useStyles = createStyles((colors) => ({
  page: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
    backgroundColor: colors.canvas,
    paddingHorizontal: 24,
  },
}));
