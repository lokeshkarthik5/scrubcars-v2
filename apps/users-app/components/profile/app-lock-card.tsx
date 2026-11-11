import { useT } from '@repo/core/i18n';
import { ScSwitch } from '@repo/native-ui/chip';
import { ScCard } from '@repo/native-ui/primitives';
import { T } from '@repo/native-ui/text';
import { useColors } from '@repo/native-ui/theme';
import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { appLock, askToUnlock, lockOffered } from '@/lib/app-lock';

/** Profile's optional lock. Nothing is shown on a phone with no face or finger set up. */
export function AppLockCard() {
  const t = useT();
  const colors = useColors();
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
    <ScCard style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
      <View style={{ flex: 1, minWidth: 0 }}>
        <T size={14} weight={600} lh={20}>
          {t('Lock with Face ID or fingerprint')}
        </T>
        <T size={12} lh={16} color={colors.textSecondary}>
          {t('Asks each time Detlio opens on this phone. Off unless you turn it on.')}
        </T>
      </View>
      <ScSwitch label={t('Lock with Face ID or fingerprint')} checked={on} onChange={(next) => void change(next)} />
    </ScCard>
  );
}
