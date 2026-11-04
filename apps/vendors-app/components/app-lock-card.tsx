import { ScSwitch } from '@repo/native-ui/chip';
import { ScCard } from '@repo/native-ui/primitives';
import { T } from '@repo/native-ui/text';
import { createStyles, useColors } from '@repo/native-ui/theme';
import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { appLock, askToUnlock, lockOffered } from '@/lib/app-lock';

/**
 * The optional lock, under Appearance in Settings > Account and on Your account (every seat
 * reaches one of them). Nothing is shown on a phone with no face or finger set up.
 */
export function AppLockCard() {
  const colors = useColors();
  const styles = useStyles();
  const [offered, setOffered] = useState(false);
  const [on, setOn] = useState(() => appLock.enabled());
  useEffect(() => {
    void lockOffered().then(setOffered);
  }, []);
  if (!offered) return null;
  const change = async (next: boolean) => {
    // Proving it's them first, on the way in and out.
    if (!(await askToUnlock())) return;
    appLock.set(next);
    setOn(next);
  };
  return (
    <ScCard style={styles.card}>
      <View style={styles.text}>
        <T size={14} weight={600} lh={20}>
          Lock with Face ID or fingerprint
        </T>
        <T size={12} lh={16} color={colors.textSecondary}>
          Asks each time Detlio opens on this phone. Off unless you turn it on.
        </T>
      </View>
      <ScSwitch label="Lock with Face ID or fingerprint" checked={on} onChange={(next) => void change(next)} />
    </ScCard>
  );
}

const useStyles = createStyles(() => ({
  card: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  text: { flex: 1, minWidth: 0 },
}));
